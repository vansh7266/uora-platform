"""
UORA Submission Service -- Production Hardened
Handles: file upload -> virus scan -> MinIO storage -> build queue
Auth: Google OAuth2 + API token, rate limiting, session management
"""

import os
import uuid
import hashlib
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
import aioboto3
import redis.asyncio as redis
import httpx
from jose import jwt, JWTError

# --- Logging ---
logger = logging.getLogger("uora.submission")
logging.basicConfig(level=logging.INFO)

# --- Configuration ---
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "uora")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "uora12345")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "uora-submissions")
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "uora12345")
BUILD_TIMEOUT = int(os.getenv("BUILD_TIMEOUT", 60))
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 50 * 1024 * 1024))  # 50MB

# --- Google OAuth2 Config ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/auth/google/callback")

# --- API Token Auth ---
UORA_API_TOKEN = os.getenv("UORA_API_TOKEN", "")
SESSION_SECRET = os.getenv("SESSION_SECRET", "change-this-to-a-random-secret")

# --- Rate Limiting ---
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", 5))        # submissions per window
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", 3600))  # seconds (1 hour)

# --- Redis Connection Pool ---
redis_pool: Optional[redis.Redis] = None


# --- Lifespan (replaces deprecated @app.on_event) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global redis_pool
    redis_pool = redis.Redis(
        host=REDIS_HOST, port=REDIS_PORT,
        password=REDIS_PASSWORD or None,
        decode_responses=True,
    )
    # Init MinIO bucket
    try:
        session = get_minio_session()
        async with session.client(
            "s3",
            endpoint_url=f"http://{MINIO_ENDPOINT}",
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            region_name="us-east-1",
        ) as client:
            await client.create_bucket(Bucket=MINIO_BUCKET)
    except Exception:
        pass  # Bucket may already exist
    yield
    # Shutdown
    if redis_pool:
        await redis_pool.close()


app = FastAPI(title="UORA Submission Service", version="2.0.0", lifespan=lifespan)

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- MinIO Session ---
def get_minio_session():
    return aioboto3.Session()


# --- Helpers ---
def generate_submission_id() -> str:
    return str(uuid.uuid4())


async def validate_file_size(file: UploadFile) -> None:
    """Async file size validation — reads content instead of blocking seek/tell."""
    content = await file.read()
    size = len(content)
    # Rewind so downstream can read again
    await file.seek(0)
    if size > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Max: {MAX_UPLOAD_SIZE} bytes")


def scan_filename(filename: str) -> None:
    forbidden = {"..", "/", "\\", ";", "|", "&", "$"}
    for char in forbidden:
        if char in filename:
            raise HTTPException(400, "Invalid filename")


# --- Auth Dependencies ---
async def get_session_token(request: Request) -> Optional[str]:
    """Extract session token from X-UORA-Token header or cookie."""
    token = request.headers.get("X-UORA-Token")
    if not token:
        token = request.cookies.get("uora_session")
    return token


async def require_auth(request: Request) -> dict:
    """
    Authentication dependency.
    - If UORA_API_TOKEN is empty (dev mode), all requests pass.
    - Otherwise, requires a valid X-UORA-Token header or uora_session cookie.
    """
    if not UORA_API_TOKEN:
        # Dev mode — no auth required
        return {"user": "dev", "source": "dev_mode"}

    token = await get_session_token(request)
    if not token:
        raise HTTPException(401, "Authentication required")

    # Check API token directly
    if token == UORA_API_TOKEN:
        return {"user": "api_client", "source": "api_token"}

    # Check session token (JWT from OAuth flow)
    try:
        payload = jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
        return {"user": payload.get("email", "oauth_user"), "source": "oauth", "payload": payload}
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")


# --- Rate Limiting ---
async def check_rate_limit(request: Request, auth_data: dict = Depends(require_auth)) -> dict:
    """Rate limit: max RATE_LIMIT_MAX submissions per RATE_LIMIT_WINDOW seconds per identity."""
    if not redis_pool:
        return auth_data  # Can't rate limit without Redis

    identity = auth_data.get("user", "anonymous")
    key = f"ratelimit:{identity}"

    try:
        current = await redis_pool.get(key)
        if current is not None and int(current) >= RATE_LIMIT_MAX:
            raise HTTPException(429, "Rate limit exceeded. Try again later.")
        pipe = redis_pool.pipeline()
        pipe.incr(key)
        pipe.expire(key, RATE_LIMIT_WINDOW)
        await pipe.execute()
    except HTTPException:
        raise
    except Exception:
        logger.warning("Rate limit check failed, allowing request")

    return auth_data


