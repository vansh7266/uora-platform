"""
UORA Chaos Engineering Module
Network degradation injection for resilience testing.
Uses Linux tc (traffic control) via Docker container exec.
"""

from __future__ import annotations

import asyncio
import random
import subprocess
from dataclasses import dataclass
from enum import Enum, auto
from typing import Optional


class ChaosMode(Enum):
    LATENCY = auto()
    PACKET_LOSS = auto()
    JITTER = auto()
    BANDWIDTH = auto()
    CORRUPT = auto()
    DUPLICATE = auto()
    REORDER = auto()
    COMBINED = auto()


@dataclass
class ChaosProfile:
    mode: ChaosMode
    duration_sec: int
    delay_ms: int = 0
    jitter_ms: int = 0
    percentage: float = 0.0
    correlation: float = 0.0
    rate_kbit: int = 0
    secondary_mode: Optional[ChaosMode] = None
    secondary_params: dict = None

    def __post_init__(self):
        if self.secondary_params is None:
            self.secondary_params = {}


class ChaosInjector:
    def __init__(self, target_interface: str = "eth0") -> None:
        self.interface = target_interface
        self.active_profiles: list[ChaosProfile] = []
        self._tc_available = self._check_tc()

    def _check_tc(self) -> bool:
        try:
            result = subprocess.run(
                ["tc", "qdisc", "show"],
                capture_output=True, text=True, timeout=5
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def _build_tc_command(self, profile: ChaosProfile) -> list[str]:
        base = ["tc", "qdisc", "add", "dev", self.interface, "root", "netem"]
        if profile.mode == ChaosMode.LATENCY:
            if profile.jitter_ms > 0:
                base.extend(["delay", f"{profile.delay_ms}ms", f"{profile.jitter_ms}ms"])
            else:
                base.extend(["delay", f"{profile.delay_ms}ms"])
        elif profile.mode == ChaosMode.PACKET_LOSS:
            base.extend(["loss", f"{profile.percentage}%"])
            if profile.correlation > 0:
                base.append(f"{profile.correlation}%")
        elif profile.mode == ChaosMode.JITTER:
            base.extend(["delay", f"{profile.delay_ms}ms", f"{profile.jitter_ms}ms", "distribution", "normal"])
        elif profile.mode == ChaosMode.BANDWIDTH:
            base.extend(["rate", f"{profile.rate_kbit}kbit"])
        elif profile.mode == ChaosMode.CORRUPT:
            base.extend(["corrupt", f"{profile.percentage}%"])
        elif profile.mode == ChaosMode.DUPLICATE:
            base.extend(["duplicate", f"{profile.percentage}%"])
        elif profile.mode == ChaosMode.REORDER:
            base.extend(["reorder", f"{profile.percentage}%", f"{profile.correlation}%"])
        elif profile.mode == ChaosMode.COMBINED:
            base.extend(["delay", f"{profile.delay_ms}ms", "loss", f"{profile.percentage}%"])
        return base

    async def inject(self, profile: ChaosProfile) -> bool:
        if not self._tc_available:
            print("⚠ tc not available — running in simulation mode")
            return await self._simulate_chaos(profile)
        cmd = self._build_tc_command(profile)
        await self._clear_rules()
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode == 0:
            self.active_profiles.append(profile)
            print(f"✓ Chaos injected: {profile.mode.name} for {profile.duration_sec}s")
            asyncio.create_task(self._auto_clear(profile.duration_sec))
            return True
        else:
            print(f"✗ Chaos injection failed: {stderr.decode().strip()}")
            return False

    async def _simulate_chaos(self, profile: ChaosProfile) -> bool:
        print(f"[SIMULATION] Injecting {profile.mode.name}:")
        if profile.delay_ms:
            print(f"  → Simulating {profile.delay_ms}ms delay per packet")
        if profile.percentage:
            print(f"  → Simulating {profile.percentage}% packet loss")
        if profile.rate_kbit:
            print(f"  → Simulating {profile.rate_kbit}kbit bandwidth cap")
        self.active_profiles.append(profile)
        asyncio.create_task(self._auto_clear(profile.duration_sec))
        return True

    async def _auto_clear(self, delay_sec: int) -> None:
        await asyncio.sleep(delay_sec)
        await self.clear()

    async def clear(self) -> bool:
        if not self._tc_available:
            print("[SIMULATION] Chaos cleared")
            self.active_profiles.clear()
            return True
        proc = await asyncio.create_subprocess_exec(
            "tc", "qdisc", "del", "dev", self.interface, "root",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        self.active_profiles.clear()
        print("✓ Chaos rules cleared")
        return True

    async def _clear_rules(self) -> None:
        if not self._tc_available:
            return
        proc = await asyncio.create_subprocess_exec(
            "tc", "qdisc", "del", "dev", self.interface, "root",
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )
        await proc.communicate()

    @staticmethod
    def market_open_burst() -> ChaosProfile:
        return ChaosProfile(mode=ChaosMode.COMBINED, duration_sec=5, delay_ms=5, jitter_ms=2, percentage=1.0, rate_kbit=100000)

    @staticmethod
    def flash_crash() -> ChaosProfile:
        return ChaosProfile(mode=ChaosMode.COMBINED, duration_sec=10, delay_ms=200, jitter_ms=50, percentage=5.0, rate_kbit=50000)

    @staticmethod
    def network_degradation() -> ChaosProfile:
        return ChaosProfile(mode=ChaosMode.JITTER, duration_sec=30, delay_ms=50, jitter_ms=30)

    @staticmethod
    def ddos_simulation() -> ChaosProfile:
        return ChaosProfile(mode=ChaosMode.COMBINED, duration_sec=15, delay_ms=500, percentage=15.0, rate_kbit=10000)


class ChaosBenchmarkRunner:
    def __init__(self, coordinator, injector: ChaosInjector) -> None:
        self.coordinator = coordinator
        self.injector = injector
        self.results: list[dict] = []

    async def run_with_chaos(self, profile: ChaosProfile, benchmark_duration: int) -> dict:
        print(f"\n{'='*60}")
        print(f"UORA CHAOS BENCHMARK: {profile.mode.name}")
        print(f"{'='*60}")
        print("\n[PHASE 1] Baseline measurement (5s)...")
        await self.coordinator.run_benchmark(5)
        baseline = await self.coordinator.get_results()
        print(f"  Baseline: {baseline['total_orders']} orders, {baseline['avg_latency_ns']/1e6:.2f}ms avg")
        inject_at = random.randint(2, max(3, benchmark_duration - 5))
        print(f"\n[PHASE 2] Running benchmark ({benchmark_duration}s)...")
        print(f"  Chaos injection at t={inject_at}s")
        benchmark_task = asyncio.create_task(self.coordinator.run_benchmark(benchmark_duration))
        await asyncio.sleep(inject_at)
        await self.injector.inject(profile)
        await benchmark_task
        chaos_results = await self.coordinator.get_results()
        print("\n[PHASE 3] Recovery measurement (5s)...")
        await self.coordinator.run_benchmark(5)
        recovery = await self.coordinator.get_results()
        print(f"  Recovery: {recovery['total_orders']} orders, {recovery['avg_latency_ns']/1e6:.2f}ms avg")
        resilience = self._calculate_resilience(baseline, chaos_results, recovery)
        result = {
            "profile": profile.mode.name,
            "duration": benchmark_duration,
            "baseline": baseline,
            "chaos": chaos_results,
            "recovery": recovery,
            "resilience_score": resilience,
            "passed": resilience > 0.5
        }
        self.results.append(result)
        return result

    def _calculate_resilience(self, baseline: dict, chaos: dict, recovery: dict) -> float:
        baseline_orders = max(baseline["total_orders"], 1)
        chaos_orders = max(chaos["total_orders"], 1)
        recovery_orders = max(recovery["total_orders"], 1)
        baseline_latency = max(baseline["avg_latency_ns"], 1)
        chaos_latency = max(chaos["avg_latency_ns"], 1)
        throughput_ratio = min(chaos_orders / baseline_orders, 1.0)
        latency_ratio = min(baseline_latency / chaos_latency, 1.0)
        recovery_ratio = min(recovery_orders / baseline_orders, 1.0)
        score = (throughput_ratio * 0.4) + (latency_ratio * 0.3) + (recovery_ratio * 0.3)
        return round(score, 4)


async def test_chaos_profiles() -> None:
    injector = ChaosInjector()
    profiles = [ChaosInjector.market_open_burst(), ChaosInjector.flash_crash(), ChaosInjector.network_degradation(), ChaosInjector.ddos_simulation()]
    for profile in profiles:
        print(f"\nTesting {profile.mode.name}...")
        success = await injector.inject(profile)
        assert success, f"Failed to inject {profile.mode.name}"
        await asyncio.sleep(profile.duration_sec + 0.5)
    print("\n✓ All chaos profiles tested")


async def test_resilience_scoring() -> None:
    baseline = {"total_orders": 1000, "avg_latency_ns": 1_000_000}
    chaos = {"total_orders": 600, "avg_latency_ns": 5_000_000}
    recovery = {"total_orders": 900, "avg_latency_ns": 1_500_000}
    runner = ChaosBenchmarkRunner(None, ChaosInjector())
    score = runner._calculate_resilience(baseline, chaos, recovery)
    assert 0.5 < score < 0.6, f"Expected ~0.57, got {score}"
    print(f"✓ Resilience score correct: {score}")


async def main() -> None:
    print("Running UORA Chaos Engineering Tests...\n")
    await test_chaos_profiles()
    await test_resilience_scoring()
    print("\n✅ All chaos engineering tests passed.")


if __name__ == "__main__":
    asyncio.run(main())
