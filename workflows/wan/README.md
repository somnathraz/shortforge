# Wan ComfyUI workflows (API format)

## Architecture (EpicAstra)

```text
Mac / content-tool
     │  WAN_COMFY_URL=http://127.0.0.1:8188
     │  SSH tunnel: local 8188 → remote 18188
     ▼
Vast.ai GPU
     ├── :8188  Caddy (portal — not the API)
     └── :18188 ComfyUI → Wan2.2 I2V → output
```

- **ComfyUI** loads Wan and generates videos (port **18188** on this Vast template)
- **SSH tunnel** maps Mac `localhost:8188` → Vast `127.0.0.1:18188`
- **content-tool** uploads stills + `videoPrompt` / `videoNegativePrompt` via Comfy API
- **FFmpeg on Mac** assembles clips + narration

See **[NODE_MAP.md](./NODE_MAP.md)** for exact API node IDs.

## One-time: export working workflow

Already present as `wan22-i2v-a14b-api.json` when exported. Re-export if the graph changes:

1. Run one successful Wan 2.2 Image-to-Video in ComfyUI
2. Menu → **Save (API Format)**
3. Save over `workflows/wan/wan22-i2v-a14b-api.json`

## Checklist

1. Vast Jupyter: `curl http://127.0.0.1:18188/system_stats` → JSON
2. Mac tunnel: `npm run wan:tunnel:comfy -- root@HOST -p PORT` (leave open)
3. Mac: `curl http://127.0.0.1:8188/system_stats` → same JSON
4. `.env`: `WAN_BACKEND=comfy`, `WAN_COMFY_URL=http://127.0.0.1:8188`, `WAN_COMFY_WIDTH=704`, `WAN_COMFY_HEIGHT=1280`
5. UI Images → Wan panel → Check health → Generate one scene

## CLI

```bash
npm run wan:health
npm run wan:scene -- --episode data/episodes/file.json --scene 4
npm run wan:batch -- --episode data/episodes/file.json
```
