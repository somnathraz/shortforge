# Wan2.2-Animate-2-14B NIM setup

This model performs character animation. It requires all three inputs:

- a reference character image (`.png`, `.jpg`, `.jpeg`, or `.webp`)
- a driving-motion video (`.mp4`)
- a short text prompt describing the motion

It is a downloadable NVIDIA NIM, not a hosted chat model. Run the container on a supported Linux machine with an NVIDIA GPU (your box **or a rented RunPod/Vast 4090**), then call it from the Mac over HTTP / SSH tunnel.

**Renting a GPU (recommended if you have no local NVIDIA):** follow [`docs/gpu-rental-wan.md`](gpu-rental-wan.md).

## 1. Configure the NVIDIA GPU host

Copy `.env.wan-nim.example` to `.env.wan-nim` on the GPU host and add the NGC personal API key. The key needs NGC Catalog access. `HF_TOKEN` is only needed if an additional model agreement requires it.

Log in without placing the key directly in shell history:

```bash
set -a
source .env.wan-nim
set +a
printf '%s' "$NGC_API_KEY" | docker login nvcr.io --username '$oauthtoken' --password-stdin
```

Start the NIM (or use the helper):

```bash
./scripts/gpu/remote-start-wan.sh
# or:
docker compose --env-file .env.wan-nim -f docker-compose.wan-nim.yml up
```

The first start downloads the model and warms the pipeline. Wait for `Pipeline warmup: start/done`.

Do not expose port 8000 directly to the public internet. Use a private network, VPN, SSH tunnel, or authenticated reverse proxy. If a proxy requires a bearer token, place that runtime token in `WAN_NIM_API_KEY` on the client; it is separate from `NGC_API_KEY`.

Mac tunnel helper:

```bash
./scripts/gpu/mac-tunnel.sh root@POD_IP -p PORT -i ~/.ssh/YOUR_KEY
```

## 2. Configure the Mac client

In the project `.env` (with tunnel open, use localhost):

```text
WAN_NIM_BASE_URL=http://127.0.0.1:8000
WAN_NIM_API_KEY=
WAN_NIM_MODEL=Wan2.2-Animate-2-14B
WAN_NIM_TIMEOUT_MS=900000
WAN_NIM_SEED=0
WAN_OUTPUT_DIR=output/wan
WAN_DRIVE_VIDEO=assets/driving/default.mp4
```

Check readiness:

```bash
npm run wan:health
```

Generate a synthetic drive clip for smoke tests:

```bash
npm run wan:drive:test
```

Animate via Path B:

```bash
npm run animate -- --provider wan \
  --episode data/episodes/episode.json \
  --scene 4 \
  --drive assets/driving/leap.mp4
```

Or low-level CLI:

```bash
npm run wan:animate -- \
  --image assets/characters/hanuman.png \
  --video assets/driving/leap.mp4 \
  --prompt "Hanuman gathers strength and leaps forward, stable face, cinematic movement" \
  --output output/wan/hanuman-leap.mp4
```

The client sends inputs as base64 data URLs to `/v1/infer` and decodes the returned video artifact. Long driving videos create larger requests and longer renders, so begin with a short test clip.

## Hardware note

Apple Silicon does not provide CUDA and cannot run the NVIDIA NIM container. Keep story generation local on the Mac if desired, and place only selected `AI_VIDEO` scenes on the remote NVIDIA GPU service. **Stop the rented pod when finished.**
