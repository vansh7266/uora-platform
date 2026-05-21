import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND_URL =
  process.env.UORA_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/leaderboard`, {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: "Backend unavailable" },
        { status: response.status || 502 }
      );
    }

    // Proxy the SSE stream directly to the browser without buffering.
    // proxyTimeout: 0 in next.config.mjs disables the undici body-read timeout
    // so this stream stays alive as long as the browser is connected.
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // tells nginx not to buffer SSE
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    // BodyTimeoutError / 'terminated' are expected when the backend restarts
    if (!msg.includes("Body Timeout") && !msg.includes("terminated")) {
      console.error("[leaderboard SSE proxy] error:", msg);
    }
    return NextResponse.json(
      { error: "Failed to connect to backend" },
      { status: 503 }
    );
  }
}
