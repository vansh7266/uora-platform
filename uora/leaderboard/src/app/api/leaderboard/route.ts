import { NextResponse } from "next/server";
import { createClient } from "redis";

// Ensure this API route is dynamically rendered to support streaming
export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  // We create a new stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = createClient({
          url: process.env.REDIS_URL || "redis://localhost:6379",
        });

        client.on("error", (err) => console.error("Redis Client Error", err));
        await client.connect();

        // Subscribe to leaderboard and metrics channels
        await client.subscribe("uora_live_leaderboard", (message) => {
          try {
            const data = JSON.parse(message);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "leaderboard", entries: data })}\n\n`)
            );
          } catch (e) {
            console.error("Failed to parse leaderboard msg:", message);
          }
        });

        await client.subscribe("uora_live_metrics", (message) => {
          try {
            const data = JSON.parse(message);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "metrics", ...data })}\n\n`)
            );
          } catch (e) {
            console.error("Failed to parse metrics msg:", message);
          }
        });

        // Send an initial heartbeat
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));

        // Keep connection alive with heartbeats
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        }, 15000);

        // Cleanup on client disconnect
        // (Next.js does not reliably call cancel() on browser disconnect yet,
        // but we add this for completeness)
        controller.close = () => {
          clearInterval(heartbeat);
          client.quit();
        };
      } catch (err) {
        console.error("Failed to start Redis subscriber:", err);
        controller.error(err);
      }
    },
    cancel() {
      // Called when the client aborts the connection
      console.log("Client disconnected from SSE stream");
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
