import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// In production, UORA_API_URL should be set to the Python backend URL.
// In docker-compose, the backend is named 'submission' on port 8000.
const BACKEND_URL = process.env.UORA_API_URL || "http://submission:8000";

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/leaderboard`, {
      headers: {
        "Accept": "text/event-stream",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Backend unavailable" }, { status: response.status });
    }

    // Proxy the stream
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to connect to backend" }, { status: 503 });
  }
}
