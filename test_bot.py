import asyncio
import sys
sys.path.insert(0, "uora/bot-fleet")
from bot import TradingBot

async def main():
    bot = TradingBot()
    await bot.connect("http://localhost:8080")
    
    # Test limit order
    result, latency = await bot.measure_latency(
        bot.send_limit_order("buy", 100.50, 10)
    )
    print(f"Limit order: {result['status']} | Latency: {latency}ns")
    
    # Test market order
    result, latency = await bot.measure_latency(
        bot.send_market_order("sell", 5)
    )
    print(f"Market order: {result['status']} | Latency: {latency}ns")
    
    # Test scenario
    actions = [
        {"type": "limit", "side": "buy", "price": 101.00, "qty": 20},
        {"type": "limit", "side": "sell", "price": 102.00, "qty": 15},
        {"type": "market", "side": "buy", "qty": 10},
    ]
    results = await bot.run_scenario(actions)
    for r in results:
        print(f"Action: {r['action']['type']} | Status: {r['result']['status']} | Latency: {r['latency_ns']}ns")
    
    await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())