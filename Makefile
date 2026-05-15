# UORA Platform -- Day 1 Makefile
.PHONY: up down logs test clean

up:
	docker-compose up --build -d

down:
	docker-compose down -v

logs:
	docker-compose logs -f submission

test:
	@echo "Testing submission endpoint..."
	@sleep 3
	@curl -X POST http://localhost:8000/health | python -m json.tool

clean:
	docker-compose down -v
	docker system prune -f
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete