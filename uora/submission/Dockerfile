FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends     gcc     libpq-dev     curl     && rm -rf /var/lib/apt/lists/*

# Python deps
COPY uora/submission/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Application code
COPY uora/submission/main.py /app/main.py
COPY uora/__init__.py /app/uora/__init__.py
COPY uora/telemetry/__init__.py /app/uora/telemetry/__init__.py
COPY uora/telemetry/migrations.py /app/uora/telemetry/migrations.py
# Scoring module — needed for the self-healing report regeneration path
# in /api/v1/report/{id}. Uses fpdf2 (pure Python, no system libs).
COPY uora/scoring /app/uora/scoring

# Non-root user for security
RUN useradd -m -u 1000 uora && chown -R uora:uora /app
USER uora

EXPOSE 8000

CMD ["python", "main.py"]
