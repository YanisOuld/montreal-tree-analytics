# syntax=docker/dockerfile:1

# ------------------------------------------------------------------
# Étape 1 — build du frontend (React + Vite)
# ------------------------------------------------------------------
FROM node:20-slim AS frontend
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Clé CARTO injectée au build (variable de service Railway). Vide = filigrane
# CARTO, mais l'app fonctionne quand même.
ARG VITE_CARTO_KEY=""
ENV VITE_CARTO_KEY=$VITE_CARTO_KEY
RUN npm run build

# ------------------------------------------------------------------
# Étape 2 — backend (FastAPI) qui sert l'API + le frontend compilé
# ------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS backend
WORKDIR /app/backend

# Dépendances d'abord (cache Docker).
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-install-project

# Code backend + couche gold versionnée (data/gold).
COPY backend/ ./
# Frontend compilé servi par FastAPI (voir _FRONTEND_DIST dans api.py).
COPY --from=frontend /app/frontend/dist ./frontend_dist

ENV PATH="/app/backend/.venv/bin:$PATH"
ENV PORT=8000
EXPOSE 8000

# Railway fournit $PORT ; forme shell pour l'expansion de variable.
CMD uvicorn api:app --app-dir src --host 0.0.0.0 --port ${PORT:-8000}
