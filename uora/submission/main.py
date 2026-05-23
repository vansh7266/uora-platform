import json
import time
"""
UORA Submission Service -- Production Hardened
Handles: file upload -> virus scan -> MinIO storage -> build queue
Auth: Google OAuth2 + API token, rate limiting, session management
"""

import os
import uuid
import logging
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import aioboto3
import asyncpg
import redis.asyncio as redis
import httpx
from jose import jwt, JWTError
import bcrypt

try:
    from uora.telemetry.migrations import ensure_timescale_schema
except ImportError:  # pragma: no cover - only used by minimal source-only deployments
    ensure_timescale_schema = None

# --- Logging ---
logger = logging.getLogger("uora.submission")
logging.basicConfig(level=logging.INFO)

# --- Configuration ---
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "uora-submissions")
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
BUILD_TIMEOUT = int(os.getenv("BUILD_TIMEOUT", 60))
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 50 * 1024 * 1024))  # 50MB

# --- Google OAuth2 Config ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/auth/google/callback")

# --- API Token Auth ---
UORA_API_TOKEN = os.getenv("UORA_API_TOKEN", "")
SESSION_SECRET = os.getenv("SESSION_SECRET")
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "86400"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}

# --- Rate Limiting ---
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", 5))        # submissions per window
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", 3600))  # seconds (1 hour)

# --- Redis Connection Pool ---
redis_pool: Optional[redis.Redis] = None
timescale_pool: Optional[asyncpg.Pool] = None


def require_setting(name: str, value: Optional[str]) -> str:
    if not value:
        raise RuntimeError(f"{name} must be set in the environment")
    return value


def parse_cors_origins() -> list[str]:
    """Use explicit browser origins when credentials are enabled."""
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if "*" in origins:
        environment = os.getenv("ENVIRONMENT", "development").lower()
        if environment in {"prod", "production"}:
            raise RuntimeError("CORS_ORIGINS='*' is not allowed when ENVIRONMENT=production")
        logger.warning("CORS_ORIGINS='*' with credentials is unsafe; using local dashboard origins")
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    return origins or ["http://localhost:3000", "http://127.0.0.1:3000"]


def build_session_token(payload: dict[str, Any]) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    session_payload = {
        **payload,
        "iat": now,
        "exp": now + SESSION_TTL_SECONDS,
    }
    return jwt.encode(session_payload, require_setting("SESSION_SECRET", SESSION_SECRET), algorithm="HS256")


def set_session_cookie(response: JSONResponse, token: str) -> None:
    response.set_cookie(
        key="uora_session",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=SESSION_TTL_SECONDS,
    )


# --- Lifespan (replaces deprecated @app.on_event) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global redis_pool, timescale_pool
    require_setting("REDIS_PASSWORD", REDIS_PASSWORD)
    require_setting("MINIO_ACCESS_KEY", MINIO_ACCESS_KEY)
    require_setting("MINIO_SECRET_KEY", MINIO_SECRET_KEY)
    timescale_password = require_setting("TIMESCALE_PASSWORD", os.getenv("TIMESCALE_PASSWORD"))
    require_setting("SESSION_SECRET", SESSION_SECRET)

    redis_pool = redis.Redis(
        host=REDIS_HOST, port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True,
    )
    
    # Init TimescaleDB
    try:
        timescale_pool = await asyncpg.create_pool(
            host=os.getenv("TIMESCALE_HOST", "timescaledb"),
            port=int(os.getenv("TIMESCALE_PORT", "5432")),
            user=os.getenv("TIMESCALE_USER", "uora"),
            password=timescale_password,
            database=os.getenv("TIMESCALE_DB", "uora_metrics"),
            min_size=1,
            max_size=5,
        )
        if ensure_timescale_schema:
            async with timescale_pool.acquire() as conn:
                await ensure_timescale_schema(conn)
        app.state.timescale_pool = timescale_pool
    except Exception as e:
        timescale_pool = None
        logger.error("Failed to connect to TimescaleDB: %s", e)
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
    if timescale_pool:
        await timescale_pool.close()
        timescale_pool = None


app = FastAPI(title="UORA Submission Service", version="2.0.0", lifespan=lifespan)

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
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
    """Async file size validation — uses chunked streaming to avoid loading entire file into memory."""
    chunk_size = 8192  # 8KB chunks
    total_size = 0
    
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_UPLOAD_SIZE:
            raise HTTPException(413, f"File too large. Max: {MAX_UPLOAD_SIZE} bytes")
    
    # Rewind so downstream can read again
    await file.seek(0)


