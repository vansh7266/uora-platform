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
import logging
import os
import signal
import string
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final, Optional

import aioboto3
import asyncpg
import redis.asyncio as aioredis

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
REDIS_PASSWORD: Final[str | None] = os.getenv("REDIS_PASSWORD", "uora12345") or None

MINIO_ENDPOINT: Final = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY: Final = os.getenv("MINIO_ACCESS_KEY", "uora")
MINIO_SECRET_KEY: Final = os.getenv("MINIO_SECRET_KEY", "uora12345")
MINIO_BUCKET: Final = os.getenv("MINIO_BUCKET", "uora-submissions")
MINIO_SECURE: Final = os.getenv("MINIO_SECURE", "false").lower() == "true"

REGISTRY: Final = os.getenv("REGISTRY_URL", os.getenv("REGISTRY", "localhost:5000"))
BUILD_TIMEOUT: Final = int(os.getenv("BUILD_TIMEOUT", "120"))
BUILD_NETWORK: Final = os.getenv("BUILD_NETWORK", "none")

DB_HOST: Final = os.getenv("TIMESCALE_HOST", os.getenv("DB_HOST", "localhost"))
DB_PORT: Final = int(os.getenv("TIMESCALE_PORT", os.getenv("DB_PORT", "5432")))
DB_USER: Final = os.getenv("TIMESCALE_USER", os.getenv("DB_USER", "uora"))
DB_PASSWORD: Final = os.getenv("TIMESCALE_PASSWORD", os.getenv("DB_PASSWORD", "uora12345"))
DB_NAME: Final = os.getenv("TIMESCALE_DB", os.getenv("DB_NAME", "uora_metrics"))

K8S_NAMESPACE: Final = os.getenv("K8S_NAMESPACE", "uora")

CONSUMER_GROUP: Final = "builders"
STREAM_NAME: Final = "build_queue"
BLOCK_MS: Final = 5000  # milliseconds to block on XREADGROUP
CONSUMER_ID: Final = f"builder-{uuid.uuid4().hex[:8]}"

SUPPORTED_LANGUAGES: Final = frozenset({"cpp", "rust", "go"})

# ─── Dockerfile Templates ──────────────────────────────────────────────────

DOCKERFILE_CPP: Final = """\
FROM gcc:13-bookworm AS builder
WORKDIR /src
COPY . .
RUN g++ -O2 -static -std=c++20 -o /app/engine *.cpp *.cc *.cxx 2>/dev/null || \\
    g++ -O2 -static -std=c++17 -o /app/engine *.cpp *.cc *.cxx 2>/dev/null || \\
    g++ -O2 -static -o /app/engine *.cpp *.cc *.cxx

FROM scratch
COPY --from=builder /app/engine /engine
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
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app/engine .

FROM scratch
COPY --from=builder /app/engine /engine
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
        self._db_pool: Optional[asyncpg.Pool] = None
        self._s3_session: Optional[aioboto3.Session] = None
        self._running: bool = False
        self._shutting_down: bool = False

    # ── Lifecycle ───────────────────────────────────────────────────────

    async def start(self) -> None:
        """Initialize all connections and register the consumer group."""
        logger.info("Starting SandboxBuilder (consumer=%s)", CONSUMER_ID)

        # Redis connection pool
        self._redis = aioredis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
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

        # Timestamped milestone
        milestone_key = f"{status}_at"
        if milestone_key not in ("queued_at",):  # queued_at already set by submission svc
            fields[milestone_key] = fields["updated_at"]

        await self._redis.hset(f"submission:{submission_id}", mapping=fields)
        logger.info("Submission %s → %s", submission_id, status)

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
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            region_name="us-east-1",
        ) as s3:
            try:
                resp = await s3.get_object(Bucket=MINIO_BUCKET, Key=s3_key)
                async with resp["Body"] as stream:
                    with open(download_path, "wb") as fh:
                        async for chunk in stream.iter_chunks(chunk_size=65536):
                            fh.write(chunk)
            except s3.exceptions.NoSuchKey:
                raise FileNotFoundError(f"S3 key not found: {MINIO_BUCKET}/{s3_key}")

        source_dir = dest_dir / "src"
        source_dir.mkdir()

        if not source_name.endswith((".tar.gz", ".tgz")):
            target_path = source_dir / source_name
            download_path.replace(target_path)
            logger.info("Prepared single-file source at %s", target_path)
            return source_dir

        # Extract archive uploads.
        proc = await asyncio.create_subprocess_exec(
            "tar", "-xzf", str(download_path), "-C", str(source_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"tar extraction failed (rc={proc.returncode}): {stderr.decode().strip()}")

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

        cmd: list[str] = [
            "docker", "buildx", "build",
            "--network", BUILD_NETWORK,
            "--no-cache",
            "-t", image_tag,
            "-f", str(dockerfile_path),
            "--load",
            str(source_dir),
        ]
        logger.info("Building image %s (lang=%s)", image_tag, language)

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=BUILD_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise RuntimeError(f"Docker build timed out after {BUILD_TIMEOUT}s")

        if proc.returncode != 0:
            build_log = stderr.decode(errors="replace")[-4096:]  # last 4 KB
            raise RuntimeError(
                f"Docker build failed (rc={proc.returncode}):\n{build_log}"
            )

        logger.info("Built image %s successfully", image_tag)
        return image_tag

    # ── Registry push ──────────────────────────────────────────────────

    async def _push_image(self, image_tag: str) -> None:
        """Push the built image to the container registry."""
        logger.info("Pushing image %s", image_tag)

        proc = await asyncio.create_subprocess_exec(
            "docker", "push", image_tag,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

        if proc.returncode != 0:
            push_log = stderr.decode(errors="replace")[-4096:]
            raise RuntimeError(
                f"docker push failed (rc={proc.returncode}):\n{push_log}"
            )

        logger.info("Pushed image %s", image_tag)

    # ── Kubernetes deploy ───────────────────────────────────────────────

    async def _deploy_pod(
        self,
        submission_id: str,
        image_tag: str,
    ) -> str:
        """Deploy a Pod for the contestant's submission with hardening.

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

        proc = await asyncio.create_subprocess_exec(
            "kubectl", "apply", "-f", "-",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=manifest.encode()),
            timeout=30,
        )

        if proc.returncode != 0:
            apply_log = stderr.decode(errors="replace")[-4096:]
            raise RuntimeError(
                f"kubectl apply failed (rc={proc.returncode}):\n{apply_log}"
            )

        logger.info("Deployed Pod %s", pod_name)
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
            await self._update_status(
                submission_id, "deployed", image=image_tag, pod_name=pod_name
            )
            await self._record_build_event(submission_id, "deployed", f"Pod: {pod_name}")

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
