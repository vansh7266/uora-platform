"use client";

import { useEffect, useRef, useCallback } from "react";
import { useLeaderboardStore } from "@/stores/useLeaderboardStore";

export function useSSE(url: string = "/api/leaderboard") {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;

  const {
    setEntries,
    addMetrics,
    addAnomaly,
    setConnected,
    setError,
  } = useLeaderboardStore();

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();

      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          30000
        );
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        setError("Connection lost. Please refresh the page.");
      }
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "leaderboard") {
          setEntries(
            data.entries.map((e: Record<string, unknown>) => ({
              ...e,
              prevRank: e.prevRank ?? e.rank,
              language: e.language ?? "C++",
              anomaly_score: e.anomaly_score ?? 0,
            }))
          );
        } else if (data.type === "metrics") {
          addMetrics({
            timestamp: data.timestamp,
            p50: data.p50,
            p90: data.p90,
            p99: data.p99,
            throughput: data.throughput,
          });

          // Simulate anomaly events based on metric spikes
          if (data.p99 > 2.0) {
            addAnomaly({
              timestamp: data.timestamp,
              score: Math.min(data.p99 / 3.0, 1.0),
              type: "latency_spike",
              team: "system",
            });
          }
        } else if (data.type === "anomaly") {
          addAnomaly({
            timestamp: data.timestamp,
            score: data.score,
            type: data.anomaly_type,
            team: data.team,
          });
        }
      } catch {
        console.error("Failed to parse SSE data");
      }
    };
  }, [url, setEntries, addMetrics, addAnomaly, setConnected, setError]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    reconnect: connect,
  };
}
