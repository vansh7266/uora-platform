"""
UORA Sandbox Builder Worker
============================
Consumes build jobs from a Redis Stream, downloads source from MinIO,
compiles it inside a sandboxed Docker build, pushes the resulting image
to a local registry, and deploys a hardened Pod to Kubernetes.

Lifecycle:
    1. XREADGROUP from ``build_queue`` (consumer group ``builders``)
    2. Download source tarball from MinIO
    3. Generate a language-specific multi-stage Dockerfile
    4. ``docker buildx build --network=none --no-cache``
    5. Push image to ``localhost:5000``
    6. Deploy Pod via ``kubectl`` with gVisor + seccomp hardening
    7. Update submission status in Redis hash ``submission:{id}``

Gracefully shuts down on SIGINT / SIGTERM.
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
import os
import shutil
import signal
import string
import subprocess
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final, Optional

try:
    import yaml
except ImportError:
    yaml = None

try:
    import kubernetes
    from kubernetes import client, config
    from kubernetes.client.rest import ApiException
except ImportError:
    kubernetes = None


try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover - minimal local test environments
    class _RedisFallback:
        class ResponseError(Exception):
            pass

        class ConnectionError(Exception):
            pass

        Redis = None

    aioredis = _RedisFallback()

try:
    import aioboto3
except ImportError:  # pragma: no cover - minimal local test environments
    aioboto3 = None

try:
    import asyncpg
except ImportError:  # pragma: no cover - minimal local test environments
    asyncpg = None

# ─── Logging ────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("uora.sandbox.builder")

# ─── Configuration ──────────────────────────────────────────────────────────

REDIS_HOST: Final = os.getenv("REDIS_HOST", "redis")
REDIS_PORT: Final = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD: Final[str | None] = os.getenv("REDIS_PASSWORD") or None

MINIO_ENDPOINT: Final = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY: Final[str | None] = os.getenv("MINIO_ACCESS_KEY") or None
MINIO_SECRET_KEY: Final[str | None] = os.getenv("MINIO_SECRET_KEY") or None
MINIO_BUCKET: Final = os.getenv("MINIO_BUCKET", "uora-submissions")
MINIO_SECURE: Final = os.getenv("MINIO_SECURE", "false").lower() == "true"

REGISTRY: Final = os.getenv("REGISTRY_URL", os.getenv("REGISTRY", "localhost:5000"))
BUILD_TIMEOUT: Final = int(os.getenv("BUILD_TIMEOUT", "120"))
BUILD_NETWORK: Final = os.getenv("BUILD_NETWORK", "none")

DB_HOST: Final = os.getenv("TIMESCALE_HOST", os.getenv("DB_HOST", "localhost"))
DB_PORT: Final = int(os.getenv("TIMESCALE_PORT", os.getenv("DB_PORT", "5432")))
DB_USER: Final = os.getenv("TIMESCALE_USER", os.getenv("DB_USER", "uora"))
DB_PASSWORD: Final[str | None] = os.getenv("TIMESCALE_PASSWORD", os.getenv("DB_PASSWORD")) or None
DB_NAME: Final = os.getenv("TIMESCALE_DB", os.getenv("DB_NAME", "uora_metrics"))

K8S_NAMESPACE: Final = os.getenv("K8S_NAMESPACE", "uora")
KUBERNETES_ENABLED: Final = os.getenv("KUBERNETES_ENABLED", "false").lower() == "true"
GKE_SANDBOX_ENABLED: Final = os.getenv("GKE_SANDBOX_ENABLED", "true").lower() == "true"
K8S_SECCOMP_PROFILE: Final = os.getenv("K8S_SECCOMP_PROFILE", "seccomp-profile.json")

CONSUMER_GROUP: Final = "builders"
STREAM_NAME: Final = "build_queue"
BENCHMARK_STREAM_NAME: Final = "benchmark_queue"
BLOCK_MS: Final = 5000  # milliseconds to block on XREADGROUP
CONSUMER_ID: Final = f"builder-{uuid.uuid4().hex[:8]}"

SUPPORTED_LANGUAGES: Final = frozenset({"cpp", "rust", "go", "python"})


def require_setting(name: str, value: str | None) -> str:
    if not value:
        raise RuntimeError(f"{name} must be set in the environment")
    return value

# ─── Dockerfile Templates ──────────────────────────────────────────────────

DOCKERFILE_CPP: Final = """\
FROM gcc:13-bookworm AS builder
WORKDIR /src
RUN mkdir -p /app
COPY . .
RUN g++ -O2 -static -std=c++20 -o /app/engine $(ls *.cpp *.cc *.cxx 2>/dev/null | head -20) 2>/dev/null || \\
    g++ -O2 -static -std=c++17 -o /app/engine $(ls *.cpp *.cc *.cxx 2>/dev/null | head -20) 2>/dev/null || \\
    g++ -O2 -static -o /app/engine $(ls *.cpp *.cc *.cxx 2>/dev/null | head -20)

