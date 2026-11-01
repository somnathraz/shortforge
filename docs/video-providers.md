# Video providers

Scene stills can be turned into motion clips by one of three providers. Stills-only episodes
(pan/zoom in FFmpeg) need none of this and cost nothing.

| Provider | Setup | Cost | Use when |
|---|---|---|---|
| **Runway** (hosted) | An API key | Pay per second of video | You do not have a GPU — start here |
| **Wan 2.2** (self-hosted) | A GPU box running ComfyUI + SSH tunnel | GPU rental by the hour | You have or rent a GPU and generate a lot |
| **Veo** (Google) | `GOOGLE_AI_API_KEY` + billing | Pay per second | Hero shots |

## Runway quick start (no GPU)

1. Create an API key at <https://dev.runwayml.com> and buy credits (minimum $10, $0.01 per credit).
2. In `.env`:
   ```text
   RUNWAY_API_KEY=key_...
   VIDEO_PROVIDER=runway
   RUNWAY_VIDEO_MODEL=gen4_turbo
   ```
3. `npm run ui`, open an episode → Scenes → the video panel now says **Runway** and shows your credit
   balance. Press *Check health*, tick scenes, generate.

CLI: `npm run animate -- --provider runway --episode data/episodes/<file>.json --scene 3`
(or `--provider runway` on `npm run produce`). MCP: `run_production_step` with `kind: "animate"`,
`videoProvider: "runway"`.

If `VIDEO_PROVIDER` is unset, Runway is chosen automatically when `RUNWAY_API_KEY` is set and no GPU host
(`WAN_COMFY_SSH_HOST`, `COMFYUI_URL`) is configured.

### What it costs

Prices are from <https://docs.dev.runwayml.com/guides/pricing> (check there — they change):

| Model | Credits / sec | ≈ USD / sec | 5 s clip |
|---|---|---|---|
| `gen4_turbo` (default) | 5 | $0.05 | $0.25 |
| `gen4.5` | 12 | $0.12 | $0.60 |
| `veo3.1_fast` (no audio) | 10 | $0.10 | $0.50 |
| `wan3` (720p) | 10 | $0.10 | $0.50 |

A typical Short with 3 animated scenes on `gen4_turbo` is about **$0.75–$1.50**. The factory prints an
estimate before each clip and records the cost in the episode's production report. Clips are
only generated for scenes you pick; a re-generate is billed again.

### Settings

| Variable | Default | Notes |
|---|---|---|
| `RUNWAY_VIDEO_MODEL` | `gen4_turbo` | Any image-to-video model id from Runway's pricing page |
| `RUNWAY_RATIO` | `720:1280` | 9:16 vertical. Must be valid for the model; Runway's error says which are |
| `RUNWAY_DURATIONS` | any 2–10 s for `gen4_turbo`; otherwise `5,10` | Clip length is the narration length rounded up, then snapped to this list |
| `RUNWAY_POLL_MS` / `RUNWAY_TIMEOUT_MS` | 5000 / 600000 | |

Notes: the scene still is re-encoded to a JPEG under ~3.5 MB before upload. Runway does not take a
negative prompt, so the scene's negative prompt is not sent. Cancelling a batch in the Desk cancels the
running Runway task.

## Wan 2.2 (self-hosted)

See the Wan sections of the README and `.env.example` (`WAN_COMFY_*`). It needs a GPU box, a ComfyUI
workflow and an SSH tunnel — the reason Runway is the recommended default for most people.
`npm run produce:wan` (multi-shot Wan production) is Wan-only.
