import { create } from "zustand";

export interface LeaderboardEntry {
  rank: number;
  prevRank: number;
  submission_id: string;
  team: string;
  avatar?: string;
  language: string;
  composite_score: number;
  p99_latency_ms: number;
  p50_latency_ms: number;
  p90_latency_ms: number;
  throughput: number;
  success_rate?: number;
  error_rate?: number;
  max_tps?: number;
  correctness_rate: number;
  status: "running" | "completed" | "scored" | "failed";
  anomaly_score: number;
  anomaly_type?: string;
}

export interface MetricUpdate {
  timestamp: number;
  p50: number;
  p90: number;
  p99: number;
  throughput: number;
}

export interface AnomalyEvent {
  timestamp: number;
  score: number;
  type: string;
  team: string;
}

export interface Submission {
  id: string;
  team: string;
  language: string;
  status:
    | "queued"
    | "building"
    | "built"
    | "deployed"
    | "benchmarking"
    | "validating"
    | "scored"
    | "failed";
  submittedAt: number;
  buildLog?: string;
  error?: string;
  failedStage?: string;
}

interface LeaderboardState {
  entries: LeaderboardEntry[];
  metrics: MetricUpdate[];
  anomalies: AnomalyEvent[];
  submissions: Submission[];
  connected: boolean;
  error: string | null;
  selectedEntry: LeaderboardEntry | null;
  lastUpdated: number | null;

  setEntries: (entries: LeaderboardEntry[]) => void;
  addMetrics: (metric: MetricUpdate) => void;
  addAnomaly: (anomaly: AnomalyEvent) => void;
  addSubmission: (submission: Submission) => void;
  updateSubmissionStatus: (id: string, status: Submission["status"], error?: string, failedStage?: string) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedEntry: (entry: LeaderboardEntry | null) => void;
}

export const useLeaderboardStore = create<LeaderboardState>()((set, get) => ({
  entries: [],
  metrics: [],
  anomalies: [],
  submissions: [],
  connected: false,
  error: null,
  selectedEntry: null,
  lastUpdated: null,

  setEntries: (entries) => {
    const prevEntries = get().entries;
    const enrichedEntries = entries
      .slice()
      .sort((a, b) => b.composite_score - a.composite_score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }))
      .map((entry) => {
        const prev = prevEntries.find(
          (e) => e.submission_id === entry.submission_id
        );
        return {
          ...entry,
          prevRank: prev ? prev.rank : entry.rank,
          language: entry.language || "cpp",
          p50_latency_ms: entry.p50_latency_ms ?? 0,
          p90_latency_ms: entry.p90_latency_ms ?? 0,
          anomaly_score: entry.anomaly_score ?? 0,
        };
      });
    set({ entries: enrichedEntries, lastUpdated: Date.now() });
  },

  addMetrics: (metric) =>
    set((state) => ({
      metrics: [...state.metrics.slice(-100), metric],
    })),

  addAnomaly: (anomaly) =>
    set((state) => ({
      anomalies: [...state.anomalies.slice(-50), anomaly],
    })),

  addSubmission: (submission) =>
    set((state) => {
      // Idempotent: skip if this ID is already tracked
      if (state.submissions.some((s) => s.id === submission.id)) return state;
      return { submissions: [submission, ...state.submissions] };
    }),

  updateSubmissionStatus: (id, status, error, failedStage) =>
    set((state) => ({
      submissions: state.submissions.map((s) => {
        if (s.id === id) {
          const calculatedFailedStage =
            status === "failed"
              ? failedStage ?? (s.status !== "failed" ? s.status : s.failedStage)
              : undefined;
          return {
            ...s,
            status,
            error: error ?? s.error,
            failedStage: calculatedFailedStage,
          };
        }
        return s;
      }),
    })),

  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),
  setSelectedEntry: (entry) => set({ selectedEntry: entry }),
}));
