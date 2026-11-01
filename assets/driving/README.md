# Driving videos for Wan animate

Wan needs a **motion reference** `.mp4` plus a character/scene still.

## Quick test (synthetic)

```bash
npm run wan:drive:test
```

Creates `default.mp4` and `leap.mp4` (simple generated motion). Good for smoke tests; replace with real body motion for better results.

## Production tips

- Prefer a short (3–6s) clip of clear human/animal motion
- Name options:
  - `default.mp4` — used when `--drive` is omitted
  - `scene-4.mp4` — optional per-scene drive
  - `leap.mp4` — pass explicitly with `--drive`

```bash
npm run animate -- --provider wan \
  --episode data/episodes/your.json \
  --scene 4 \
  --drive assets/driving/leap.mp4
```

Full GPU rental steps: [`docs/gpu-rental-wan.md`](../../docs/gpu-rental-wan.md).
