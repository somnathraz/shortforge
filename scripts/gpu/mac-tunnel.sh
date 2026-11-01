#!/usr/bin/env bash
# Mac helper: SSH tunnel to a rented GPU so Wan looks like localhost:8000
# Usage:
#   ./scripts/gpu/mac-tunnel.sh root@<POD_IP> [-p 22]
#   ./scripts/gpu/mac-tunnel.sh root@<POD_IP> -i ~/.ssh/runpod_key -p 22
set -euo pipefail

if [[ $# -lt 1 ]]; then
  cat <<'EOF'
Usage: ./scripts/gpu/mac-tunnel.sh <user@host> [ssh args...]

Examples:
  ./scripts/gpu/mac-tunnel.sh root@1.2.3.4
  ./scripts/gpu/mac-tunnel.sh root@1.2.3.4 -p 22123 -i ~/.ssh/id_ed25519

Forwards local 8000 → remote 8000 (Wan NIM).
Leave this terminal open while you animate.
EOF
  exit 1
fi

TARGET="$1"
shift || true

echo "Tunnel: localhost:8000 → ${TARGET}:8000"
echo "In another terminal set: WAN_NIM_BASE_URL=http://127.0.0.1:8000"
echo "Then: npm run wan:health"
echo "Ctrl+C stops the tunnel (and you should stop the GPU pod to save money)."
echo

exec ssh -N -L 8000:127.0.0.1:8000 "$@" "$TARGET"
