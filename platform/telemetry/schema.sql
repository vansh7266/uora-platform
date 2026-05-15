-- UORA TimescaleDB Schema
-- High-resolution telemetry for HFT benchmarking

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 1. Latency Events (Raw Telemetry)
CREATE TABLE IF NOT EXISTS latency_events (
    time            TIMESTAMPTZ NOT NULL,
    submission_id   UUID NOT NULL,
    bot_id          TEXT,
    order_id        TEXT,
    endpoint        TEXT,
    latency_ns      BIGINT,
    status_code     INT,
    success         BOOLEAN
);

-- Convert to Hypertable
-- We use 1 hour chunks for high-frequency event data
SELECT create_hypertable('latency_events', 'time', chunk_time_interval => INTERVAL '1 hour', if_not_exists => TRUE);

-- 2. Correctness Violations
CREATE TABLE IF NOT EXISTS correctness_violations (
    time            TIMESTAMPTZ NOT NULL,
    submission_id   UUID NOT NULL,
    level           INT,
    order_id        TEXT,
    expected        JSONB,
    actual          JSONB,
    description     TEXT
);

-- 3. Benchmark Scores (Aggregated Results)
CREATE TABLE IF NOT EXISTS benchmark_scores (
    time             TIMESTAMPTZ NOT NULL,
    submission_id    UUID NOT NULL,
    throughput       FLOAT,
    correctness_rate FLOAT,
    p99_latency_ns   BIGINT,
    resource_penalty FLOAT,
    composite_score  FLOAT,
    anomaly_score    FLOAT
);

-- 4. Materialized View: 1-Minute Aggregates (Continuous)
CREATE MATERIALIZED VIEW IF NOT EXISTS latency_1min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    submission_id,
    COUNT(*) AS throughput,
    AVG(latency_ns) AS p50,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY latency_ns) AS p90,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ns) AS p99
FROM latency_events
GROUP BY bucket, submission_id;

-- 5. Indexes for fast retrieval by submission
CREATE INDEX IF NOT EXISTS idx_latency_submission_id ON latency_events (submission_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_violations_submission_id ON correctness_violations (submission_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_scores_submission_id ON benchmark_scores (submission_id, time DESC);
