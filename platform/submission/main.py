"""
UORA Submission Service -- Day 1 Scaffold
Handles: file upload -> virus scan -> MinIO storage -> build queue
"""

import os
import uuid
import hashlib
import tempfile
import shutil
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
import aioboto3
import redis.asyncio as redis

# --- Configuration ---
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "uora")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "uora12345")
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
BUILD_TIMEOUT = int(os.getenv("BUILD_TIMEOUT", 60))
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 50 * 1024 * 1024))  # 50MB

app = FastAPI(title="UORA Submission Service", version="1.0.0")

# --- Redis Connection Pool ---
redis_pool: Optional[redis.Redis] = None

@app.on_event("startup")
async def startup():
    global redis_pool
    redis_pool = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

@app.on_event("shutdown")
async def shutdown():
    if redis_pool:
        await redis_pool.close()

# --- MinIO Session ---
def get_minio_session():
    return aioboto3.Session()

# --- Helpers ---
def generate_submission_id() -> str:
    return str(uuid.uuid4())

def validate_file_size(file: UploadFile) -> None:
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Max: {MAX_UPLOAD_SIZE} bytes")

def scan_filename(filename: str) -> None:
    forbidden = {"..", "/", "\\", ";", "|", "&", "$"}
    for char in forbidden:
        if char in filename:
            raise HTTPException(400, f"Forbidden character in filename: {char}")

# --- Build Queue Task ---
async def enqueue_build(submission_id: str, s3_key: str, language: str):
    """Push build job to Redis Streams for the sandbox worker to pick up."""
    if not redis_pool:
        raise RuntimeError("Redis not connected")

    job = {
        "submission_id": submission_id,
        "s3_key": s3_key,
        "language": language,
        "status": "queued",
        "queued_at": datetime.utcnow().isoformat(),
        "build_timeout": BUILD_TIMEOUT
    }

    await redis_pool.xadd("build_queue", job)
    await redis_pool.hset(f"submission:{submission_id}", mapping={
        "status": "queued",
        "s3_key": s3_key,
        "language": language,
        "queued_at": job["queued_at"]
    })

# --- Endpoints ---
@app.get("/health")
async def health():
    return {"status": "ok", "service": "submission", "version": "1.0.0"}

@app.post("/api/v1/submit")
async def submit_code(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: str = "auto"  # auto | cpp | rust | go
):
    """
    Accept contestant submission.
    Steps: validate -> store -> queue build.
    Returns submission_id immediately. Build is async.
    """
    # 1. Validate
    if not file.filename:
        raise HTTPException(400, "No file provided")
    scan_filename(file.filename)
    validate_file_size(file)

    # 2. Generate ID
    submission_id = generate_submission_id()
    ext = file.filename.split(".")[-1].lower()

    # Auto-detect language
    if language == "auto":
        lang_map = {"cpp": "cpp", "cc": "cpp", "c++": "cpp",
                    "rs": "rust", "go": "go", "py": "python"}
        language = lang_map.get(ext, "unknown")

    s3_key = f"submissions/{submission_id}/source.{ext}"

    # 3. Stream to MinIO
    try:
        session = get_minio_session()
        async with session.client(
            "s3",
            endpoint_url=f"http://{MINIO_ENDPOINT}",
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            region_name="us-east-1"
        ) as client:
            file_content = await file.read()
            await client.put_object(
                Bucket="uora-submissions",
                Key=s3_key,
                Body=file_content,
                ContentType="application/octet-stream"
            )
    except Exception as e:
        raise HTTPException(500, f"Storage error: {str(e)}")

    # 4. Queue build
    await enqueue_build(submission_id, s3_key, language)

    return JSONResponse(status_code=202, content={
        "submission_id": submission_id,
        "status": "queued",
        "language": language,
        "message": "Build queued. Check /api/v1/status/{submission_id} for progress."
    })

@app.get("/api/v1/status/{submission_id}")
async def get_status(submission_id: str):
    """Poll build status from Redis."""
    if not redis_pool:
        raise HTTPException(503, "Redis unavailable")

    data = await redis_pool.hgetall(f"submission:{submission_id}")
    if not data:
        raise HTTPException(404, "Submission not found")

    return {
        "submission_id": submission_id,
        "status": data.get("status", "unknown"),
        "language": data.get("language", "unknown"),
        "queued_at": data.get("queued_at"),
        "built_at": data.get("built_at"),
        "deployed_at": data.get("deployed_at"),
        "error": data.get("error")
    }

@app.get("/api/v1/submissions")
async def list_submissions(limit: int = 20, offset: int = 0):
    """List recent submission IDs (for admin/debug)."""
    if not redis_pool:
        raise HTTPException(503, "Redis unavailable")

    # Scan Redis for submission keys
    keys = []
    async for key in redis_pool.scan_iter(match="submission:*", count=100):
        keys.append(key.decode() if isinstance(key, bytes) else key)

    keys = keys[offset:offset+limit]
    results = []
    for key in keys:
        data = await redis_pool.hgetall(key)
        sid = key.replace("submission:", "")
        results.append({"submission_id": sid, **data})

    return {"submissions": results, "count": len(results)}

# --- Init MinIO Bucket on Startup ---
@app.on_event("startup")
async def init_minio_bucket():
    try:
        session = get_minio_session()
        async with session.client(
            "s3",
            endpoint_url=f"http://{MINIO_ENDPOINT}",
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            region_name="us-east-1"
        ) as client:
            await client.create_bucket(Bucket="uora-submissions")
    except Exception:
        pass  # Bucket may already exist

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, loop="uvloop")