FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir "aiohttp>=3.9.0" "uvloop>=0.19.0"

COPY uora/__init__.py ./uora/__init__.py
COPY uora/bot_fleet ./uora/bot_fleet
COPY data ./data

CMD ["python", "-m", "uora.bot_fleet.run"]
