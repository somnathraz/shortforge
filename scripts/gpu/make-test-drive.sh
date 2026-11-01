#!/usr/bin/env bash
# Create a short synthetic driving-motion mp4 for Wan tests (no copyrighted footage).
# Output: assets/driving/default.mp4 + leap.mp4
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/assets/driving"
mkdir -p "$OUT_DIR"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg required (brew install ffmpeg)"
  exit 1
fi

# 4s clip: moving box (clear motion for Wan smoke tests)
ffmpeg -y -f lavfi \
  -i "color=c=0x1a1a2e:s=512x512:d=4:r=24" \
  -vf "drawbox=x='160+120*sin(2*PI*t/2)':y='160+80*cos(2*PI*t/2)':w=120:h=180:color=0xe94560@1:t=fill,format=yuv420p" \
  -t 4 -c:v libx264 -pix_fmt yuv420p \
  "$OUT_DIR/default.mp4"

cp "$OUT_DIR/default.mp4" "$OUT_DIR/leap.mp4"

echo "Created:"
echo "  $OUT_DIR/default.mp4"
echo "  $OUT_DIR/leap.mp4"
echo "Replace leap.mp4 later with a real human/animal motion clip for better Wan results."
