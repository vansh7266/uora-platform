FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends     gcc     libpq-dev     curl     && rm -rf /var/lib/apt/lists/*

# Python deps
COPY platform/submission/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Application code
COPY platform/submission/main.py /app/main.py

# Non-root user for security
RUN useradd -m -u 1000 uora && chown -R uora:uora /app
USER uora

EXPOSE 8000

CMD ["python", "main.py"]