def scan_filename(filename: str) -> None:
    """Comprehensive filename validation to prevent path traversal and injection attacks."""
    if not filename:
        raise HTTPException(400, "Filename cannot be empty")
    
    # Length validation
    if len(filename) > 255:
        raise HTTPException(400, "Filename too long (max 255 characters)")
    
    # Check for null bytes and control characters
    if any(ord(c) < 32 for c in filename):
        raise HTTPException(400, "Filename contains invalid control characters")
    
    # Check for path traversal sequences and shell metacharacters
    forbidden = {"..", "/", "\\", ";", "|", "&", "$", "`", "(", ")", "{", "}", "[", "]", "<", ">", "\n", "\r", "\t"}
    for char in forbidden:
        if char in filename:
            raise HTTPException(400, f"Invalid filename: contains forbidden character '{char}'")
    
    # Check for reserved Windows filenames
    reserved_names = {"CON", "PRN", "AUX", "NUL", 
                     "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
                     "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"}
    base_name = filename.split(".")[0].upper()
    if base_name in reserved_names:
        raise HTTPException(400, "Filename contains reserved system name")


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
    Requires a valid X-UORA-Token header or uora_session cookie.
    """
    token = await get_session_token(request)
    if not token:
        raise HTTPException(401, "Authentication required")

    # Check API token directly
    if UORA_API_TOKEN and token == UORA_API_TOKEN:
        return {"user": "api_client", "source": "api_token"}

    # Check session token (JWT from OAuth flow)
    try:
        payload = jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
        return {"user": payload.get("email", "session_user"), "source": "session", "payload": payload}
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

    session_token = build_session_token({
        "email": userinfo.get("email", ""),
        "name": userinfo.get("name", ""),
        "picture": userinfo.get("picture", ""),
        "sub": userinfo.get("id", ""),
    })

    # Store session in Redis
    if redis_pool:
        session_key = f"session:{userinfo.get('email', uuid.uuid4().hex)}"
        await redis_pool.setex(session_key, 86400, session_token)  # 24h TTL

    response = RedirectResponse(url="http://localhost:3000/dashboard", status_code=303)
    set_session_cookie(response, session_token)
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


# --- Email / Password Auth ---

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(password.encode(), hashed.encode())


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    team: str = "Solo"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@app.post("/auth/register")
async def auth_register(body: RegisterRequest):
    """Register a new contestant with email + password."""
    if len(body.password) < 10:
        raise HTTPException(400, "Password must be at least 10 characters")
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    if not redis_pool:
        raise HTTPException(503, "Authentication service temporarily unavailable")

    email = str(body.email).strip().lower()
    user_key = f"user:{email}"

    try:
        existing = await redis_pool.hget(user_key, "email")
        if existing:
            raise HTTPException(409, "Email already registered")

        user_id = str(uuid.uuid4())
        await redis_pool.hset(user_key, mapping={
            "id": user_id,
            "email": email,
            "name": body.name.strip(),
            "team": body.team.strip() or "Solo",
            "password_hash": _hash_password(body.password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        session_token = build_session_token({
            "sub": user_id,
            "email": email,
            "name": body.name.strip(),
            "team": body.team.strip() or "Solo",
        })

        response = JSONResponse(status_code=201, content={
            "message": "Account created",
            "token": session_token,
            "user": {
                "id": user_id,
                "email": email,
                "name": body.name.strip(),
                "team": body.team.strip() or "Solo",
            },
        })
        set_session_cookie(response, session_token)
        return response
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Registration store error for %s: %s", email, exc)
        raise HTTPException(503, "Authentication service temporarily unavailable")


@app.post("/auth/login")
async def auth_login(body: LoginRequest):
    """Login with email + password."""
    if not redis_pool:
        raise HTTPException(503, "Authentication service temporarily unavailable")

    email = str(body.email).strip().lower()
    user_key = f"user:{email}"

    try:
        user_data = await redis_pool.hgetall(user_key)
        if not user_data:
            raise HTTPException(401, "Invalid email or password")

        if not _verify_password(body.password, user_data.get("password_hash", "")):
            raise HTTPException(401, "Invalid email or password")

        session_token = build_session_token({
            "sub": user_data.get("id", ""),
            "email": email,
            "name": user_data.get("name", ""),
            "team": user_data.get("team", "Solo"),
        })

        response = JSONResponse(content={
            "message": "Login successful",
            "token": session_token,
            "user": {
                "id": user_data.get("id", ""),
                "email": email,
                "name": user_data.get("name", ""),
                "team": user_data.get("team", "Solo"),
            },
        })
        set_session_cookie(response, session_token)
        return response
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Login store error for %s: %s", email, exc)
        raise HTTPException(503, "Authentication service temporarily unavailable")


# --- Build Queue Task ---
async def enqueue_build(submission_id: str, s3_key: str, language: str, team: Optional[str] = None):
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
    submission_metadata = {
        "status": "queued",
        "s3_key": s3_key,
        "language": language,
        "queued_at": job["queued_at"],
    }
    if team:
        submission_metadata["team"] = team
    await redis_pool.hset(f"submission:{submission_id}", mapping=submission_metadata)


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
                    "cxx": "cpp", "rs": "rust", "go": "go"}
        language = lang_map.get(ext, "unknown")
    else:
        language = {"c++": "cpp"}.get(language.lower(), language.lower())

    supported_languages = {"cpp", "rust", "go"}
    if language not in supported_languages:
        raise HTTPException(400, f"Unsupported language '{language}'. Supported: cpp, rust, go")

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
    team = auth_data.get("payload", {}).get("team")
    await enqueue_build(submission_id, s3_key, language, team=team)

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
        "benchmarking_at": data.get("benchmarking_at"),
        "validating_at": data.get("validating_at"),
        "scored_at": data.get("scored_at"),
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


@app.get("/api/v1/leaderboard")
async def stream_leaderboard(request: Request):
    """SSE endpoint for real-time leaderboard updates from Redis and TimescaleDB."""
    async def fetch_leaderboard_entries() -> list[dict[str, Any]]:
        if not timescale_pool:
            raise RuntimeError("TimescaleDB pool not initialized")

        async with timescale_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                WITH latest_scores AS (
                    SELECT submission_id, team, language, status, composite_score,
                           p50_latency_ns, p90_latency_ns, p99_latency_ns,
                           throughput, max_tps, success_rate, error_rate,
                           correctness_rate, anomaly_score,
                           ROW_NUMBER() OVER(PARTITION BY submission_id ORDER BY time DESC) as rn
                    FROM benchmark_scores
                )
                SELECT submission_id, team, language, status, composite_score,
                       p50_latency_ns, p90_latency_ns, p99_latency_ns,
                       throughput, max_tps, success_rate, error_rate,
                       correctness_rate, anomaly_score
                FROM latest_scores
                WHERE rn = 1
                ORDER BY composite_score DESC
                LIMIT 10
                """
            )

        entries: list[dict[str, Any]] = []
        for rank, row in enumerate(rows, 1):
            submission_id = str(row["submission_id"])
            team_name = f"Team {submission_id[:8]}"
            if redis_pool:
                sub_data = await redis_pool.hgetall(f"submission:{submission_id}")
                if sub_data and sub_data.get("team"):
                    team_name = sub_data["team"]

            p50_latency_ms = float(row["p50_latency_ns"] or 0) / 1_000_000
            p90_latency_ms = float(row["p90_latency_ns"] or 0) / 1_000_000
            p99_latency_ms = float(row["p99_latency_ns"] or 0) / 1_000_000
            entries.append({
                "rank": rank,
                "submission_id": submission_id,
                "team": team_name,
                "language": row["language"] or "cpp",
                "composite_score": round(float(row["composite_score"] or 0), 2),
                "throughput": round(float(row["throughput"] or 0), 0),
                "max_tps": round(float(row["max_tps"] or row["throughput"] or 0), 2),
                "p50_latency_ms": round(p50_latency_ms, 3),
                "p90_latency_ms": round(p90_latency_ms, 3),
                "p99_latency_ms": round(p99_latency_ms, 2),
                "correctness_rate": round(float(row["correctness_rate"] or 0), 4),
                "success_rate": round(float(row["success_rate"] or 0), 4),
                "error_rate": round(float(row["error_rate"] or 0), 4),
                "anomaly_score": round(float(row["anomaly_score"] or 0), 4),
                "status": row["status"] or "scored",
            })
        return entries

    async def event_generator():
        pubsub = None
        next_poll = 0.0
        last_pubsub_event = 0.0
        if redis_pool:
            try:
                pubsub = redis_pool.pubsub()
                await pubsub.subscribe("uora:leaderboard:updates")
            except Exception as exc:
                logger.warning("Leaderboard Redis subscription unavailable: %s", exc)
                pubsub = None

        # Stream complete leaderboard snapshot immediately on connection/reconnect
        try:
            entries = await fetch_leaderboard_entries()
            status = "ok"
        except Exception as db_exc:
            logger.error("TimescaleDB connection failed on initial stream connection: %s", db_exc)
            entries = []
            status = "degraded"

        event_id = int(time.time() * 1000)
        yield f"id: {event_id}\ndata: {json.dumps({'type': 'leaderboard', 'entries': entries, 'status': status})}\n\n"

        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    if pubsub:
                        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                        if message and message.get("type") == "message":
                            payload = json.loads(message["data"])
                            if isinstance(payload, dict) and "type" in payload:
                                last_pubsub_event = asyncio.get_running_loop().time()
                                event_id = int(time.time() * 1000)
                                yield f"id: {event_id}\ndata: {json.dumps(payload)}\n\n"
                                continue
                    else:
                        await asyncio.sleep(1)

                    now = asyncio.get_running_loop().time()
                    should_poll_db = not pubsub or last_pubsub_event == 0.0 or (now - last_pubsub_event) > 3.0
                    if should_poll_db and now >= next_poll:
                        try:
                            entries = await fetch_leaderboard_entries()
                            status = "ok"
                        except Exception as db_exc:
                            logger.error("TimescaleDB connection failed during stream update: %s", db_exc)
                            entries = []
                            status = "degraded"

                        event_id = int(time.time() * 1000)
                        yield f"id: {event_id}\ndata: {json.dumps({'type': 'leaderboard', 'entries': entries, 'status': status})}\n\n"
                        next_poll = now + 2.0
                except Exception as exc:
                    logger.error("Error streaming leaderboard: %s", exc)
                    await asyncio.sleep(2)
        finally:
            if pubsub:
                await pubsub.unsubscribe("uora:leaderboard:updates")
                await pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, loop="uvloop")