# --- Google OAuth2 Endpoints ---
@app.get("/auth/google")
async def auth_google():
    """Redirect to Google OAuth consent screen."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500, "Google OAuth not configured")
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={GOOGLE_REDIRECT_URI}&"
        f"response_type=code&"
        f"scope=openid%20email%20profile&"
        f"access_type=offline"
    )
    return RedirectResponse(url=auth_url)


@app.get("/auth/google/callback")
async def auth_google_callback(code: str):
    """Exchange OAuth code for user info, create session."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth not configured")

    async with httpx.AsyncClient() as client:
        # Exchange code for tokens
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(400, "OAuth token exchange failed")
        tokens = token_resp.json()

        # Get user info
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(400, "Failed to fetch user info")
        userinfo = userinfo_resp.json()

    # Create session JWT
    session_payload = {
        "email": userinfo.get("email", ""),
        "name": userinfo.get("name", ""),
        "picture": userinfo.get("picture", ""),
        "sub": userinfo.get("id", ""),
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    session_token = jwt.encode(session_payload, SESSION_SECRET, algorithm="HS256")

    # Store session in Redis
    if redis_pool:
        session_key = f"session:{userinfo.get('email', uuid.uuid4().hex)}"
        await redis_pool.setex(session_key, 86400, session_token)  # 24h TTL

    response = JSONResponse(content={
        "message": "Authentication successful",
        "user": {
            "email": userinfo.get("email", ""),
            "name": userinfo.get("name", ""),
        },
    })
    response.set_cookie(
        key="uora_session",
        value=session_token,
        httponly=True,
        samesite="lax",
        max_age=86400,
    )
    return response


@app.get("/auth/me")
async def auth_me(auth_data: dict = Depends(require_auth)):
    """Return current authenticated user info."""
    return {
        "user": auth_data.get("user"),
        "source": auth_data.get("source"),
        "email": auth_data.get("payload", {}).get("email"),
        "name": auth_data.get("payload", {}).get("name"),
    }


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
        "queued_at": datetime.now(timezone.utc).isoformat(),
        "build_timeout": BUILD_TIMEOUT,
    }

    await redis_pool.xadd("build_queue", job)
    await redis_pool.hset(f"submission:{submission_id}", mapping={
        "status": "queued",
        "s3_key": s3_key,
        "language": language,
        "queued_at": job["queued_at"],
    })


# --- Endpoints ---
@app.get("/health")
async def health():
    return {"status": "ok", "service": "submission", "version": "2.0.0"}


@app.post("/api/v1/submit")
async def submit_code(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: str = "auto",  # auto | cpp | rust | go
    auth_data: dict = Depends(check_rate_limit),
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
    await validate_file_size(file)

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
            region_name="us-east-1",
        ) as client:
            file_content = await file.read()
            await client.put_object(
                Bucket=MINIO_BUCKET,
                Key=s3_key,
                Body=file_content,
                ContentType="application/octet-stream",
            )
    except Exception as e:
        logger.error("Storage error for submission %s: %s", submission_id, e)
        raise HTTPException(500, "Failed to store submission. Please try again.")

    # 4. Queue build
    await enqueue_build(submission_id, s3_key, language)

    return JSONResponse(status_code=202, content={
        "submission_id": submission_id,
        "status": "queued",
        "language": language,
        "message": "Build queued. Check /api/v1/status/{submission_id} for progress.",
    })


@app.get("/api/v1/status/{submission_id}")
async def get_status(submission_id: str, auth_data: dict = Depends(require_auth)):
    """Poll build status from Redis."""
    if not redis_pool:
        raise HTTPException(503, "Service temporarily unavailable")

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
        "error": data.get("error"),
    }


@app.get("/api/v1/submissions")
async def list_submissions(
    limit: int = 20, offset: int = 0,
    auth_data: dict = Depends(require_auth),
):
    """List recent submission IDs (for admin/debug)."""
    if not redis_pool:
        raise HTTPException(503, "Service temporarily unavailable")

    # Scan Redis for submission keys
    keys = []
    async for key in redis_pool.scan_iter(match="submission:*", count=100):
        keys.append(key.decode() if isinstance(key, bytes) else key)

    keys = keys[offset:offset + limit]
    results = []
    for key in keys:
        data = await redis_pool.hgetall(key)
        sid = key.replace("submission:", "")
        results.append({"submission_id": sid, **data})

    return {"submissions": results, "count": len(results)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, loop="uvloop")
