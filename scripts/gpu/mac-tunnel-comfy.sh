#!/usr/bin/env bash
# Mac helper: SSH tunnel to remote ComfyUI (Wan I2V)
#
# Vast template (this box):
#   ssh -p 16653 root@HOST -L 8080:localhost:18188
#   → Mac 8080 → remote ComfyUI on 18188
#   (remote 8080 is Jupyter; 8188 is often a Caddy proxy)
#
# Set WAN_COMFY_LOCAL_PORT / WAN_COMFY_REMOTE_PORT to match your box.
#
# Usage:
#   npm run wan:tunnel:comfy
#     → uses WAN_COMFY_SSH_HOST / WAN_COMFY_SSH_PORT from .env
#   ./scripts/gpu/mac-tunnel-comfy.sh root@HOST -p 16653 -i ~/.ssh/id_vastai
#
# Env:
#   WAN_COMFY_LOCAL_PORT=8080
#   WAN_COMFY_REMOTE_PORT=8080
#   WAN_COMFY_SSH_HOST=...
#   WAN_COMFY_SSH_PORT=16653
#   WAN_COMFY_SSH_USER=root
#   WAN_COMFY_SSH_KEY=~/.ssh/id_vastai
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ -f "$ENV_FILE" ]]; then
  # Load only Wan tunnel-related keys (ignore the rest of .env).
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      ''|\#*) continue ;;
      WAN_COMFY_LOCAL_PORT=*|WAN_COMFY_REMOTE_PORT=*|WAN_COMFY_SSH_HOST=*|WAN_COMFY_SSH_PORT=*|WAN_COMFY_SSH_USER=*|WAN_COMFY_SSH_KEY=*)
        key="${line%%=*}"
        val="${line#*=}"
        val="${val%\"}"; val="${val#\"}"
        val="${val%\'}"; val="${val#\'}"
        export "${key}=${val}"
        ;;
    esac
  done < "$ENV_FILE"
fi

LOCAL_PORT="${WAN_COMFY_LOCAL_PORT:-8080}"
REMOTE_PORT="${WAN_COMFY_REMOTE_PORT:-8080}"
SSH_HOST="${WAN_COMFY_SSH_HOST:-}"
SSH_PORT="${WAN_COMFY_SSH_PORT:-}"
SSH_USER="${WAN_COMFY_SSH_USER:-root}"
SSH_KEY="${WAN_COMFY_SSH_KEY:-$HOME/.ssh/id_vastai}"
# Expand ~
SSH_KEY="${SSH_KEY/#\~/$HOME}"

usage() {
  cat <<EOF
Usage:
  npm run wan:tunnel:comfy
  ./scripts/gpu/mac-tunnel-comfy.sh [user@host] [ssh args...]

With no args, uses .env:
  WAN_COMFY_SSH_HOST / WAN_COMFY_SSH_PORT / WAN_COMFY_SSH_USER / WAN_COMFY_SSH_KEY
  WAN_COMFY_LOCAL_PORT=${LOCAL_PORT}
  WAN_COMFY_REMOTE_PORT=${REMOTE_PORT}

Forwards ComfyUI:
  Mac 127.0.0.1:${LOCAL_PORT}
    → SSH
    → remote 127.0.0.1:${REMOTE_PORT}

Leave this terminal open while generating.

Then:
  curl http://127.0.0.1:${LOCAL_PORT}/system_stats
  curl http://127.0.0.1:${LOCAL_PORT}/queue
  npm run wan:health
EOF
}

SSH_EXTRA=()
TARGET=""

if [[ $# -ge 1 ]]; then
  TARGET="$1"
  shift || true
  SSH_EXTRA+=("$@")
elif [[ -n "$SSH_HOST" ]]; then
  TARGET="${SSH_USER}@${SSH_HOST}"
  if [[ -n "$SSH_PORT" ]]; then
    SSH_EXTRA+=(-p "$SSH_PORT")
  fi
  if [[ -f "$SSH_KEY" ]]; then
    SSH_EXTRA+=(-i "$SSH_KEY")
  fi
else
  usage
  exit 1
fi

# Keep tunnel alive across brief Vast flaps.
SSH_EXTRA+=(
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=6
  -o TCPKeepAlive=yes
  -o ExitOnForwardFailure=yes
  -o StrictHostKeyChecking=accept-new
)

echo "Tunnel: localhost:${LOCAL_PORT} → ${TARGET} → 127.0.0.1:${REMOTE_PORT} (ComfyUI)"
echo "Set: WAN_BACKEND=comfy WAN_COMFY_URL=http://127.0.0.1:${LOCAL_PORT}"
echo "Then: npm run wan:health"
echo "Ctrl+C stops the tunnel."
echo

exec ssh -N -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" "${SSH_EXTRA[@]}" "$TARGET"
