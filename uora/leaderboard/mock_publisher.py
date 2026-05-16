import asyncio
import json
import random
import time
import redis.asyncio as redis

async def main():
    print("Starting UORA Live Mock Publisher to Redis...")
    client = redis.from_url("redis://localhost:6379")
    
    # Wait for connection
    await client.ping()
    print("✓ Connected to Redis")

    p50_base = 0.5
    tps_base = 45000

    while True:
        timestamp = int(time.time() * 1000)
        
        # Add some random walk to metrics
        p50_base += random.uniform(-0.05, 0.05)
        p50_base = max(0.1, min(p50_base, 2.0))
        tps_base += random.uniform(-1000, 1000)
        tps_base = max(10000, min(tps_base, 80000))

        # 1. Publish metrics
        metrics = {
            "timestamp": timestamp,
            "p50": round(p50_base, 2),
            "p90": round(p50_base * 1.5, 2),
            "p99": round(p50_base * 2.5, 2),
            "throughput": int(tps_base)
        }
        await client.publish("uora_live_metrics", json.dumps(metrics))

        # 2. Publish leaderboard
        leaderboard = [
            {
                "rank": 1,
                "submission_id": "sub-001",
                "team": "Team Alpha",
                "composite_score": round(95.0 + random.uniform(-1, 1), 2),
                "p99_latency_ms": metrics["p99"],
                "throughput": metrics["throughput"],
                "correctness_rate": 0.999,
                "status": "running"
            },
            {
                "rank": 2,
                "submission_id": "sub-002",
                "team": "Team Beta",
                "composite_score": round(87.2 + random.uniform(-0.5, 0.5), 2),
                "p99_latency_ms": round(metrics["p99"] * 1.2, 2),
                "throughput": int(metrics["throughput"] * 0.8),
                "correctness_rate": 0.995,
                "status": "completed"
            },
            {
                "rank": 3,
                "submission_id": "sub-003",
                "team": "Team Gamma",
                "composite_score": round(82.1 + random.uniform(-0.5, 0.5), 2),
                "p99_latency_ms": round(metrics["p99"] * 1.5, 2),
                "throughput": int(metrics["throughput"] * 0.6),
                "correctness_rate": 0.980,
                "status": "failed"
            }
        ]
        # Sort by score just to be sure
        leaderboard.sort(key=lambda x: x["composite_score"], reverse=True)
        for i, entry in enumerate(leaderboard):
            entry["rank"] = i + 1

        await client.publish("uora_live_leaderboard", json.dumps(leaderboard))
        
        await asyncio.sleep(1.0)  # publish every 1 sec

if __name__ == "__main__":
    asyncio.run(main())
