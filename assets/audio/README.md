# Audio library

> **Audio files are not included in this repository.** The SFX and BGM beds come from
> [Mixkit](https://mixkit.co/license/) and [Pixabay](https://pixabay.com/service/license-summary/),
> whose licenses allow use in your videos but not redistributing the files themselves.
> Each `*.meta.json` here records the source and ID of the file it describes. Download the
> matching files yourself and ingest them with `npm run audio:add` (see below), then run
> `npm run audio:check-library` to see what is still missing. Never commit audio you do not
> have redistribution rights to.

Reusable **SFX** and **BGM** beds for the Sound Director stage.

**Download list:** [`DOWNLOAD.md`](./DOWNLOAD.md)

## Layout

```text
assets/audio/
  sfx/
    cinematic/ divine/ nature/ battle/   ← Mixkit WAVs + .meta.json
    custom/                              ← ElevenLabs only on library miss
  bgm/
    divine_mystery/   divine-01..03.mp3  ← random pick
    dark_mystery/
    epic_battle/
    emotional/
    revelation/
```

## Ingest

```bash
npm run audio:add -- --file ~/Downloads/bell.wav --id temple-bell --source mixkit --url "https://..." --normalize
npm run audio:add -- --file ~/Downloads/ambient.mp3 --mood divine_mystery --id divine-04 --source pixabay
npm run audio:check-library
```

## Plan + mix (narration-aligned cues)

```bash
npm run audio:plan -- --episode <id> --audio output/audio/<narration>.mp3
npm run audio:mix  -- --episode <id>
# Hero Reel only (paid EL Music):
npm run audio:hero-bgm -- --episode <id>
npm run audio:mix -- --episode <id> --hero-bgm
```

Mixer picks a **random** BGM from the mood folder. Missing allowlisted SFX → `sfx/custom/` via ElevenLabs (needs `sound_generation` permission).

The standard mix always combines narration + planned SFX + BGM. Passing a custom `--bgm` changes only the music track; it does not remove SFX. `--skip-sfx` is the explicit narration+BGM-only path.

Recommended production defaults (also documented in `.env.example`):

```text
SOUND_DIRECTOR_PROVIDER=openrouter
SOUND_DIRECTOR_AUTO_PLAN=true
AUDIO_REPLAN_ON_NARRATION=true
AUDIO_AUTO_MIX=true
SFX_NARRATION_GAIN=1.12
SFX_MIX_GAIN=0.55
BGM_ATEMPO=1.0
BGM_LOUDNORM=true
BGM_DUCK=true
BGM_VOLUME=0.22
```

Leave `BGM_VOLUME` blank to use the per-mood mix levels (~0.22–0.30). Set `ELEVENLABS_SFX_ON_MISS=true` only when you want paid generation for missing effects; UI cue checkboxes remain an explicit paid opt-in.
