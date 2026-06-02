# UORA Platform — Makefile
.PHONY: up down logs test test-lob test-ml test-validator test-health \
        test-integration benchmark e2e setup setup-k3s fmt clean

# ── Docker ──────────────────────────────────────────────────────────────────

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

# ── Testing ─────────────────────────────────────────────────────────────────

test:
	python3 -m pytest -x -q

test-lob:
	python3 -m pytest uora/validator/reference_lob.py -x -q

test-ml:
	python3 -m pytest uora/ml_detector/detector.py -x -q

test-validator:
	python3 -m pytest uora/validator/diff_engine.py -x -q

test-health:
	curl -sf http://localhost:8000/health

test-integration:
	$(MAKE) up
	@sleep 5
	python3 -m pytest tests/integration/test_pipeline.py -x -q
	$(MAKE) down

# ── Benchmark ───────────────────────────────────────────────────────────────

benchmark:
	python3 tests/load/stress_test.py --bots 1000 --duration 60

# Real end-to-end: TimescaleDB + Redis containers + the full
# benchmark→validate→score→serve pipeline against the reference engine,
# verified over the live SSE leaderboard. See scripts/local_e2e.sh.
e2e:
	bash scripts/local_e2e.sh

# ── Setup ───────────────────────────────────────────────────────────────────

setup:
	python3 -m pip install -e ".[dev]"
	cd uora/leaderboard && npm install

setup-k3s:
	k3s kubectl apply -f infra/k8s/namespace.yaml
	k3s kubectl apply -f infra/security/gvisor-runtimeclass.yaml
	k3s kubectl label namespace uora pod-security.kubernetes.io/enforce=restricted --overwrite

# ── Code Quality ────────────────────────────────────────────────────────────

fmt:
	black uora/ tests/ --quiet
	isort uora/ tests/ --quiet

# ── Cleanup ─────────────────────────────────────────────────────────────────

clean:
	docker-compose down -v
	docker system prune -f
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
