# Provider and spending strategy

The pipeline uses three quality profiles from `config/providers.json`.

## Economy

- OpenRouter or Groq free hosted models, NVIDIA prototype API, or local Ollama for drafts
- free Edge neural Hindi TTS, free Pollinations scene stills, and later ComfyUI assets
- Wan NIM for character animation when a GPU host is available
- FFmpeg for most scene movement

Use this profile for testing topics and formats before spending money.

## Balanced (default production target)

- OpenAI for the final researched script
- ElevenLabs for Hindi narration
- Gemini 3.1 Flash Image for routine scene images
- Gemini 3 Pro Image only for reusable character masters
- Wan NIM for character-motion shots
- Gemini Omni Flash for one hero video shot when needed
- FFmpeg for every ordinary scene

## Quality

The quality profile replaces the hero-video provider with Veo 3.1. It should be used only after a topic or format has already demonstrated viewer retention.

## Spending rules

Paid generation is intentionally bounded:

- one premium script call per episode
- one premium master image per reusable character
- one premium hero video scene per Short
- human approval before paid video generation
- ordinary scenes always remain eligible for FFmpeg motion

The provider registry currently configures the planned image/video adapters. Working adapters today are OpenRouter, Groq, Ollama, NVIDIA NIM text, OpenAI text, free Edge TTS, ElevenLabs TTS, free Pollinations stills, optional Gemini Flash Image, and Wan Animate NIM.

## Commands

Free Hindi voice from a validated episode:

```bash
npm run tts:free -- \
  --episode data/episodes/episode.json \
  --output output/audio/episode-edge.mp3
```

Free scene stills from a validated episode:

```bash
npm run images -- \
  --episode data/episodes/episode.json \
  --provider pollinations
```

## Two video pipelines

**Path A — Motion (FFmpeg):** stills + Ken Burns → `output/video/`

```bash
npm run render -- --episode data/episodes/episode.json --motion high
```

**Path B — AI animate (pluggable `veo` | `wan`):** mythology AI video from reference stills → `output/ai-video/`

```bash
# Veo 3 (cloud, paid) — AI_VIDEO scenes by default
npm run animate -- --provider veo --episode data/episodes/episode.json --scene 4

# Wan NIM (your GPU) — needs a driving-motion mp4
npm run animate -- --provider wan --episode data/episodes/episode.json --scene 4 \
  --drive assets/driving/leap.mp4

# Full AI Short (every scene) + assemble
npm run animate -- --provider veo --episode data/episodes/episode.json --all --assemble
```

Add more providers later behind the same `npm run animate -- --provider …` interface.

Assemble a vertical Short — **Path A (FFmpeg only)**: stills + Ken Burns → `output/video/`:

```bash
npm run render -- \
  --episode data/episodes/episode.json \
  --audio output/audio/episode.mp3 \
  --motion high
```

Character animation (low-level Wan CLI, still available):

```bash
npm run wan:animate -- \
  --image assets/characters/hanuman.png \
  --video assets/driving/leap.mp4 \
  --prompt "Hanuman gathers strength and leaps forward" \
  --output output/wan/hanuman-leap.mp4
```

Premium story:

```bash
npm run story -- --provider openai --kind canonical "Why Hanuman forgot his powers"
```

Premium Hindi voice from a validated episode:

```bash
npm run tts:elevenlabs -- \
  --episode data/episodes/episode.json \
  --output output/audio/episode.mp3
```

Character animation:

```bash
npm run wan:animate -- \
  --image assets/characters/hanuman.png \
  --video assets/driving/leap.mp4 \
  --prompt "Hanuman gathers strength and leaps forward" \
  --output output/wan/hanuman-leap.mp4
```
