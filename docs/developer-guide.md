# Developer guide (EpicAstra pipeline, Wan/GPU, full CLI)

> New here? Start with the [README](../README.md). This is the long-form operator guide: the mythology pipeline end to end, self-hosted Wan on a rented GPU, and every CLI.

Cinematic Shorts factory — **topic → script → voice → images → Wan motion → sound → package → publish**.

Primary product is **EpicAstra** (Indian mythology). The same Desk also supports a second pipeline (**Tech Reels**) with separate episode folders and LLM prompts.

**Not** a generic AI stock-footage factory. Positioning: [`docs/epicastra-north-star.md`](epicastra-north-star.md).  
Provider policy: [`docs/provider-strategy.md`](provider-strategy.md).  
Multi-brand / pipelines: [`docs/brands/README.md`](brands/README.md).

## Pipeline

```text
topics / story  →  TTS (Edge | Sarvam | ElevenLabs)
                →  scene images (Gemini / Pollinations)
                →  Wan I2V clips (Comfy on Vast via SSH tunnel)
                →  Sound Director (SFX + BGM mix)
                →  produce (assemble Short) → package → review → publish
```

Primary UI: **Shortforge** studio at [http://127.0.0.1:8787](http://127.0.0.1:8787).

---

## Development setup

Follow these steps on a **Mac** (Apple Silicon fine). Linux may work for most CLI paths; Wan tunnel scripts assume macOS/`ssh`.

### 1. Prerequisites

| Tool | Required? | Notes |
| --- | --- | --- |
| **Node.js 20+** | Yes | `node -v` |
| **npm** | Yes | Comes with Node |
| **ffmpeg** + **ffprobe** | Yes for produce/publish | `brew install ffmpeg` |
| **Git** | Yes | Clone + ignore local media |
| **SSH key for Vast** | For Wan motion | e.g. `~/.ssh/id_vastai` |
| **Ollama** | Optional | Local story LLM only |

```bash
# Homebrew examples
brew install node@20 ffmpeg
# optional local LLM
brew install ollama && ollama serve
```

Verify:

```bash
./preflight.sh
# Expect: node/npm ok; ffmpeg/ollama may warn until you need them
```

### 2. Clone and install

```bash
git clone <your-repo-url> mythology-factory
cd mythology-factory

npm install                 # root (CLI + API)
npm --prefix ui install     # Desk React app
```

Or one shot for UI assets:

```bash
npm run ui:build            # installs ui deps + production build into ui/dist
```

### 3. Environment file

```bash
cp .env.example .env
```

**Never commit `.env`.** Fill keys as you need features:

| Area | Minimum vars | Used for |
| --- | --- | --- |
| Story | `STORY_PROVIDER` + matching key (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, …) | Generate / import validation helpers |
| Images | `GOOGLE_AI_API_KEY` (Gemini) and/or Pollinations (no key) | Scene stills |
| Voice | none for Edge; `SARVAM_API_KEY` / `ELEVENLABS_API_KEY` for paid | TTS |
| Wan | `WAN_COMFY_SSH_HOST`, `WAN_COMFY_SSH_PORT`, `WAN_COMFY_SSH_KEY` | GPU tunnel |
| Publish | YouTube / Instagram / Facebook + optional S3 | Upload after review |

Starter story config (free hosted tier):

```text
STORY_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-…
OPENROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b:free
OPENROUTER_MAX_TOKENS=16384
OPENROUTER_REASONING_EFFORT=low
```

Image starter:

```text
IMAGE_PROVIDER=gemini
GOOGLE_AI_API_KEY=…
GOOGLE_IMAGE_MODEL=gemini-2.5-flash-image
```

Full annotated list: [`.env.example`](.env.example).

### 4. Sanity check

```bash
npm run typecheck
npm test
# or everything:
npm run check
```

### 5. Run the Desk

**Production-style (API serves built UI):**

```bash
npm run ui:build
npm run ui
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787).

**Hot reload (two terminals):**

```bash
# Terminal A — API + jobs
npm run ui

# Terminal B — Vite (proxies /api → 8787)
npm run ui:dev
```

Then open the Vite URL (usually [http://127.0.0.1:5173](http://127.0.0.1:5173)).

Routes: home `/` → login `/login` → desk `/desk` (auth required).

**Shortforge login:** operator access for the video studio. If `DESK_AUTH_PASSWORD` is unset, the local default password is `desk` (any email). Before going Live, set in `.env`:

```bash
DESK_AUTH_EMAIL=you@studio.com
DESK_AUTH_PASSWORD=your-strong-password
# optional: DESK_AUTH_SECRET=
```

After changing server code under `src/ui-server/`, restart `npm run ui`. After UI-only changes in `ui/`, Vite hot-reloads; for `npm run ui` alone, rebuild with `npm run ui:build`.

### 6. First episode on Desk (no Wan yet)

1. Sign in, then pick a **pipeline** (EpicAstra or Tech Reels). Choice is remembered in `localStorage`.
2. **Script** — Generate story, or **Import script JSON** / paste LLM brief output.
3. Approve claims (mythology) → approve script.
4. **Voice** — `tts:free` works without keys; then mix / approve.
5. **Visuals** — Generate images (Gemini or Pollinations).
6. **Produce** — Still works with Ken Burns only if you skip Wan; final may be still-motion only.
7. **Review** → **Package** → **Publish** (after OAuth — see publish docs).

Episode JSON fields that drive media:

| Field | Used for |
| --- | --- |
| `scenes[].visualPrompt` | Still image **scene action** (style wrapper added by pipeline) |
| `scenes[].videoPrompt` | Wan motion (falls back to visualPrompt + camera if empty) |
| `scenes[].videoNegativePrompt` | Wan negative |
| `featuredLords` | Character / diagram locks for images |

### 7. Multi-pipeline (EpicAstra vs Tech)

| | EpicAstra | Tech Reels |
| --- | --- | --- |
| Episodes | `data/episodes/` | `data/episodes-tech/` |
| LLM brief | Mythology | Tech (`TECH_EDUCATION`) |
| Switch | Top-bar pipeline menu | Same |

Desk sends `X-Pipeline` on API calls. Download LLM brief / Generate story follow the **active** pipeline.

Guides: [`docs/brands/multi-pipeline-ui-plan.md`](brands/multi-pipeline-ui-plan.md), [`docs/brands/tech-instagram-north-star.md`](brands/tech-instagram-north-star.md).

### 8. Wan / Comfy GPU (scene video)

Mac is the brain; rented GPU (Vast, etc.) runs ComfyUI.

```text
Mac localhost:8188  ──SSH──►  GPU box 127.0.0.1:18188  (ComfyUI Wan 2.2 I2V)
```

**Important:** Do **not** tunnel Jupyter `:8080`. Real Comfy is **18188** on the pod. Host `:8188` is often Caddy.

#### 8a. One-time SSH key

1. Create or reuse a key (example `~/.ssh/id_vastai`).
2. Add the **public** key in the Vast account / instance.
3. Confirm: `ssh -i ~/.ssh/id_vastai -p PORT root@HOST echo OK`

#### 8b. Put instance into `.env`

Vast remaps host/port every rental — update these when you rent a new box:

```text
WAN_BACKEND=comfy
WAN_COMFY_URL=http://127.0.0.1:8188
WAN_COMFY_LOCAL_PORT=8188
WAN_COMFY_REMOTE_PORT=18188
WAN_COMFY_SSH_HOST=YOUR_HOST_OR_sshN.vast.ai
WAN_COMFY_SSH_PORT=YOUR_MAPPED_PORT
WAN_COMFY_SSH_USER=root
WAN_COMFY_SSH_KEY=~/.ssh/id_vastai
WAN_COMFY_WORKFLOW=workflows/wan/wan22-i2v-a14b-api.json
```

#### 8c. Wait for Comfy on the pod

New instances often download Wan weights before listening on `18188`. On the pod:

```bash
curl -sS http://127.0.0.1:18188/system_stats
# expect HTTP 200 JSON
```

#### 8d. Tunnel + health (leave tunnel running)

```bash
npm run wan:tunnel:comfy
# equivalent:
# ssh -i ~/.ssh/id_vastai -p PORT -N -L 8188:127.0.0.1:18188 root@HOST

# other terminal:
npm run wan:health
```

If `wan:health` fails: tunnel dead, wrong port, or Comfy still downloading. Restart tunnel after updating `.env`, then restart Desk so health UI picks up new `WAN_COMFY_SSH_*`.

Desk: open episode → **Scene videos** → Check health → generate.

More: [`workflows/wan/README.md`](workflows/wan/README.md), [`docs/gpu-rental-wan.md`](gpu-rental-wan.md), [`docs/full-wan-production.md`](full-wan-production.md).

Sampler: `quality` ≈ 20-step; `fast` ≈ LightX2V 4-step LoRA (Desk toggle / `WAN_COMFY_QUALITY_MODE`).

### 9. Publish (optional for local prod)

After a reviewed final:

1. Configure OAuth / tokens per [`docs/publish-setup.md`](publish-setup.md).
2. YouTube reconnect: `npm run publish:youtube-auth` (writes refresh token into `.env`).
3. Instagram: `npm run publish:instagram-auth` (see publish doc).
4. Package → Review **APPROVE** → Publish (never skip human review).

```bash
npm run package -- --episode <id> --skip-covers --language hi
npm run review -- --episode <id> --action APPROVE
npm run publish -- --episode <id> --dry-run
```

### 10. Folder map (what you create vs what Git tracks)

| Path | Role | In Git? |
| --- | --- | --- |
| `src/`, `ui/`, `workflows/`, `config/`, `docs/` | Code & docs | Yes |
| `data/episodes/`, `data/episodes-tech/` | Scripts | **No** (local) |
| `data/reviews/`, `data/publish-schedules/` | Desk state | **No** |
| `output/` | TTS, images, Wan, finals | **No** |
| `.env` | Secrets | **No** |
| `assets/audio/bgm/` (curated), `assets/audio/sfx/` | Beds | Yes (curated) |
| `assets/audio/bgm/custom/` | Your uploads | **No** |

---

## Ideal production flow (CLI)

```bash
npm run topics -- --provider openrouter --focus "Krishna"
npm run story -- --provider openrouter --kind canonical "Why Krishna ate banana peels"
# Tech pipeline:
# npm run story -- --brand tech-instagram --kind tech "Cache aside vs read-through"

npm run tts:elevenlabs -- --episode <id>          # or tts:free / tts:sarvam
npm run images -- --episode <id> --provider gemini

# Wan (tunnel must be up)
npm run wan:health
npm run wan:batch -- --episode <id>

npm run audio:plan -- --episode <id>
npm run audio:mix -- --episode <id> --bgm assets/audio/bgm/custom/your-track.mp3
npm run produce -- --episode <id> --provider wan --reuse-ai

npm run package -- --episode <id> --skip-covers --language hi
npm run review -- --episode <id> --action APPROVE
npm run publish -- --episode <id> --dry-run
npm run publish -- --episode <id> --platforms youtube,instagram,facebook
```

---

## Voice & sound

| Step | Command | Notes |
| --- | --- | --- |
| Free Hindi TTS | `npm run tts:free` | Edge neural voices |
| Indic TTS | `npm run tts:sarvam` | Needs `SARVAM_API_KEY` |
| Premium TTS | `npm run tts:elevenlabs` | Needs `ELEVENLABS_API_KEY`; multi-voice via `.env` / `config/elevenlabs-voices.json` |
| Plan SFX | `npm run audio:plan` | Sound Director LLM |
| Mix | `npm run audio:mix` | Narration + SFX + BGM → `output/audio/<id>-final-mix.wav` |

BGM defaults sit under narration after loudnorm (~−16 LUFS). Override with `BGM_VOLUME`. Library: [`assets/audio/README.md`](assets/audio/README.md).

---

## Packaging & publish

```bash
npm run package -- --episode <id> --copy-provider openrouter --skip-covers --language hi
```

- Titles prefer `publishingTitles` from the episode JSON when present.
- OpenRouter packaging needs headroom (`OPENROUTER_MAX_TOKENS=16384`, `OPENROUTER_REASONING_EFFORT=low`).
- Fallback: `--copy-provider seed` or Desk **Custom blank pack**.

Full OAuth / S3 / Meta: [`docs/publish-setup.md`](publish-setup.md).

---

## Story providers

```bash
STORY_PROVIDER=openrouter
OPENROUTER_API_KEY=…
OPENROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b:free

npm run story -- --provider openrouter "Why Hanuman forgot his powers"
npm run story -- --kind fiction "An original myth-inspired story"
npm run story -- --brand tech-instagram --kind tech "Two pointers when not to use"
npm run story -- --mock "Why Hanuman forgot his powers"   # no LLM
```

Also supported: `groq`, `openai`, `gemini`, `nvidia`, `ollama`.

---

## Cost / quality gates

`config/budget.json` caps Short length, scene count, and paid-motion budget. Excess `AI_VIDEO` scenes can be routed to `STILL`. Produce prefers reviewer-selected Wan clips when present.

---

## Useful scripts

| Script | Purpose |
| --- | --- |
| `./preflight.sh` | Check Node / npm / ffmpeg / Ollama |
| `npm run check` | typecheck (root + ui) + tests |
| `npm run ui` / `ui:build` / `ui:dev` | Desk |
| `npm run wan:tunnel:comfy` | SSH tunnel to Vast Comfy |
| `npm run wan:health` | Ping Comfy via tunnel |
| `npm run produce -- --reuse-ai` | Assemble without regenerating clips |
| `npm run publish:youtube-auth` | Reconnect YouTube OAuth |
| `npm run publish:due` | Flush due scheduled Meta/IG posts |
| `npm run analytics:ui` | Publish analytics desk |
| `npm run mcp` | MCP server ([`docs/mcp-server.md`](mcp-server.md)) |
| `npm run video:experiment` | Offline video experiments |

---

## Docs index

| Doc | Topic |
| --- | --- |
| [`docs/epicastra-north-star.md`](epicastra-north-star.md) | Product / content north star |
| [`docs/brands/README.md`](brands/README.md) | Multi-brand index |
| [`docs/brands/multi-pipeline-ui-plan.md`](brands/multi-pipeline-ui-plan.md) | Desk pipeline gate / switcher |
| [`docs/brands/tech-instagram-north-star.md`](brands/tech-instagram-north-star.md) | Tech Reels content |
| [`docs/provider-strategy.md`](provider-strategy.md) | Free vs paid routing |
| [`docs/publish-setup.md`](publish-setup.md) | YouTube / IG / Facebook |
| [`docs/gpu-rental-wan.md`](gpu-rental-wan.md) | Vast / GPU rental |
| [`docs/full-wan-production.md`](full-wan-production.md) | Wan produce path |
| [`workflows/wan/README.md`](workflows/wan/README.md) | Comfy workflow |
| [`docs/youtube-analytics.md`](youtube-analytics.md) | Analytics |
| [`docs/mcp-server.md`](mcp-server.md) | MCP tools |
| [`docs/video-providers.md`](video-providers.md) | Runway (no GPU) vs Wan vs Veo for scene video |
| [`docs/custom-pipelines.md`](custom-pipelines.md) | Add your own channel/account pipeline (`npm run pipeline:new`) |

---

## License

See [LICENSE](LICENSE).
