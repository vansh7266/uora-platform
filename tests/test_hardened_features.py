import pytest
import asyncio
import logging
from unittest.mock import MagicMock, AsyncMock, patch

from uora.bot_fleet.bot import TradingBot
from uora.bot_fleet.coordinator import BotCoordinator
from uora.telemetry.ingester import TelemetryIngester
from uora.sandbox.builder import SandboxBuilder


def test_extract_order_id_behavior():
    ingester = TelemetryIngester()
    # Explicit 9-field case
    assert ingester._extract_order_id("order-xyz", "req-abc") == "order-xyz"
    # Fallback when None
    assert ingester._extract_order_id(None, "req-abc") == "req-abc"
    # Fallback when "-"
    assert ingester._extract_order_id("-", "req-abc") == "req-abc"


@pytest.mark.asyncio
async def test_coordinator_rejects_unknown_action_type(caplog):
    coordinator = BotCoordinator()
    bot = MagicMock(spec=TradingBot)

    with pytest.raises(ValueError, match="Unknown action type: 'unknown'"):
        with caplog.at_level(logging.ERROR):
            await coordinator._dispatch(bot, {"type": "unknown"})

    assert "Unknown action type: unknown" in caplog.text


@pytest.mark.asyncio
async def test_coordinator_worker_resiliency(caplog):
    coordinator = BotCoordinator()
    bot = AsyncMock(spec=TradingBot)
    
    # Setup actions, one malformed (unknown type) and one valid
    coordinator._actions = [
        {"type": "unknown"},
        {"type": "limit", "side": "buy", "price": "100.5", "qty": 10}
    ]
    
    async def fake_measure_latency(coro):
        res = await coro
        return res, 12345

    bot.measure_latency.side_effect = fake_measure_latency
    
    # We want to run a quick benchmark of 1 second to test resiliency
    coordinator._bots = [bot]
    
    with caplog.at_level(logging.ERROR):
        await coordinator.run_benchmark(duration_sec=1)
        
    # The worker should log the error and continue, completing both actions
    assert coordinator._errors >= 1
    assert len(coordinator._records) >= 1
    assert "action dispatch failed" in caplog.text


def test_kubernetes_optional_fallback():
    builder = SandboxBuilder()
    
    # Patch kubernetes library to None to simulate lack of import
    with patch("uora.sandbox.builder.kubernetes", None):
        assert builder._init_kubernetes() is False


@pytest.mark.asyncio
async def test_builder_run_cmd_timeout_reclaims_resources():
    builder = SandboxBuilder()
    # Running a command that takes longer than the timeout
    with pytest.raises(RuntimeError, match="Command timed out"):
        await builder._run_cmd("sleep", "5", timeout=0.1)


@pytest.mark.asyncio
async def test_ingester_parses_9th_field_order_id():
    ingester = TelemetryIngester()
    # Log line with 9th field (order-xyz)
    line_with_order = "2024-01-15T10:30:00.000Z POST /api/v1/order 201 45 256 128 sub-550e8400-e29b-41d4-a716-446655440000-bot-01 order-xyz"
    await ingester.ingest_log_line(line_with_order)
    assert len(ingester._buffer) == 1
    assert ingester._buffer[0]["order_id"] == "order-xyz"

    # Log line without 9th field (should fallback to request_id)
    line_without_order = "2024-01-15T10:30:00.000Z POST /api/v1/order 201 45 256 128 sub-550e8400-e29b-41d4-a716-446655440000-bot-01"
    await ingester.ingest_log_line(line_without_order)
    assert len(ingester._buffer) == 2
    assert ingester._buffer[1]["order_id"] == "sub-550e8400-e29b-41d4-a716-446655440000-bot-01"
