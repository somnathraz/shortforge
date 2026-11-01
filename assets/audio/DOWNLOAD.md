# EpicAstra — download checklist (one-time)

> **Audio files are not included in this repository.** The SFX and BGM beds come from
> [Mixkit](https://mixkit.co/license/) and [Pixabay](https://pixabay.com/service/license-summary/),
> whose licenses allow use in your videos but not redistributing the files themselves.
> Each `*.meta.json` here records the source and ID of the file it describes. Download the
> matching files yourself and ingest them with `npm run audio:add` (see below), then run
> `npm run audio:check-library` to see what is still missing. Never commit audio you do not
> have redistribution rights to.

## Status — READY

| Piece | Status |
| --- | --- |
| Real Mixkit WAVs (18 SFX) | Done |
| 3 BGM tracks per mood (15) | Done — `bgm/<mood>/*-0N.mp3` |
| Random pick inside mood | Done |
| Asset metadata JSON | Done — `*.meta.json` |
| `npm run audio:add` | Done — ffprobe + normalize + meta |
| EL SFX on miss → `sfx/custom/` | Opt-in only (`--elevenlabs-sfx` / desk “Generate selected EL”) |
| EL Music hero Reels | Done — `audio:hero-bgm` / `--hero-bgm` |
| Narration-aligned cue times | Done — pass `--audio` / auto TTS |

### ElevenLabs SFX (desk / CLI opt-in)

Mix defaults to **local + custom** only. To upgrade selected cues:

1. Desk → tick **EL** on plan rows → **Generate selected EL** (saves `assets/audio/sfx/custom/<id>.wav`)
2. **Mix with library / custom** — custom overrides win on next mix

```bash
npm run audio:gen-sfx -- --ids temple-bell,shankh --to-custom --force
npm run audio:mix -- --episode <id> --audio <narration.mp3>
# auto-fill missing during mix (optional):
npm run audio:mix -- --episode <id> --elevenlabs-sfx
```

Sources: **Pixabay** (primary) + **Mixkit** (backup).  
Prefer tracks **without YouTube Content ID** on Pixabay.  
Do **not** use Freesound API for commercial EpicAstra.

Formats: `.wav` or `.mp3` OK (engine accepts both for BGM; SFX prefer `.wav`).

After each file is in place, optionally run:

```bash
npm run audio:add -- --file path/to/downloaded.wav --id temple-bell --source pixabay --url "https://..."
```

---

## A. SFX — replace these exact paths (18 files)

Root: `assets/audio/sfx/`

### Cinematic → `assets/audio/sfx/cinematic/`

| Save as | Search for |
| --- | --- |
| `deep-boom.wav` | cinematic boom, trailer impact, deep hit |
| `impact.wav` | short impact hit, punch, thud |
| `whoosh.wav` | whoosh, swoosh, air swipe |
| `riser.wav` | tension riser, cinematic rise (1–2s) |
| `transition-whoosh.wav` | soft whoosh, transition swipe |

### Divine → `assets/audio/sfx/divine/`

| Save as | Search for |
| --- | --- |
| `divine-chime.wav` | magic chime, soft bells cluster |
| `temple-bell.wav` | temple bell, brass bell, church bell (single) |
| `shankh.wav` | conch shell, shankh, indian horn |
| `magical-sparkle.wav` | sparkle, glitter, fairy dust, magic shimmer |

### Nature → `assets/audio/sfx/nature/`

| Save as | Search for |
| --- | --- |
| `thunder.wav` | thunder rumble, distant thunder |
| `rain.wav` | rain loop, light rain |
| `wind.wav` | wind ambience, night wind |
| `river.wav` | river, stream, water flowing |
| `fire.wav` | fire crackle, campfire, torch |

### Battle → `assets/audio/sfx/battle/`

| Save as | Search for |
| --- | --- |
| `sword-clash.wav` | sword clash, metal weapons |
| `arrow.wav` | arrow whoosh, bow release |
| `heavy-impact.wav` | door slam, heavy hit, stone impact |
| `wing-flap.wav` | bird wings, large wing flap |

Optional later customs (ElevenLabs only if needed):

```text
assets/audio/sfx/custom/
  (empty for now — e.g. divine-prison-lock.wav)
```

---

## B. BGM — 3 tracks per mood (15 files)

Root: `assets/audio/bgm/`

### `assets/audio/bgm/divine_mystery/`

| Save as | Search for |
| --- | --- |
| `divine-01.mp3` | spiritual ambient, temple atmosphere, soft drone |
| `divine-02.mp3` | mystical india, sacred pad (different from 01) |
| `divine-03.mp3` | calm divine cinematic underscore |

### `assets/audio/bgm/dark_mystery/`

| Save as | Search for |
| --- | --- |
| `dark-01.mp3` | dark ambient, suspense drone |
| `dark-02.mp3` | mysterious tension, low rumble bed |
| `dark-03.mp3` | ominous cinematic ambient |

### `assets/audio/bgm/epic_battle/`

| Save as | Search for |
| --- | --- |
| `battle-01.mp3` | epic war drums, battle underscore |
| `battle-02.mp3` | heroic action percussion |
| `battle-03.mp3` | intense cinematic battle bed |

### `assets/audio/bgm/emotional/`

| Save as | Search for |
| --- | --- |
| `emotional-01.mp3` | emotional soft pad, sad flute-ish ambient |
| `emotional-02.mp3` | tender cinematic strings (soft) |
| `emotional-03.mp3` | heartfelt ambient underscore |

### `assets/audio/bgm/revelation/`

| Save as | Search for |
| --- | --- |
| `revelation-01.mp3` | epic reveal, rising hope ambient |
| `revelation-02.mp3` | majestic reveal underscore |
| `revelation-03.mp3` | awe / wonder cinematic bed |

---

## C. Metadata (auto via `audio:add`, or hand-write)

Next to each file, same name + `.meta.json`:

```json
{
  "id": "temple-bell",
  "file": "divine/temple-bell.wav",
  "category": "divine",
  "source": "pixabay",
  "sourceUrl": "https://pixabay.com/...",
  "downloadedAt": "2026-09-06",
  "commercialUse": true,
  "contentId": false
}
```

For BGM use `"id": "divine-01"` and `"category": "divine_mystery"`.

---

## Totals

```text
18 SFX  +  15 BGM  =  33 files  (one-time, ₹0 reuse)
```

When finished, tell me and we can verify with:

```bash
npm run audio:check-library
```
