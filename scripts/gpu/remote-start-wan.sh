#!/usr/bin/env bash
# Run this ON the rented GPU host (RunPod / Vast / any CUDA Linux box).
# Prereqs: NVIDIA driver + Docker + NVIDIA Container Toolkit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.wan-nim ]]; then
  cp .env.wan-nim.example .env.wan-nim
  echo "Created .env.wan-nim — add NGC_API_KEY, then re-run."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.wan-nim
set +a

if [[ -z "${NGC_API_KEY:-}" ]]; then
  echo "NGC_API_KEY is empty in .env.wan-nim"
  exit 1
fi

echo "Logging into nvcr.io…"
printf '%s' "$NGC_API_KEY" | docker login nvcr.io --username '$oauthtoken' --password-stdin

mkdir -p "${NIM_CACHE_DIR:-/opt/wan-nim-cache}"

echo "Starting Wan2.2 Animate NIM (first boot downloads weights — can take 20–40+ min)…"
docker compose --env-file .env.wan-nim -f docker-compose.wan-nim.yml up -d

echo
echo "Follow logs until you see Pipeline warmup done:"
echo "  docker compose -f docker-compose.wan-nim.yml logs -f wan-animate"
echo
echo "Health (on this host):"
echo "  curl -sf http://127.0.0.1:${NIM_HTTP_PORT:-8000}/v1/health/ready && echo OK"
echo
echo "From your Mac: open an SSH tunnel (see docs/gpu-rental-wan.md), then:"
echo "  npm run wan:health"
