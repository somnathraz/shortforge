# Rent a GPU for Wan animate (Path B)

Goal: run **Wan2.2 Animate NIM** on a cheap rented NVIDIA GPU (~RTX 4090 @ ~$0.30–0.70/hr), call it from your Mac over an SSH tunnel, animate **one hero scene**, then **stop the pod**.

Mac cannot run the NIM (no CUDA). Renting is the setup.

## Cost checklist

| Step | Approx |
|------|--------|
| RTX 4090 rent | ~$0.34–0.70/hr (~₹30–60) |
| First model download | 20–40+ min once (cache on volume if possible) |
| One scene animate | often 5–15 min after warm |
| Idle pod left on | wastes money — stop it |

Vs Veo Standard 8s (~$3.20): Wan on a 4090 for one clip is usually **cheaper** if you shut down.

## A. Create the pod (RunPod — recommended)

1. Sign up at [runpod.io](https://www.runpod.io/pricing).
2. Deploy a **Pod**:
   - GPU: **RTX 4090** (24GB)
   - Template: **RunPod Pytorch** or any Ubuntu + CUDA + Docker image
   - Disk: ≥ **50–80 GB** (model cache)
   - Expose SSH (default)
3. Optional: attach a **network volume** at `/opt/wan-nim-cache` so weights survive pod restarts.
4. Note: **SSH host, port, user** (often `root`) and your SSH key.

Vast.ai works the same idea: Ubuntu + Docker + NVIDIA toolkit + SSH.

## B. Put this repo on the GPU host

From your Mac (replace host/port/key):

```bash
# clone or rsync the project onto the pod
rsync -avz -e "ssh -p PORT" \
  --exclude node_modules --exclude output --exclude .git \
  ./ root@POD_IP:~/mythology-factory/
```

On the pod:

```bash
cd ~/mythology-factory
cp .env.wan-nim.example .env.wan-nim
# edit .env.wan-nim → set NGC_API_KEY (NGC catalog access)
chmod +x scripts/gpu/remote-start-wan.sh
./scripts/gpu/remote-start-wan.sh
```

Watch until warm:

```bash
docker compose -f docker-compose.wan-nim.yml logs -f wan-animate
curl -sf http://127.0.0.1:8000/v1/health/ready && echo OK
```

**Do not** publish port 8000 to the public internet. Use the Mac tunnel below.

## C. Mac tunnel + client `.env`

Terminal 1 (leave open):

```bash
chmod +x scripts/gpu/mac-tunnel.sh
./scripts/gpu/mac-tunnel.sh root@POD_IP -p PORT -i ~/.ssh/YOUR_KEY
```

In project `.env` on the Mac:

```text
WAN_NIM_BASE_URL=http://127.0.0.1:8000
WAN_NIM_API_KEY=
WAN_NIM_MODEL=Wan2.2-Animate-2-14B
WAN_NIM_TIMEOUT_MS=900000
WAN_DRIVE_VIDEO=assets/driving/default.mp4
```

Terminal 2:

```bash
npm run wan:health
# or
npm run animate -- --health --provider wan
```

## D. Test driving clip + animate scene 4

Create a synthetic drive video (or drop your own `assets/driving/leap.mp4`):

```bash
npm run wan:drive:test
```

Animate one hero scene (uses scene still + drive video):

```bash
npm run animate -- --provider wan \
  --episode data/episodes/1788467256565-why-hanuman-forgot-his-powers.json \
  --scene 4 \
  --drive assets/driving/leap.mp4
```

Clip lands under `output/ai-video/hanuman-forgot-powers/clips/wan/`.

Assemble later only if you have AI clips for every scene (`--all --assemble`). For production, keep Path A FFmpeg for other scenes and swap in the Wan clip manually or extend the assembler later.

Low-level Wan CLI (same NIM):

```bash
npm run wan:animate -- \
  --image output/images/hanuman-forgot-powers/scene-4.png \
  --video assets/driving/leap.mp4 \
  --prompt "Adult Hanuman receives power awakening aura, cinematic mythology motion" \
  --output output/wan/scene-4-wan.mp4
```

## E. Stop billing

1. Ctrl+C the Mac tunnel  
2. On pod: `docker compose -f docker-compose.wan-nim.yml down` (optional)  
3. **Stop / terminate the RunPod pod** in the dashboard  

## Files in this setup

| Path | Role |
|------|------|
| `docs/gpu-rental-wan.md` | This guide |
| `docker-compose.wan-nim.yml` | NIM container |
| `.env.wan-nim.example` | GPU-host secrets |
| `scripts/gpu/remote-start-wan.sh` | Start NIM on rented GPU |
| `scripts/gpu/mac-tunnel.sh` | SSH tunnel Mac → pod |
| `scripts/gpu/make-test-drive.sh` | Synthetic drive mp4 |

## NGC key

Create/get an NGC API key with NIM/catalog access: [https://ngc.nvidia.com](https://ngc.nvidia.com). Put it only in `.env.wan-nim` on the GPU host — never commit it.
