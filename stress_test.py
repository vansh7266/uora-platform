import asyncio
import time
from uora.bot_fleet.coordinator import BotCoordinator

async def main():
    print("=" * 60)
    print("UORA STRESS TEST: 1000 BOTS × 60 SECONDS")
    print("=" * 60)
    
    coordinator = BotCoordinator()
    await coordinator.start("http://127.0.0.1:8080", 1000)
    
    # Load large scenario
    import json
    from pathlib import Path
    actions = json.loads(Path("data/lobster/sample_actions.json").read_text())
    # Duplicate 20x for volume
    actions = actions * 20
    
    await coordinator.load_scenario(actions)
    
    start = time.time()
    await coordinator.run_benchmark(60)
    elapsed = time.time() - start
    
    results = await coordinator.get_results()
    
    print(f"\n{'='*60}")
    print("STRESS TEST RESULTS")
    print(f"{'='*60}")
    print(f"Duration:        {elapsed:.1f}s")
    print(f"Total orders:      {results['total_orders']:,}")
    print(f"Orders/sec:        {results['total_orders']/elapsed:,.0f}")
    print(f"Avg latency:       {results['avg_latency_ns']/1e6:.2f} ms")
    print(f"Success rate:      {results['success_rate']*100:.1f}%")
    print(f"{'='*60}")
    
    # Validation
    try:
        assert results['total_orders'] > 50000, "Throughput too low"
        assert results['success_rate'] > 0.95, "Too many failures"
        assert results['avg_latency_ns'] < 10_000_000, "Latency too high"
        print("✅ STRESS TEST PASSED")
    finally:
        await coordinator.stop()

if __name__ == "__main__":
    asyncio.run(main())