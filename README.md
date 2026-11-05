# Shortforge

A self-hosted studio that turns a topic into a finished **Short / Reel** and publishes it —
**script → voice → images → motion → sound → package → review → publish** — with a review Desk in your
browser and an **MCP server so Claude can run the whole thing for you**.

You bring your own API keys. Nothing is uploaded anywhere except to the providers you choose.
It is faceless-video focused: stills + narration + motion, no people on camera.

Starts empty: no channels, no sample content. On first run the Desk asks you to create your first
**pipeline** (one channel): either *Story Shorts* (narrated, generated stills or video) or *Tech Reels*
(one-concept animated explainers). You can [add more channels](#make-your-own-pipeline) any time, without code.

---

## What you need

| | Needed for | How to get it |
|---|---|---|
| **Node.js 20+** and **npm** | everything | <https://nodejs.org> |
| **ffmpeg** (with ffprobe) | building the final video | macOS `brew install ffmpeg` · Ubuntu `sudo apt install ffmpeg` · Windows `winget install ffmpeg` |
| **Git** | cloning | <https://git-scm.com> |
| **One script writer** | scripts | A free [Google AI Studio key](https://aistudio.google.com/apikey) (`GOOGLE_AI_API_KEY`) — also does images. Or OpenRouter/Groq/OpenAI, or local Ollama. **Or** let Claude write scripts via [MCP](#let-claude-run-it) |
| *Optional* ElevenLabs / Sarvam key | nicer voices | Free Edge TTS works with no key |
| *Optional* Runway key | motion clips from your stills, no GPU | [dev.runwayml.com](https://dev.runwayml.com) — see [video providers](docs/video-providers.md) |
| *Optional* YouTube / Instagram / Facebook apps | publishing | [publish setup](docs/publish-setup.md) |

No GPU is required. Without a video key you still get finished Shorts using pan/zoom motion on stills.

## Quick start (about 10 minutes)

```bash
git clone https://github.com/somnathraz/shortforge.git
cd shortforge

npm install
cp .env.example .env          # then open .env and paste at least one script-writer key
npm run setup                 # installs + builds the Desk, then checks your setup
npm run ui                    # → http://127.0.0.1:8787
```

`npm run doctor` tells you exactly what is missing (and is safe to run any time).

1. **Sign in.** On first start the terminal prints a one-time Desk password — use any email plus that
   password. To pick your own: `npm run desk:password -- 'your password'` and paste the hash into `.env`.
2. **Create your first pipeline** (a name plus Story Shorts or Tech Reels), then enter it. Later you just pick one.
3. **Script** — type a topic and generate, or paste JSON (*Import script*) from Claude/ChatGPT. Review the
   claims, then approve the script.
4. **Voice** — generate narration (free Edge TTS works without a key), pick one, approve.
5. **Visuals** — generate scene images (Gemini, or free Pollinations), edit prompts if you like, approve.
6. **Produce** — assemble the video (add *scene video* here if you set up Runway), then **Review**.
7. **Publish** — connect YouTube / Instagram / Facebook once, then post or schedule.

Every step is a gate: nothing downstream runs until you approve the previous one, and published episodes lock.

## Make your own pipeline

A pipeline is one channel/account — its own language, voice, call-to-action, episode folder and publishing
accounts. It is a config file, not code. Create it in the Desk (first-run screen or **New pipeline**), ask
Claude through the MCP `create_pipeline` tool, or use the command line:

```bash
npm run pipeline:new -- --id my-channel --kind story --label "My Channel" --language en
```

1. Pick a **kind**: `story` (narrated cinematic Shorts) or `tech` (one-concept explainer reels).
2. Edit `config/brands/my-channel.json` (blurb, call-to-action, which platforms) and
   `data/universes/my-channel.json` (your channel's positioning and editorial rules).
3. Choose **My Channel** in the Desk (restart `npm run ui` only if you created it by hand).
4. Connect its accounts: `npm run publish:youtube-auth -- --brand my-channel` and
   `npm run publish:instagram-auth -- --brand my-channel`.

Each pipeline keeps separate episodes and separate tokens. Details, every config field and the limits
(a brand-new niche with its own editorial rules needs a new engine in code): [custom pipelines](docs/custom-pipelines.md).

## Let Claude run it

The studio includes an [MCP](https://modelcontextprotocol.io) server. Open the Desk and press
**Connect AI** — it shows the exact setup for Claude Code, Claude Desktop, Cursor and ChatGPT and has a test button.
Claude Code also picks up the project's `.mcp.json` automatically when you open this folder.

Then you can say things like *"write a 45-second script about the Pushpaka Vimana and save it as a draft"*,
*"generate the images for my newest episode"*, *"dry-run publish it to Instagram"* or *"how did my last five
posts do?"*. Claude uses the same pipeline and the same approval gates; a real publish needs an explicit
`confirm`. Tool list: [MCP server](docs/mcp-server.md).

## Scene video (motion)

| Option | Setup | Cost |
|---|---|---|
| **Runway** (recommended) | `RUNWAY_API_KEY` + `VIDEO_PROVIDER=runway` | ≈ $0.25 per 5 s clip |
| Wan 2.2 on a rented GPU | ComfyUI + SSH tunnel — [guide](docs/gpu-rental-wan.md) | GPU hourly |
| Google Veo | `GOOGLE_AI_API_KEY` | per second |
| None | nothing | free — pan/zoom on stills |

## Safety and your data

- The Desk listens on `127.0.0.1` only, requires a login for every write, and rejects unexpected `Host` headers.
- API keys live in `.env`; OAuth tokens in `data/connections/` (owner-only). Both are gitignored — **never commit them**.
- Episodes, reviews and generated media are gitignored too (`data/episodes*/`, `output/`).
- The bundled SFX/BGM library is **not** included (licensing); see [`assets/audio/DOWNLOAD.md`](assets/audio/DOWNLOAD.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run doctor` says ffmpeg missing | Install ffmpeg (table above), reopen the terminal |
| "Sign in to the Desk first" | Sign out and in again; restart `npm run ui` after changing `.env` |
| Blank page at `:8787` | `npm run ui:build` |
| Script generation fails | Check the key in `.env`; `npm run doctor` shows which providers are set |
| Instagram publish fails | Instagram needs a public video URL — see [publish setup](docs/publish-setup.md) |

## Documentation

| | |
|---|---|
| [Custom pipelines](docs/custom-pipelines.md) | Add your own channel/account |
| [Video providers](docs/video-providers.md) | Runway vs Wan vs Veo, prices |
| [MCP server](docs/mcp-server.md) | Connect Claude and other AI apps |
| [Publish setup](docs/publish-setup.md) | YouTube / Instagram / Facebook OAuth |
| [Developer guide](docs/developer-guide.md) | The full operator guide: every CLI, Wan GPU setup, cost gates |
| [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) | |

## License

MIT — see [LICENSE](LICENSE). Third-party audio, fonts and provider terms stay with their owners.