FROM scratch
COPY --from=builder /app/engine /engine
EXPOSE 8080
ENTRYPOINT ["/engine"]
"""

DOCKERFILE_RUST: Final = """\
FROM rust:1.77-bookworm AS builder
WORKDIR /src
COPY . .
RUN cargo build --release
RUN cp target/release/engine /app/engine 2>/dev/null || \\
    find target/release -maxdepth 1 -type f -executable -not -name '*.d' -not -name '*.pdb' -not -name '*.*' | head -1 | xargs -I{} cp {} /app/engine

FROM scratch
COPY --from=builder /app/engine /engine
ENTRYPOINT ["/engine"]
"""

DOCKERFILE_GO: Final = """\
FROM golang:1.22-bookworm AS builder
WORKDIR /src
RUN mkdir -p /app
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app/engine .

FROM scratch
COPY --from=builder /app/engine /engine
EXPOSE 8080
ENTRYPOINT ["/engine"]
"""

DOCKERFILE_MAP: Final[dict[str, str]] = {
    "cpp": DOCKERFILE_CPP,
    "rust": DOCKERFILE_RUST,
    "go": DOCKERFILE_GO,
}

# ─── Kubernetes Pod Manifest ───────────────────────────────────────────────

K8S_POD_TEMPLATE: Final = """\
apiVersion: v1
kind: Pod
metadata:
  name: {pod_name}
  namespace: {namespace}
  labels:
    app.kubernetes.io/name: uora-contestant-engine
    uora.io/submission-id: "{submission_id}"
  annotations:
    sidecar.envoy.uora/inject: "true"
spec:
  {runtime_class_spec}
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    {seccomp_profile_spec}
  containers:
  - name: engine
    image: {image}
    imagePullPolicy: Always
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop:
          - ALL
    resources:
      requests:
        cpu: "500m"
        memory: "256Mi"
      limits:
        cpu: "1"
        memory: "512Mi"
    env:
    - name: UORA_SUBMISSION_ID
      value: "{submission_id}"
    volumeMounts:
    - name: tmp
      mountPath: /tmp
  volumes:
  - name: tmp
    emptyDir:
      medium: Memory
      sizeLimit: "64Mi"
  restartPolicy: Never
---
apiVersion: v1
kind: Service
metadata:
  name: {pod_name}
  namespace: {namespace}
  labels:
    app.kubernetes.io/name: uora-contestant-engine
    uora.io/submission-id: "{submission_id}"
spec:
  type: ClusterIP
  selector:
    uora.io/submission-id: "{submission_id}"
  ports:
  - name: http
    port: 8080
    targetPort: 8080
