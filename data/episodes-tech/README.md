# Tech Instagram episodes

JSON episode scripts for brand `tech-instagram`. Same scene shape as `data/episodes/` (mythology) — hook, scenes, timings — but:

- `brandId`: `tech-instagram`
- `primaryLanguage`: `en` (usually)
- `pillar`: one of `dsa` | `dsa-trap` | `sysdesign` | `architecture` | `app-build` | `tech-news` | `interview` | `tooling`

## Remotion code / booking visuals

For interview + concurrency episodes, put **exact** code in `hookTechVisual` / `scenes[].techVisual` — never in AI image prompts:

| `visualType` | Use for |
|---|---|
| `BOOKING_HALL` | Movie-hall seat map + dual BOOK taps (hook / scenario) |
| `CODE_PANEL` | Real monospace Python/SQL/text (`visualData.codeLines`) |

`onScreenCode` alone is **not** rendered. Produce uses Remotion when any `techVisual` is present (`episodeSupportsRemotionTech`).

Example Desk episode: `movie-ticket-race-condition-v2` (check-then-act booking race).

## Motion-studio sample episodes

These Desk episodes are imported from `data/tech-reels/*.json` so the rendered sample MP4s appear in the Tech Reels pipeline UI (script + selected final):

| Episode id | Storyboard | Style |
|---|---|---|
| `database-scaling` | `data/tech-reels/database-scaling.json` | editorial |
| `request-coalescing` | `data/tech-reels/request-coalescing.json` | orbital |
| `vertical-scaling` | `data/tech-reels/vertical-scaling.json` | scale-lab |
| `sample-sliding-window` | `data/tech-reels/sliding-window.json` | window-lab |

Finals live under `output/final/<id>-final-tech-reel.mp4`. Re-render with:

```sh
npm run tech:reel -- --storyboard data/tech-reels/<id>.json --tts elevenlabs
```

See [`docs/brands/tech-instagram-north-star.md`](../docs/brands/tech-instagram-north-star.md) and [`docs/tech-reels.md`](../docs/tech-reels.md).
