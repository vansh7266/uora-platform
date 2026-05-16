"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

interface LeaderboardEntry {
  rank: number;
  submission_id: string;
  team: string;
  composite_score: number;
  p99_latency_ms: number;
  throughput: number;
  correctness_rate: number;
  status: "running" | "completed" | "failed";
}

interface MetricUpdate {
  timestamp: number;
  p50: number;
  p90: number;
  p99: number;
  throughput: number;
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [metrics, setMetrics] = useState<MetricUpdate[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // SSE connection for live leaderboard
    const eventSource = new EventSource("/api/leaderboard");

    eventSource.onopen = () => setConnected(true);
    eventSource.onerror = () => setConnected(false);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "leaderboard") {
        setEntries(data.entries);
      } else if (data.type === "metrics") {
        setMetrics(prev => [...prev.slice(-50), data]);
      }
    };

    return () => eventSource.close();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              UORA Leaderboard
            </h1>
            <p className="text-slate-400 mt-1">IICPC Summer Hackathon 2026 — Live Benchmarking</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="text-sm text-slate-400">{connected ? "LIVE" : "OFFLINE"}</span>
          </div>
        </div>
      </div>

      {/* Metrics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h2 className="text-lg font-semibold mb-4 text-cyan-400">Latency Percentiles (ms)</h2>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timestamp" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155" }} />
                <Line type="monotone" dataKey="p50" stroke="#22d3ee" strokeWidth={2} name="p50" />
                <Line type="monotone" dataKey="p90" stroke="#818cf8" strokeWidth={2} name="p90" />
                <Line type="monotone" dataKey="p99" stroke="#f472b6" strokeWidth={2} name="p99" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h2 className="text-lg font-semibold mb-4 text-cyan-400">Throughput (orders/sec)</h2>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timestamp" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155" }} />
                <Bar dataKey="throughput" fill="#22d3ee" name="TPS" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-cyan-400">Rankings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-400 text-sm border-b border-slate-800">
                <th className="px-6 py-3 font-medium">Rank</th>
                <th className="px-6 py-3 font-medium">Team</th>
                <th className="px-6 py-3 font-medium">Score</th>
                <th className="px-6 py-3 font-medium">P99 Latency</th>
                <th className="px-6 py-3 font-medium">Throughput</th>
                <th className="px-6 py-3 font-medium">Correctness</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.submission_id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm
                      ${entry.rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                        entry.rank === 2 ? "bg-slate-400/20 text-slate-300" :
                        entry.rank === 3 ? "bg-orange-600/20 text-orange-400" :
                        "bg-slate-800 text-slate-400"}`}>
                      {entry.rank}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium">{entry.team}</td>
                  <td className="px-6 py-4">
                    <span className="text-cyan-400 font-mono font-bold">{entry.composite_score.toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{entry.p99_latency_ms.toFixed(2)} ms</td>
                  <td className="px-6 py-4 text-slate-300">{entry.throughput.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${entry.correctness_rate >= 0.99 ? "text-green-400" : "text-yellow-400"}`}>
                      {(entry.correctness_rate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium
                      ${entry.status === "running" ? "bg-blue-500/20 text-blue-400" :
                        entry.status === "completed" ? "bg-green-500/20 text-green-400" :
                        "bg-red-500/20 text-red-400"}`}>
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Waiting for benchmark data...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-slate-600 text-sm">
        UORA — Unified Orderbook Resilience Architecture · IICPC 2026
      </div>
    </div>
  );
}