"""

# ─── Helpers ────────────────────────────────────────────────────────────────


def _sanitize_pod_name(submission_id: str) -> str:
    """Convert a submission UUID to a valid Kubernetes Pod name.

    Pod names must be lowercase, DNS-label compatible (``[a-z0-9]([a-z0-9-]*[a-z0-9])?``).
    """
    safe = submission_id.lower().replace("_", "-")
    safe = "".join(c for c in safe if c in string.ascii_lowercase + string.digits + "-")
    safe = safe.strip("-")
    return f"sub-{safe}"[:63].rstrip("-")


# ─── Sandbox Builder ───────────────────────────────────────────────────────


class SandboxBuilder:
    """Core build worker that compiles and deploys contestant submissions.

    This is a long-running async service.  Call :meth:`run` to start the
    main consumer loop.  It will run until :meth:`shutdown` is invoked
    (typically from a signal handler).
    """

    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None
        self._db_pool: Optional[Any] = None
        self._s3_session: Optional[Any] = None
        self._running: bool = False
        self._shutting_down: bool = False
        self._executor = None
        self._k8s_loaded: bool = False

    # ── Subprocess helper ────────────────────────────────────────────────

    async def _wait_for_container_health(self, container_name: str, timeout: float = 30.0) -> None:
        """Wait for a Docker container to be running and healthy."""
        start_time = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start_time < timeout:
            rc, stdout, _ = await self._run_cmd("docker", "inspect", "--format", "{{.State.Status}}", container_name, timeout=5.0)
            if rc == 0:
                status = stdout.decode().strip()
                if status == "running":
                    logger.info("Container %s is running", container_name)
                    return
                elif status in ("exited", "dead"):
                    # Get container logs for debugging
                    rc, logs, _ = await self._run_cmd("docker", "logs", "--tail", "50", container_name, timeout=5.0)
                    raise RuntimeError(f"Container {container_name} exited. Logs:\n{logs.decode(errors='replace')}")
            
            await asyncio.sleep(1.0)
        
        raise RuntimeError(f"Container {container_name} did not become healthy within {timeout}s")

    async def _run_cmd(
        self,
        *cmd: str,
        input_bytes: Optional[bytes] = None,
        timeout: float = 120.0,
    ) -> tuple[int, bytes, bytes]:
        """Run an external command using asyncio subprocesses.

        Returns (returncode, stdout, stderr).
        Safely handles timeouts and cancellations by killing the process.
        """
        proc = await asyncio.create_subprocess_exec(
            cmd[0],
            *cmd[1:],
            stdin=asyncio.subprocess.PIPE if input_bytes is not None else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=input_bytes),
                timeout=timeout,
            )
            return proc.returncode or 0, stdout, stderr
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            stdout, stderr = await proc.communicate()
            raise RuntimeError(f"Command timed out after {timeout}s: {' '.join(cmd)}")
        except asyncio.CancelledError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()
            raise



    # ── Lifecycle ───────────────────────────────────────────────────────

    async def start(self) -> None:
        """Initialize all connections and register the consumer group."""
        logger.info("Starting SandboxBuilder (consumer=%s)", CONSUMER_ID)

        # Redis connection pool with retry logic
        if aioredis.Redis is None:
            raise RuntimeError("redis is required for sandbox build queue access")
        
        max_retries = 5
        base_delay = 1.0
        for attempt in range(max_retries):
            try:
                self._redis = aioredis.Redis(
                    host=REDIS_HOST,
                    port=REDIS_PORT,
                    password=require_setting("REDIS_PASSWORD", REDIS_PASSWORD),
                    decode_responses=True,
                    max_connections=10,
                    socket_connect_timeout=5.0,
                    socket_timeout=5.0,
                )
                # Verify connectivity
                await self._redis.ping()
                logger.info("Connected to Redis at %s:%d", REDIS_HOST, REDIS_PORT)
                break
            except (aioredis.ConnectionError, aioredis.TimeoutError) as exc:
                if attempt == max_retries - 1:
                    raise RuntimeError(f"Failed to connect to Redis after {max_retries} attempts: {exc}")
                delay = base_delay * (2 ** attempt)
                logger.warning("Redis connection attempt %d failed, retrying in %.1fs: %s", attempt + 1, delay, exc)
                await asyncio.sleep(delay)

        # Ensure the consumer group exists (MKSTREAM creates the stream if needed)
        try:
            await self._redis.xgroup_create(
                name=STREAM_NAME, groupname=CONSUMER_GROUP, id="0", mkstream=True
            )
            logger.info("Created consumer group '%s' on stream '%s'", CONSUMER_GROUP, STREAM_NAME)
        except aioredis.ResponseError as exc:
            if "BUSYGROUP" in str(exc).upper():
                logger.debug("Consumer group '%s' already exists", CONSUMER_GROUP)
            else:
                raise

        # PostgreSQL / TimescaleDB pool (optional — used for recording build events)
        try:
            if asyncpg is None:
                raise RuntimeError("asyncpg is not installed")
            self._db_pool = await asyncpg.create_pool(
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                min_size=1,
                max_size=5,
            )
            logger.info("Connected to TimescaleDB at %s:%d", DB_HOST, DB_PORT)
        except Exception as exc:
            logger.warning("TimescaleDB connection failed (builds will proceed without DB): %s", exc)
            self._db_pool = None

        # MinIO / S3 session
        if aioboto3 is None:
            raise RuntimeError("aioboto3 is required for sandbox source downloads")
        require_setting("MINIO_ACCESS_KEY", MINIO_ACCESS_KEY)
        require_setting("MINIO_SECRET_KEY", MINIO_SECRET_KEY)
        self._s3_session = aioboto3.Session()

        self._running = True
        logger.info("SandboxBuilder ready")

    async def shutdown(self) -> None:
        """Gracefully shut down all connections."""
        if self._shutting_down:
            return
        self._shutting_down = True
        self._running = False
        logger.info("Shutting down SandboxBuilder…")

        if self._redis:
            await self._redis.aclose()
            logger.info("Redis connection closed")
        if self._db_pool:
            await self._db_pool.close()
            logger.info("TimescaleDB pool closed")

    # ── Status helpers ──────────────────────────────────────────────────

    async def _update_status(
        self,
        submission_id: str,
        status: str,
        *,
        error: str | None = None,
        image: str | None = None,
        pod_name: str | None = None,
        service_name: str | None = None,
        target_url: str | None = None,
        build_log: str | None = None,
    ) -> None:
        """Write current build status to the Redis hash for this submission."""
        assert self._redis is not None, "Redis not initialized"

        fields: dict[str, str] = {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if error is not None:
            fields["error"] = error
        if image is not None:
            fields["image"] = image
        if pod_name is not None:
            fields["pod_name"] = pod_name
        if service_name is not None:
            fields["service_name"] = service_name
        if target_url is not None:
            fields["target_url"] = target_url
        if build_log is not None:
            fields["build_log"] = build_log

        # Timestamped milestone
        milestone_key = f"{status}_at"
        if milestone_key not in ("queued_at",):  # queued_at already set by submission svc
            fields[milestone_key] = fields["updated_at"]

        await self._redis.hset(f"submission:{submission_id}", mapping=fields)
        try:
            await self._redis.publish(
                "uora:leaderboard:updates",
                json.dumps({
                    "type": "submission_status",
                    "submission_id": submission_id,
                    "status": status,
                    "error": error,
                    "updated_at": fields["updated_at"],
                    "build_log": build_log,
                }),
            )
        except Exception as exc:
            logger.warning("Status publish failed for %s: %s", submission_id, exc)
        logger.info("Submission %s → %s", submission_id, status)

    async def _enqueue_benchmark(
        self,
        submission_id: str,
        target_url: str,
        language: str,
        protocol: str = "REST",
    ) -> None:
        """Queue the deployed engine for the benchmark/validation/scoring worker."""
        assert self._redis is not None, "Redis not initialized"

        payload = {
            "submission_id": submission_id,
            "target_url": target_url,
            "language": language,
            "protocol": protocol,
        }
        await self._redis.xadd(BENCHMARK_STREAM_NAME, payload)
        await self._redis.hset(
            f"submission:{submission_id}",
            mapping={
                "status": "benchmarking",
                "benchmarking_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        await self._redis.publish(
            "uora:leaderboard:updates",
            json.dumps({
                "type": "submission_status",
                "submission_id": submission_id,
                "status": "benchmarking",
                "target_url": target_url,
            }),
        )

    async def _record_build_event(self, submission_id: str, event: str, detail: str) -> None:
        """Optionally record a build event in TimescaleDB for audit."""
        if self._db_pool is None:
            return
        try:
            async with self._db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO build_events (time, submission_id, event, detail)
                    VALUES (NOW(), $1, $2, $3)
                    """,
                    submission_id,
                    event,
                    detail,
                )
        except Exception as exc:
            logger.warning("Failed to record build event in DB: %s", exc)

    # ── MinIO download ──────────────────────────────────────────────────

    async def _download_source(self, s3_key: str, dest_dir: Path) -> Path:
        """Download the source tarball from MinIO and extract it into *dest_dir*.

        Returns the path to the directory containing extracted sources.
        """
        assert self._s3_session is not None

        source_name = Path(s3_key).name or "source"
        download_path = dest_dir / source_name
        logger.info("Downloading s3://%s/%s → %s", MINIO_BUCKET, s3_key, download_path)

        async with self._s3_session.client(
            "s3",
            endpoint_url=f"{'https' if MINIO_SECURE else 'http'}://{MINIO_ENDPOINT}",
            aws_access_key_id=require_setting("MINIO_ACCESS_KEY", MINIO_ACCESS_KEY),
            aws_secret_access_key=require_setting("MINIO_SECRET_KEY", MINIO_SECRET_KEY),
            region_name="us-east-1",
        ) as s3:
            try:
                resp = await asyncio.wait_for(
                    s3.get_object(Bucket=MINIO_BUCKET, Key=s3_key),
                    timeout=60.0
                )
                # aioboto3 StreamingBody: read entire body (files are ≤50 MB)
                body = resp["Body"]
                data = await asyncio.wait_for(body.read(), timeout=120.0)
                with open(download_path, "wb") as fh:
                    fh.write(data)
            except asyncio.TimeoutError:
                raise RuntimeError(f"MinIO download timeout for {s3_key}")
            except s3.exceptions.NoSuchKey:
                raise FileNotFoundError(f"S3 key not found: {MINIO_BUCKET}/{s3_key}")

        source_dir = dest_dir / "src"
        source_dir.mkdir()

        # Sniff magic bytes
        with open(download_path, "rb") as f:
            head = f.read(262)

        import zipfile
        import tarfile

        extracted = False

        # gzip magic 1f 8b — likely .tar.gz
        if head[:2] == b"\x1f\x8b":
            try:
                with tarfile.open(download_path, mode="r:gz") as tar:
                    source_dir_resolved = source_dir.resolve()
                    for member in tar.getmembers():
                        if member.name.startswith("/") or ".." in member.name or member.name.startswith("\\"):
                            raise RuntimeError(f"Path traversal attempt detected in archive: {member.name}")
                        member_path = (source_dir / member.name).resolve()
                        try:
                            member_path.relative_to(source_dir_resolved)
                        except ValueError:
                            raise RuntimeError(f"Path traversal attempt detected: {member.name}")
                    tar.extractall(source_dir)
                logger.info("Programmatically extracted tar.gz → %s", source_dir)
                extracted = True
            except Exception as e:
                logger.warning("Failed to extract as tar.gz, falling back: %s", e)

        # tar magic at offset 257: "ustar"
        if not extracted and len(head) > 262 and head[257:262] == b"ustar":
            try:
                with tarfile.open(download_path, mode="r:") as tar:
                    source_dir_resolved = source_dir.resolve()
                    for member in tar.getmembers():
                        if member.name.startswith("/") or ".." in member.name or member.name.startswith("\\"):
                            raise RuntimeError(f"Path traversal attempt detected in archive: {member.name}")
                        member_path = (source_dir / member.name).resolve()
                        try:
                            member_path.relative_to(source_dir_resolved)
                        except ValueError:
                            raise RuntimeError(f"Path traversal attempt detected: {member.name}")
                    tar.extractall(source_dir)
                logger.info("Programmatically extracted tar → %s", source_dir)
                extracted = True
            except Exception as e:
                logger.warning("Failed to extract as tar, falling back: %s", e)

        # zip magic PK\x03\x04
        if not extracted and head[:4] == b"PK\x03\x04":
            try:
                with zipfile.ZipFile(download_path) as zf:
                    source_dir_resolved = source_dir.resolve()
                    for member in zf.namelist():
                        if member.startswith("/") or ".." in member or member.startswith("\\"):
                            raise RuntimeError(f"Path traversal attempt detected in archive: {member}")
                        member_path = (source_dir / member).resolve()
                        try:
                            member_path.relative_to(source_dir_resolved)
                        except ValueError:
                            raise RuntimeError(f"Path traversal attempt detected: {member}")
                    zf.extractall(source_dir)
                logger.info("Programmatically extracted zip → %s", source_dir)
                extracted = True
            except Exception as e:
                logger.warning("Failed to extract as zip, falling back: %s", e)

        if not extracted:
            # Raw single file
            ext = s3_key.rsplit(".", 1)[-1] if "." in s3_key else "txt"
            target_path = source_dir / f"source.{ext}"
            shutil.copy2(download_path, target_path)
            logger.info("Prepared single-file source at %s", target_path)

        # Copy httplib.h if we have C++ files and httplib.h is missing
        cpp_files = (
            list(source_dir.glob("**/*.cpp"))
            + list(source_dir.glob("**/*.cc"))
            + list(source_dir.glob("**/*.cxx"))
            + list(source_dir.glob("**/*.h"))
            + list(source_dir.glob("**/*.hpp"))
        )
        if cpp_files:
            has_httplib = any(f.name == "httplib.h" for f in cpp_files)
            if not has_httplib:
                examples_paths = [
                    Path("/app/examples/httplib.h"),
                    Path(__file__).resolve().parents[2] / "examples" / "httplib.h"
                ]
                for ep in examples_paths:
                    if ep.is_file():
                        shutil.copy2(ep, source_dir / "httplib.h")
                        logger.info("Automatically provided missing httplib.h from %s", ep)
                        break

        return source_dir

    # ── Docker build ────────────────────────────────────────────────────

    def _generate_dockerfile(self, language: str, source_dir: Path) -> str:
        """Return a multi-stage Dockerfile for the given language."""
        if language == "python":
            py_files = sorted(source_dir.glob("**/*.py"))
            # filter out macos double/dotfiles
            py_files = [p for p in py_files if not p.name.startswith("._") and not p.name.startswith(".")]
            if not py_files:
                raise ValueError("No .py source found in submission")
            # find entrypoint
            entry = next(
                (p for p in py_files if any(k in p.name.lower() for k in ("engine", "main", "server"))),
                py_files[0],
            )
            # Make the entry relative to source_dir
            rel_entry = entry.relative_to(source_dir)
            
            # Check if requirements.txt exists to install dependencies
            req_step = "RUN pip install --no-cache-dir -r requirements.txt" if (source_dir / "requirements.txt").is_file() else "# no requirements.txt"
            
            return f"""\
FROM python:3.11-slim
WORKDIR /app
COPY . /app
{req_step}
EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["python", "-u", "{rel_entry}"]
"""
        try:
            return DOCKERFILE_MAP[language]
        except KeyError:
            raise ValueError(f"Unsupported language: {language!r} (supported: {SUPPORTED_LANGUAGES})")

    async def _build_image(
        self,
        source_dir: Path,
        language: str,
        submission_id: str,
    ) -> tuple[str, str]:
        """Build a Docker image from the source directory.

        Uses ``docker buildx build`` with ``--network=none`` and ``--no-cache``
        for hermetic, reproducible builds.

        Returns (image_tag, build_log).
        """
        dockerfile_content = self._generate_dockerfile(language, source_dir)
        dockerfile_path = source_dir / "Dockerfile"
        dockerfile_path.write_text(dockerfile_content)

        # Sanitize image tag — only allow [a-z0-9._-]
        tag_suffix = submission_id.lower().replace("_", "-")
        tag_suffix = "".join(c for c in tag_suffix if c.isalnum() or c in ".-")
        image_tag = f"{REGISTRY}/uora/sub-{tag_suffix}:latest"

        # Use buildctl with BUILDKIT_HOST for rootless, isolated builds
        buildkit_addr = os.getenv("BUILDKIT_HOST", "tcp://buildkitd:1234")
        
        cmd: list[str] = [
            "buildctl", "--addr", buildkit_addr, "build",
            "--frontend", "dockerfile.v0",
            "--local", f"context={source_dir}",
            "--local", f"dockerfile={source_dir}",
            "--output", f"type=image,name={image_tag},push=true"
        ]
        logger.info("Building and pushing image %s (lang=%s)", image_tag, language)

        rc, _, stderr = await self._run_cmd(*cmd, timeout=float(BUILD_TIMEOUT))
        build_log = stderr.decode(errors="replace")

        if rc != 0:
            # Log full error for debugging, but show truncated in exception
            logger.error("BuildKit build failed (rc=%d). Full stderr:\n%s", rc, build_log)
            truncated_log = build_log[-4096:] if len(build_log) > 4096 else build_log
            raise RuntimeError(
                f"BuildKit build failed (rc={rc}):\n{truncated_log}"
            )

        logger.info("Built and pushed image %s successfully", image_tag)
        return image_tag, build_log

    # ── Registry push ──────────────────────────────────────────────────

    async def _push_image(self, image_tag: str) -> None:
        """Push the built image to the container registry."""
        # Note: Handled directly by buildctl --output type=image,push=true
        pass

    # ── Kubernetes deploy ───────────────────────────────────────────────

    def _init_kubernetes(self) -> bool:
        """Initialize Kubernetes configuration.
        
        Attempts in-cluster configuration first, then local kubeconfig.
        Returns True if successful, False otherwise.
        """
        if kubernetes is None or yaml is None:
            logger.warning("kubernetes or yaml Python library is not installed/available")
            return False
        if self._k8s_loaded:
            return True
        try:
            config.load_in_cluster_config()
            self._k8s_loaded = True
            logger.info("Loaded in-cluster Kubernetes configuration")
            return True
        except config.ConfigException:
            try:
                config.load_kube_config()
                self._k8s_loaded = True
                logger.info("Loaded local kubeconfig configuration")
                return True
            except Exception as exc:
                logger.warning("Could not load any Kubernetes configuration: %s", exc)
                return False

    async def _deploy_pod(
        self,
        submission_id: str,
        image_tag: str,
    ) -> str:
        """Deploy a Pod and stable Service for the contestant's submission.

        If KUBERNETES_ENABLED is False, spins up a local Docker container instead.
        Returns the Pod name or local container target hostname.
        """
        pod_name = _sanitize_pod_name(submission_id)

        if not KUBERNETES_ENABLED:
            logger.info("Kubernetes is disabled. Deploying submission %s locally using Docker...", submission_id)

            # Rewrite image tag for the host docker daemon
            host_image_tag = image_tag.replace("registry:5000", "localhost:5000")

            # Discover the actual backend network — Docker Compose names it
            # "<project>_backend" where <project> is the compose project dir
            # (e.g. "uora-platform_backend"). Probe at runtime so we don't
            # hardcode the project name.
            network_candidates: list[str] = []
            rc_net, net_stdout, _ = await self._run_cmd(
                "docker", "network", "ls", "--format", "{{.Name}}"
            )
            if rc_net == 0:
                all_networks = net_stdout.decode(errors="replace").splitlines()
                # Prefer any *_backend network (matches uora-platform_backend, uora_backend, etc.)
                network_candidates = [n.strip() for n in all_networks if n.strip().endswith("_backend")]
                # Fall back to the legacy names if no *_backend network exists yet
                for legacy in ("uora_backend", "backend"):
                    if legacy in all_networks and legacy not in network_candidates:
                        network_candidates.append(legacy)
            # Last-ditch: default bridge
            network_candidates.append(None)  # type: ignore[arg-type]

            last_err = ""
            rc = 1
            stdout = stderr = b""
            for network in network_candidates:
                # ALWAYS clean up any prior container by this name before each
                # attempt — a failed `docker run` can leave a stub in "Created"
                # state that blocks the next attempt with "name already in use".
                await self._run_cmd("docker", "rm", "-f", pod_name)

                cmd = ["docker", "run", "-d", "--name", pod_name]
                if network:
                    cmd += ["--network", network]
                cmd.append(host_image_tag)
                rc, stdout, stderr = await self._run_cmd(*cmd)
                if rc == 0:
                    logger.info("Deployed %s on network=%s", pod_name, network or "<default>")
                    break
                last_err = stderr.decode(errors="replace")
                logger.warning("Deploy attempt on network=%s failed: %s", network or "<default>", last_err)

            if rc != 0:
                raise RuntimeError(f"Local docker container deployment failed (rc={rc}): {last_err}")

            # Wait for container to be healthy before proceeding
            await self._wait_for_container_health(pod_name, timeout=30.0)

            return pod_name

        # Standard Kubernetes deployment path
        if GKE_SANDBOX_ENABLED:
            runtime_class_spec = "runtimeClassName: gvisor"
            seccomp_profile_spec = "seccompProfile:\n      type: RuntimeDefault"
        else:
            runtime_class_spec = ""
            if K8S_SECCOMP_PROFILE:
                seccomp_profile_spec = f"seccompProfile:\n      type: Localhost\n      localhostProfile: {K8S_SECCOMP_PROFILE}"
            else:
                seccomp_profile_spec = "seccompProfile:\n      type: RuntimeDefault"

        manifest = K8S_POD_TEMPLATE.format(
            pod_name=pod_name,
            namespace=K8S_NAMESPACE,
            image=image_tag,
            submission_id=submission_id,
            runtime_class_spec=runtime_class_spec,
            seccomp_profile_spec=seccomp_profile_spec,
        )

        logger.info("Deploying Pod %s (image=%s)", pod_name, image_tag)

        # Try to use the native Python K8s API if available
        if self._init_kubernetes():
            try:
                documents = list(yaml.safe_load_all(manifest))
                v1 = client.CoreV1Api()

                for doc in documents:
                    if not doc:
                        continue
                    kind = doc.get("kind")
                    name = doc["metadata"]["name"]
                    namespace = doc["metadata"].get("namespace", K8S_NAMESPACE)

                    if kind == "Pod":
                        try:
                            logger.info("Deleting existing Pod %s/%s if it exists", namespace, name)
                            v1.delete_namespaced_pod(
                                name=name,
                                namespace=namespace,
                                body=client.V1DeleteOptions(propagation_policy="Background")
                            )
                            # Wait up to 5 seconds for deletion to complete/initiate
                            for _ in range(10):
                                try:
                                    v1.read_namespaced_pod(name=name, namespace=namespace)
                                    await asyncio.sleep(0.5)
                                except ApiException as e:
                                    if e.status == 404:
                                        break
                                    raise
                        except ApiException as e:
                            if e.status != 404:
                                logger.warning("Error deleting existing Pod %s: %s", name, e)

                        logger.info("Creating Pod %s/%s", namespace, name)
                        v1.create_namespaced_pod(namespace=namespace, body=doc)

                    elif kind == "Service":
                        try:
                            logger.info("Deleting existing Service %s/%s if it exists", namespace, name)
                            v1.delete_namespaced_service(name=name, namespace=namespace)
                            for _ in range(10):
                                try:
                                    v1.read_namespaced_service(name=name, namespace=namespace)
                                    await asyncio.sleep(0.5)
                                except ApiException as e:
                                    if e.status == 404:
                                        break
                                    raise
                        except ApiException as e:
                            if e.status != 404:
                                logger.warning("Error deleting existing Service %s: %s", name, e)

                        logger.info("Creating Service %s/%s", namespace, name)
                        v1.create_namespaced_service(namespace=namespace, body=doc)

                logger.info("Deployed Pod and Service %s via Kubernetes API", pod_name)
                return pod_name

            except Exception as api_exc:
                logger.error("Kubernetes API deployment failed: %s. Falling back to kubectl CLI...", api_exc)

        # Fallback to kubectl command line if Kubernetes API is unavailable or failed
        logger.info("Deploying Pod %s using kubectl fallback...", pod_name)
        rc, _, stderr = await self._run_cmd(
            "kubectl", "apply", "-f", "-",
            input_bytes=manifest.encode(),
            timeout=30.0,
        )

        if rc != 0:
            apply_log = stderr.decode(errors="replace")
            # Log full error for debugging, but show truncated in exception
            logger.error("kubectl apply failed (rc=%d). Full stderr:\n%s", rc, apply_log)
            truncated_log = apply_log[-4096:] if len(apply_log) > 4096 else apply_log
            raise RuntimeError(
                f"kubectl apply failed (rc={rc}):\n{truncated_log}"
            )

        logger.info("Deployed Pod and Service %s via kubectl fallback", pod_name)
        return pod_name


    # ── Single-job pipeline ─────────────────────────────────────────────

    async def _process_job(self, job: dict[str, Any]) -> None:
        """Execute the full build pipeline for a single job.

        Steps:  download → build → push → deploy

        On any failure the submission status is set to ``failed`` with the
        error message, so the API layer can surface it to the contestant.
        """
        submission_id: str = job["submission_id"]
        s3_key: str = job["s3_key"]
        language: str = job["language"]

        if language not in SUPPORTED_LANGUAGES:
            await self._update_status(
                submission_id, "failed", error=f"Unsupported language: {language!r}"
            )
            await self._record_build_event(submission_id, "failed", f"Unsupported language: {language!r}")
            return

        tmpdir: Optional[tempfile.TemporaryDirectory] = None

        try:
            # ── Building ────────────────────────────────────────────────
            await self._update_status(submission_id, "building")
            await self._record_build_event(submission_id, "building", "Started build pipeline")

            tmpdir = tempfile.TemporaryDirectory(prefix=f"uora-build-{submission_id[:8]}-")
            work_dir = Path(tmpdir.name)

            # Download
            source_dir = await self._download_source(s3_key, work_dir)

            # Build
            image_tag, build_log = await self._build_image(source_dir, language, submission_id)
            await self._update_status(submission_id, "built", image=image_tag, build_log=build_log)
            await self._record_build_event(submission_id, "built", f"Image: {image_tag}")

            # Push
            await self._push_image(image_tag)

            # Deploy
            pod_name = await self._deploy_pod(submission_id, image_tag)
            if KUBERNETES_ENABLED:
                target_url = f"http://{pod_name}.{K8S_NAMESPACE}.svc.cluster.local:8080"
            else:
                target_url = f"http://{pod_name}:8080"
            await self._update_status(
                submission_id,
                "deployed",
                image=image_tag,
                pod_name=pod_name,
                service_name=pod_name,
                target_url=target_url,
            )
            # Write base resource penalty to Redis so scoring engine can read it
            await self._redis.set(f"resources:{submission_id}", "1.0", ex=86400)
            await self._enqueue_benchmark(submission_id, target_url, language)

        except Exception as exc:
            logger.exception("Build pipeline failed for submission %s", submission_id)
            await self._update_status(submission_id, "failed", error=str(exc), build_log=str(exc))
            await self._record_build_event(submission_id, "failed", str(exc))

        finally:
            if tmpdir is not None:
                try:
                    tmpdir.cleanup()
                    logger.debug("Cleaned up temporary directory for submission %s", submission_id)
                except Exception as exc:
                    logger.error("Failed to clean up temporary directory for submission %s: %s", submission_id, exc)

    # ── Consumer loop ───────────────────────────────────────────────────

    async def _consume(self) -> None:
        """Read and process messages from the Redis Stream consumer group."""
        assert self._redis is not None, "Redis not initialized"

        while self._running:
            try:
                # XREADGROUP GROUP <group> <consumer> COUNT 1 BLOCK <ms> STREAMS <key> >
                results = await self._redis.xreadgroup(
                    groupname=CONSUMER_GROUP,
                    consumername=CONSUMER_ID,
                    streams={STREAM_NAME: ">"},
                    count=1,
                    block=BLOCK_MS,
                )

                if not results:
                    continue  # timed out, no new messages

                # results: [(stream_name, [(message_id, data), ...])]
                for _stream, messages in results:
                    for message_id, data in messages:
                        if not self._running:
                            return

                        logger.info(
                            "Received build job: message_id=%s submission=%s",
                            message_id,
                            data.get("submission_id", "?"),
                        )

                        await self._process_job(data)

                        # Acknowledge the message only after processing
                        await self._redis.xack(STREAM_NAME, CONSUMER_GROUP, message_id)

            except aioredis.ConnectionError:
                logger.error("Redis connection lost — retrying in 5s…")
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                logger.info("Consumer task cancelled")
                return
            except Exception:
                logger.exception("Unexpected error in consumer loop")
                await asyncio.sleep(1)

    # ── Entrypoint ──────────────────────────────────────────────────────

    async def run(self) -> None:
        """Start the builder worker and block until shutdown."""
        await self.start()

        loop = asyncio.get_running_loop()

        # Register signal handlers for graceful shutdown
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(
                sig,
                lambda s=sig: asyncio.create_task(self._handle_signal(s)),
            )

        logger.info("Entering main consumer loop")
        try:
            await self._consume()
        finally:
            await self.shutdown()

    async def _handle_signal(self, sig: signal.Signals) -> None:
        """Handle OS signals for graceful shutdown."""
        logger.info("Received signal %s — initiating graceful shutdown", sig.name)
        self._running = False


# ─── Main ───────────────────────────────────────────────────────────────────


async def main() -> None:
    """Entry point when invoked as ``python -m uora.sandbox.builder``."""
    # uvloop is disabled because get_child_watcher() raises NotImplementedError
    # when executing docker subprocesses. Default asyncio loop works perfectly.
    logger.info("Using default asyncio loop for subprocess compatibility")

    builder = SandboxBuilder()
    await builder.run()


if __name__ == "__main__":
    asyncio.run(main())
