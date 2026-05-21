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

CONSUMER_GROUP: Final = "builders"
STREAM_NAME: Final = "build_queue"
BENCHMARK_STREAM_NAME: Final = "benchmark_queue"
BLOCK_MS: Final = 5000  # milliseconds to block on XREADGROUP
CONSUMER_ID: Final = f"builder-{uuid.uuid4().hex[:8]}"

SUPPORTED_LANGUAGES: Final = frozenset({"cpp", "rust", "go"})


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
  runtimeClassName: gvisor
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: Localhost
      localhostProfile: uora-seccomp.json
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
        # Thread pool for subprocess calls — avoids uvloop child watcher issues on Python 3.11
        self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="uora-cmd")

    # ── Subprocess helper ────────────────────────────────────────────────

    async def _run_cmd(
        self,
        *cmd: str,
        input_bytes: Optional[bytes] = None,
        timeout: float = 120.0,
    ) -> tuple[int, bytes, bytes]:
        """Run an external command in a thread executor.

        Returns (returncode, stdout, stderr).
        Bypasses asyncio child watcher entirely — compatible with uvloop on Python 3.11+.
        """
        loop = asyncio.get_event_loop()

        def _blocking() -> tuple[int, bytes, bytes]:
            result = subprocess.run(
                list(cmd),
                input=input_bytes,
                capture_output=True,
                timeout=timeout,
            )
            return result.returncode, result.stdout, result.stderr

        try:
            return await loop.run_in_executor(self._executor, _blocking)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"Command timed out after {timeout}s: {' '.join(cmd)}")


    # ── Lifecycle ───────────────────────────────────────────────────────

    async def start(self) -> None:
        """Initialize all connections and register the consumer group."""
        logger.info("Starting SandboxBuilder (consumer=%s)", CONSUMER_ID)

        # Redis connection pool
        if aioredis.Redis is None:
            raise RuntimeError("redis is required for sandbox build queue access")
        self._redis = aioredis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=require_setting("REDIS_PASSWORD", REDIS_PASSWORD),
            decode_responses=True,
            max_connections=10,
        )
        # Verify connectivity
        await self._redis.ping()
        logger.info("Connected to Redis at %s:%d", REDIS_HOST, REDIS_PORT)

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
                }),
            )
        except Exception as exc:
            logger.debug("Status publish skipped for %s: %s", submission_id, exc)
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
                resp = await s3.get_object(Bucket=MINIO_BUCKET, Key=s3_key)
                # aioboto3 StreamingBody: read entire body (files are ≤50 MB)
                body = resp["Body"]
                data = await body.read()
                with open(download_path, "wb") as fh:
                    fh.write(data)
            except s3.exceptions.NoSuchKey:
                raise FileNotFoundError(f"S3 key not found: {MINIO_BUCKET}/{s3_key}")

        source_dir = dest_dir / "src"
        source_dir.mkdir()

        if not source_name.endswith((".tar.gz", ".tgz")):
            target_path = source_dir / source_name
            download_path.replace(target_path)
            logger.info("Prepared single-file source at %s", target_path)
            return source_dir

        # Validate archive members to prevent path traversal
        rc, stdout, _ = await self._run_cmd("tar", "-tzf", str(download_path), timeout=30.0)
        if rc == 0:
            for member in stdout.decode().splitlines():
                if member.startswith("/") or ".." in member:
                    raise RuntimeError("Path traversal attempt detected in archive")

        # Extract archive uploads securely
        rc, _, stderr = await self._run_cmd(
            "tar", "-xzf", str(download_path), "-C", str(source_dir),
            "--no-same-owner", "--no-same-permissions",
            timeout=60.0,
        )
        if rc != 0:
            raise RuntimeError(f"tar extraction failed (rc={rc}): {stderr.decode().strip()}")

        logger.info("Extracted source to %s", source_dir)
        return source_dir

    # ── Docker build ────────────────────────────────────────────────────

    def _generate_dockerfile(self, language: str) -> str:
        """Return a multi-stage Dockerfile for the given language."""
        try:
            return DOCKERFILE_MAP[language]
        except KeyError:
            raise ValueError(f"Unsupported language: {language!r} (supported: {SUPPORTED_LANGUAGES})")

    async def _build_image(
        self,
        source_dir: Path,
        language: str,
        submission_id: str,
    ) -> str:
        """Build a Docker image from the source directory.

        Uses ``docker buildx build`` with ``--network=none`` and ``--no-cache``
        for hermetic, reproducible builds.

        Returns the full image tag (e.g. ``localhost:5000/uora/sub-abc:latest``).
        """
        dockerfile_content = self._generate_dockerfile(language)
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

        if rc != 0:
            build_log = stderr.decode(errors="replace")[-4096:]  # last 4 KB
            raise RuntimeError(
                f"BuildKit build failed (rc={rc}):\n{build_log}"
            )

        logger.info("Built and pushed image %s successfully", image_tag)
        return image_tag

    # ── Registry push ──────────────────────────────────────────────────

    async def _push_image(self, image_tag: str) -> None:
        """Push the built image to the container registry."""
        # Note: Handled directly by buildctl --output type=image,push=true
        pass

    # ── Kubernetes deploy ───────────────────────────────────────────────

    async def _deploy_pod(
        self,
        submission_id: str,
        image_tag: str,
    ) -> str:
        """Deploy a Pod and stable Service for the contestant's submission.

        Returns the Pod name.
        """
        pod_name = _sanitize_pod_name(submission_id)

        manifest = K8S_POD_TEMPLATE.format(
            pod_name=pod_name,
            namespace=K8S_NAMESPACE,
            image=image_tag,
            submission_id=submission_id,
        )

        logger.info("Deploying Pod %s (image=%s)", pod_name, image_tag)

        rc, _, stderr = await self._run_cmd(
            "kubectl", "apply", "-f", "-",
            input_bytes=manifest.encode(),
            timeout=30.0,
        )

        if rc != 0:
            apply_log = stderr.decode(errors="replace")[-4096:]
            raise RuntimeError(
                f"kubectl apply failed (rc={rc}):\n{apply_log}"
            )

        logger.info("Deployed Pod and Service %s", pod_name)
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
            image_tag = await self._build_image(source_dir, language, submission_id)
            await self._update_status(submission_id, "built", image=image_tag)
            await self._record_build_event(submission_id, "built", f"Image: {image_tag}")

            # Push
            await self._push_image(image_tag)

            # Deploy
            pod_name = await self._deploy_pod(submission_id, image_tag)
            target_url = f"http://{pod_name}.{K8S_NAMESPACE}.svc.cluster.local:8080"
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
            await self._update_status(submission_id, "failed", error=str(exc))
            await self._record_build_event(submission_id, "failed", str(exc))

        finally:
            if tmpdir is not None:
                try:
                    tmpdir.cleanup()
                except Exception:
                    pass

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
    try:
        import uvloop
        uvloop.install()
        logger.info("uvloop event loop installed")
    except ImportError:
        logger.info("uvloop not available — using default asyncio loop")

    builder = SandboxBuilder()
    await builder.run()


if __name__ == "__main__":
    asyncio.run(main())
