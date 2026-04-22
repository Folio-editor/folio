# Docker run notes
# Run these from the project root after Docker Desktop starts:
# Start: docker compose -f infra/dev/docker-compose.dev.yml up -d
# Stop:  docker compose -f infra/dev/docker-compose.dev.yml down
#
# ============================================================
# FastAPI (uvicorn) image
# ============================================================
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install -e .

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
