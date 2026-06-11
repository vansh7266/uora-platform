"""
UORA Local Sandbox Builder
==========================
A Docker-free builder for local end-to-end testing of real contestant code.

Pipeline (mirrors uora.sandbox.builder lifecycle, no Docker / no Kubernetes):
    1. XREADGROUP from ``build_queue`` (consumer group ``builders``)
    2. Download source from MinIO  →  /tmp/uora-local/{submission_id}/
    3. Compile locally:
       - cpp:    g++ -O2 -std=c++20 -pthread -o engine *.cpp
       - python: just chmod +x (interpreted)
       - go:     go build -o engine
       - rust:   cargo build --release (if available)
    4. Run the resulting binary as a subprocess on a unique port
    5. Poll http://localhost:{port}/health until healthy
    6. XADD to ``benchmark_queue`` with target_url
    7. Mark status `deployed`; the benchmark worker takes it from here.

Subprocess lifetime: the engine keeps running until the next submission for
the same team OR the LOCAL_BUILDER_PROCESS_TTL expires (default 600s).

This is the demo/local-dev path. Production runs the real Dockerised builder
in uora.sandbox.builder.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aioboto3
import redis.asyncio as aioredis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("uora.sandbox.local_builder")

# ─── Configuration ──────────────────────────────────────────────────────────

REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "uora-submissions")

WORK_ROOT = Path(os.getenv("LOCAL_BUILDER_WORK_ROOT", "/tmp/uora-local"))
PORT_RANGE_START = int(os.getenv("LOCAL_BUILDER_PORT_START", "18100"))
PORT_RANGE_END = int(os.getenv("LOCAL_BUILDER_PORT_END", "18999"))
BUILD_TIMEOUT_SEC = int(os.getenv("LOCAL_BUILDER_BUILD_TIMEOUT", "60"))
HEALTH_TIMEOUT_SEC = int(os.getenv("LOCAL_BUILDER_HEALTH_TIMEOUT", "8"))
PROCESS_TTL = int(os.getenv("LOCAL_BUILDER_PROCESS_TTL", "600"))

STREAM = "build_queue"
GROUP = "builders"
CONSUMER = f"local-builder-{uuid.uuid4().hex[:6]}"
BLOCK_MS = 5000


# ─── Running engine registry ────────────────────────────────────────────────


@dataclass
class RunningEngine:
    submission_id: str
    process: subprocess.Popen
    port: int
    work_dir: Path
    started_at: float = field(default_factory=time.time)

    def is_alive(self) -> bool:
        return self.process.poll() is None

    def terminate(self) -> None:
        with contextlib.suppress(Exception):
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
        shutil.rmtree(self.work_dir, ignore_errors=True)


_running: dict[str, RunningEngine] = {}


def _alloc_port() -> int:
    """Pick a free port in the configured range."""
    used = {e.port for e in _running.values() if e.is_alive()}
    for port in range(PORT_RANGE_START, PORT_RANGE_END):
        if port in used:
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("No free ports in configured range")


def _gc_dead_processes() -> None:
    """Drop registry entries for processes that have exited or aged out."""
    now = time.time()
    stale = [
        sid for sid, eng in _running.items()
        if not eng.is_alive() or (now - eng.started_at) > PROCESS_TTL
    ]
    for sid in stale:
        _running.pop(sid).terminate()


# ─── Build/run primitives ──────────────────────────────────────────────────


def _list_sources(work_dir: Path, *patterns: str) -> list[Path]:
    """Glob source files, filtering macOS AppleDouble metadata (`._*`) and dotfiles."""
    out: list[Path] = []
    for pat in patterns:
        for p in sorted(work_dir.rglob(pat)):
            if p.name.startswith("._") or p.name.startswith("."):
                continue
            if "__MACOSX" in p.parts:
                continue
            out.append(p)
    return out


def _compile(language: str, work_dir: Path) -> tuple[list[str], str]:
    """
    Compile if needed; return (argv, build_log).
    Raises RuntimeError on compile failure.
    """
    log_lines: list[str] = []

    if language == "python":
        py_files = _list_sources(work_dir, "*.py")
        if not py_files:
            raise RuntimeError("No .py source found")
        # Prefer a file containing "engine" or "main" in the name; else first.
        entry = next(
            (p for p in py_files if any(k in p.name.lower() for k in ("engine", "main", "server"))),
            py_files[0],
        )
        log_lines.append("$ python3 --version")
        log_lines.append(subprocess.run(
            ["python3", "--version"], capture_output=True, text=True
        ).stdout.strip())
        log_lines.append(f"→ Entry: {entry.name}  (no compile step)")
        return ["python3", str(entry)], "\n".join(log_lines)

    if language == "cpp":
        cpp_files = (
            _list_sources(work_dir, "*.cpp")
            + _list_sources(work_dir, "*.cc")
            + _list_sources(work_dir, "*.cxx")
        )
        if not cpp_files:
            raise RuntimeError("No .cpp source found")

        # Provide common headers (httplib.h) automatically if missing — lets
        # contestants upload a single .cpp that includes "httplib.h" without
        # bundling the 700KB header themselves.
        examples_root = Path(__file__).resolve().parents[2] / "examples"
        for header in ("httplib.h",):
            src = examples_root / header
            dst = work_dir / header
            if src.is_file() and not dst.exists():
                shutil.copy(src, dst)
                log_lines.append(f"→ provided header: {header}")

        binary = work_dir / "engine"
        cmd = [
            "g++", "-O2", "-std=c++20", "-pthread",
            "-I", str(work_dir),
            "-o", str(binary), *[str(f) for f in cpp_files],
        ]
        log_lines.append("$ " + " ".join(cmd))
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=BUILD_TIMEOUT_SEC)
        if proc.stdout:
            log_lines.append(proc.stdout)
        if proc.stderr:
            log_lines.append(proc.stderr)
        if proc.returncode != 0:
            raise RuntimeError(f"g++ failed (exit {proc.returncode})")
        log_lines.append("✓ compile succeeded")
        return [str(binary)], "\n".join(log_lines)

    if language == "go":
        if not shutil.which("go"):
            raise RuntimeError("`go` toolchain not on PATH")
        binary = work_dir / "engine"
        cmd = ["go", "build", "-o", str(binary), "."]
        log_lines.append("$ " + " ".join(cmd))
        proc = subprocess.run(cmd, cwd=work_dir, capture_output=True, text=True, timeout=BUILD_TIMEOUT_SEC)
        if proc.stdout:
            log_lines.append(proc.stdout)
        if proc.stderr:
            log_lines.append(proc.stderr)
        if proc.returncode != 0:
            raise RuntimeError(f"go build failed (exit {proc.returncode})")
        return [str(binary)], "\n".join(log_lines)

    if language == "rust":
        if not shutil.which("cargo"):
            raise RuntimeError("`cargo` not on PATH")
        log_lines.append("$ cargo build --release")
        proc = subprocess.run(["cargo", "build", "--release"], cwd=work_dir,
                              capture_output=True, text=True, timeout=BUILD_TIMEOUT_SEC)
        if proc.stderr:
            log_lines.append(proc.stderr)
        if proc.returncode != 0:
            raise RuntimeError(f"cargo build failed (exit {proc.returncode})")
        # Find the produced binary
        for cand in (work_dir / "target/release").iterdir():
            if cand.is_file() and os.access(cand, os.X_OK):
                return [str(cand)], "\n".join(log_lines)
        raise RuntimeError("Rust binary not located")

    raise RuntimeError(f"Unsupported language: {language}")


async def _wait_for_health(port: int) -> bool:
    deadline = time.time() + HEALTH_TIMEOUT_SEC
    while time.time() < deadline:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection("127.0.0.1", port), timeout=0.5
            )
            req = (
                f"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                f"Connection: close\r\n\r\n"
            )
            writer.write(req.encode())
            await writer.drain()
            data = await asyncio.wait_for(reader.read(256), timeout=0.5)
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()
            if b"200 OK" in data or b"\"ok\"" in data:
                return True
        except Exception:
            await asyncio.sleep(0.15)
    return False


# ─── Builder ────────────────────────────────────────────────────────────────


class LocalBuilder:
    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None
        self._stopping = False

    async def start(self) -> None:
        self._redis = aioredis.Redis(
            host=REDIS_HOST, port=REDIS_PORT,
            password=REDIS_PASSWORD, decode_responses=True,
        )
        WORK_ROOT.mkdir(parents=True, exist_ok=True)

        # Ensure consumer group
        with contextlib.suppress(Exception):
            await self._redis.xgroup_create(STREAM, GROUP, id="$", mkstream=True)

        logger.info("LocalBuilder ready as %s (no Docker, no K8s)", CONSUMER)

        try:
            while not self._stopping:
                _gc_dead_processes()
                try:
                    messages = await self._redis.xreadgroup(
                        GROUP, CONSUMER, {STREAM: ">"}, count=1, block=BLOCK_MS,
                    )
                except Exception as e:
                    logger.exception("Redis read error: %s", e)
                    await asyncio.sleep(1)
                    continue
                if not messages:
                    continue
                for _stream, entries in messages:
                    for entry_id, fields in entries:
                        await self._handle(entry_id, fields)
        finally:
            await self._shutdown()

    async def _handle(self, entry_id: str, fields: dict) -> None:
        sub_id = fields.get("submission_id", "?")
        language = fields.get("language", "cpp")
        s3_key = fields.get("s3_key")
        if not s3_key:
            await self._set_status(sub_id, "failed", error="missing s3_key in build job")
            await self._redis.xack(STREAM, GROUP, entry_id)
            return

        logger.info("[%s] picked up: lang=%s key=%s", sub_id, language, s3_key)
        await self._set_status(sub_id, "building")

        work_dir = WORK_ROOT / sub_id
        work_dir.mkdir(parents=True, exist_ok=True)

        try:
            # 1. Download from MinIO
            await self._download(s3_key, work_dir)

            # 2. Compile (or no-op for Python)
            argv, build_log = _compile(language, work_dir)
            await self._set_status(sub_id, "built", build_log=build_log[-4000:])

            # 3. Allocate port + start subprocess
            port = _alloc_port()
            env = {**os.environ, "PORT": str(port)}
            proc = subprocess.Popen(
                argv, cwd=work_dir, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            )
            engine = RunningEngine(
                submission_id=sub_id, process=proc, port=port, work_dir=work_dir,
            )
            _running[sub_id] = engine

            # 4. Health check
            if not await _wait_for_health(port):
                engine.terminate()
                _running.pop(sub_id, None)
                raise RuntimeError(f"engine did not become healthy on port {port}")

            target_url = f"http://127.0.0.1:{port}"
            logger.info("[%s] deployed at %s", sub_id, target_url)

            # 5. Record + enqueue benchmark
            await self._redis.set(f"resources:{sub_id}", "1.0", ex=86400)
            await self._set_status(sub_id, "deployed", target_url=target_url)
            await self._redis.xadd("benchmark_queue", {
                "submission_id": sub_id,
                "target_url": target_url,
                "language": language,
                "protocol": "REST",
            })

        except Exception as exc:
            logger.exception("[%s] build pipeline failed", sub_id)
            await self._set_status(sub_id, "failed", error=str(exc)[:500])
        finally:
            await self._redis.xack(STREAM, GROUP, entry_id)

    async def _download(self, s3_key: str, dest_dir: Path) -> None:
        session = aioboto3.Session()
        async with session.client(
            "s3",
            endpoint_url=f"http://{MINIO_ENDPOINT}",
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            region_name="us-east-1",
        ) as client:
            obj = await client.get_object(Bucket=MINIO_BUCKET, Key=s3_key)
            body = await obj["Body"].read()

        # Sniff by magic bytes so we extract correctly regardless of the
        # backend's chosen s3_key extension (e.g. `.gz` for `.tar.gz`).
        import io
        head = body[:8]

        # gzip magic 1f 8b — likely .tar.gz
        if head[:2] == b"\x1f\x8b":
            import tarfile
            try:
                with tarfile.open(fileobj=io.BytesIO(body), mode="r:gz") as tar:
                    tar.extractall(dest_dir)
                logger.info("Extracted tar.gz (%d bytes) → %s", len(body), dest_dir)
                return
            except tarfile.ReadError:
                pass  # fall through — actually a single .gz of source

        # tar magic at offset 257: "ustar"
        if len(body) > 262 and body[257:262] == b"ustar":
            import tarfile
            with tarfile.open(fileobj=io.BytesIO(body), mode="r:") as tar:
                tar.extractall(dest_dir)
            logger.info("Extracted tar (%d bytes) → %s", len(body), dest_dir)
            return

        # zip magic PK\x03\x04
        if head[:4] == b"PK\x03\x04":
            import zipfile
            with zipfile.ZipFile(io.BytesIO(body)) as zf:
                zf.extractall(dest_dir)
            logger.info("Extracted zip (%d bytes) → %s", len(body), dest_dir)
            return

        # Raw single file: name it source.<ext> using the s3 key suffix.
        ext = s3_key.rsplit(".", 1)[-1] if "." in s3_key else "txt"
        out = dest_dir / f"source.{ext}"
        out.write_bytes(body)
        logger.info("Saved raw source (%d bytes) → %s", len(body), out)

    async def _set_status(self, sub_id: str, status: str, **extra) -> None:
        ts = datetime.now(timezone.utc).isoformat()
        fields = {"status": status, "updated_at": ts, f"{status}_at": ts}
        for k, v in extra.items():
            if v is not None:
                fields[k] = str(v)
        await self._redis.hset(f"submission:{sub_id}", mapping=fields)
        publish_payload = {
            "type": "submission_status",
            "submission_id": sub_id,
            "status": status,
            "updated_at": ts,
            **{k: str(v) for k, v in extra.items() if v is not None},
        }
        await self._redis.publish("uora:leaderboard:updates", json.dumps(publish_payload))

    async def _shutdown(self) -> None:
        logger.info("Shutting down — terminating %d running engines", len(_running))
        for engine in list(_running.values()):
            engine.terminate()
        _running.clear()
        if self._redis is not None:
            await self._redis.aclose()


async def main() -> None:
    builder = LocalBuilder()

    def stop(*_):
        builder._stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    await builder.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
