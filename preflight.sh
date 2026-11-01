#!/usr/bin/env bash
set -u

failures=0

check_command() {
  local name="$1"
  local severity="$2"
  if command -v "$name" >/dev/null 2>&1; then
    printf "[ok]   %-8s %s\n" "$name" "$(command -v "$name")"
  else
    printf "[%s] %-8s not found\n" "$severity" "$name"
    if [ "$severity" = "error" ]; then failures=$((failures + 1)); fi
  fi
}

echo "Mythology Factory preflight"
check_command node error
check_command npm error
check_command ollama warn
check_command ffmpeg warn

if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(`.`)[0]')"
  if [ "$major" -lt 20 ]; then
    echo "[error] Node 20 or newer is required"
    failures=$((failures + 1))
  else
    echo "[ok]   Node version $(node --version)"
  fi
fi

ollama_host="${OLLAMA_HOST:-http://127.0.0.1:11434}"
if command -v curl >/dev/null 2>&1 && curl --silent --fail --max-time 3 "$ollama_host/api/tags" >/dev/null 2>&1; then
  echo "[ok]   Ollama API reachable at $ollama_host"
else
  echo "[warn] Ollama API is not reachable at $ollama_host"
fi

if [ "$failures" -gt 0 ]; then
  echo "Preflight failed with $failures required issue(s)."
  exit 1
fi

echo "Preflight passed. FFmpeg is optional until the rendering phase."
