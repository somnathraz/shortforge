# Custom pipelines

A **pipeline** is one channel/account: its own episodes folder, language, voice, call-to-action,
publish accounts and tokens. Pipelines are plain files in `config/brands/<id>.json` — adding one
needs no code change.

```bash
npm run pipeline:new -- --id my-channel --kind story --label "My Channel" --language en
npm run ui          # pick "My Channel" in the Desk
npm run publish:youtube-auth   -- --brand my-channel
npm run publish:instagram-auth -- --brand my-channel
```

The command writes `config/brands/my-channel.json` and `data/universes/my-channel.json`
(channel positioning and editorial rules — edit it). Files whose name starts with `_`
(like `_template.json`) are ignored, so you can keep a copy to start from.

## `kind` — which engine the pipeline runs on

| kind | Engine | Typical use |
|---|---|---|
| `story` | Narrated cinematic Shorts: AI stills / Wan motion, TTS, SFX + BGM, heritage frame. Mythology editorial rules (claims to verify, canonical / lesser-known / fiction labels). | A second mythology channel, another language, another account |
| `tech` | One-concept tech reels rendered with Remotion; English narration; TECH_EDITORIAL look. | DSA / system-design / app-building reels |

`kind` is a real limit: a new pipeline reuses one of these two engines with its own accounts and
branding. A different niche with its own editorial rules or visual language (say, true-crime or
finance) means adding a new engine in code — it is not a config change.

## Config fields

| Field | Meaning |
|---|---|
| `id` | Must equal the file name, `^[a-z][a-z0-9-]{1,40}$` |
| `kind` | `story` or `tech` (default `story`; `tech-instagram` defaults to `tech`) |
| `label`, `blurb`, `studioSubtitle`, `emptyListCopy`, `newEpisodeLabel` | Desk copy |
| `episodesDir` | Where this pipeline's episode JSON lives (gitignored by default: `data/episodes-*/`) |
| `universeFile`, `scriptBrief` | Channel rules and the LLM script brief |
| `visualBrand` | `EPICASTRA_HERITAGE` (story) or `TECH_EDITORIAL` (tech) |
| `defaultLanguage`, `defaultVoiceProfile` | `hi` / `en`; tech voice profile |
| `publishProfiles` | Any of `youtube`, `instagram`, `facebook` |
| `s3Prefix` | Key prefix for Instagram media hosting |
| `ctaDefault` | Fallback caption call-to-action |
| `theme` | `heritage` or `tech` (Desk colours) |
| `youtubePlaylistTitle`, `commentDm` | Optional playlist auto-create and comment → DM automation |

A broken config fails at startup with the file name and the missing field.

## Accounts and tokens

Each pipeline keeps its own tokens in `data/connections/<id>.json` (never committed, owner-only).
Connect them with `--brand <id>` as above, or from Desk → Publish. The old single-account `.env`
variables (`YOUTUBE_REFRESH_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, …) only apply to `epicastra`.

`DEFAULT_BRAND=<id>` in `.env` chooses the pipeline used when a request names none
(default: `epicastra`, else the first one alphabetically).

## MCP

Every MCP tool takes `brand`; `list_brands` returns the configured pipelines, so Claude can work on
any of them.

## Episode JSON field names

Scripts (yours, or from an LLM) use generic names. The Desk's *Script template* and *LLM prompt* already
write them, and import also accepts the older stored names, so existing files keep working.

| You write | Stored as |
|---|---|
| `title` | `titleHi` (title in the narration language) |
| `titleEnglish` | `titleEn` |
| `hook` | `hookHi` (on-screen hook text) |
| `characters[]` with `name`, `nameLocal` | `featuredLords[]` with `nameEn`, `nameHi` |
| `hookAppearingCharacters` | `hookAppearingLords` |
| `scenes[].narration` | `scenes[].narrationHi` |
| `scenes[].appearingCharacters` | `scenes[].appearingLords` |
| `scenes[].voiceSegments[].text` | `scenes[].voiceSegments[].textHi` |
| `ending.payoff`, `nextEpisodeTease`, `onScreenClosingText` | `...Hi` |
| `metadata.description`, `metadata.thumbnailText` | `...Hi` |

The narration language is the pipeline's `defaultLanguage`; the `Hi` in a stored name is historical.

## Custom animation per beat (Tech Reels)

Besides the built-in diagram and scene templates, a beat can carry its own animation as data. Set
`template: "custom.layers"` and describe `layers[]` on a 1080 x 720 canvas; times are seconds from the start
of the beat. Nothing runs as code: a fixed renderer draws the layers, so Claude (or any LLM) can design one
through MCP.

Layer types: `text`, `box`, `circle`, `arrow`, `code`, `counter`, `bar`. Common fields: `x`, `y`, `from`,
`to`, `enter` (`none|fade|rise|pop|draw|type`), `enterSeconds`, `easing`, `color`, and optional `keys`
(`{ at, x, y, scale, opacity, rotate }`) to move a layer over time.

```json
{ "id": "db", "type": "box", "x": 930, "y": 360, "w": 220, "h": 120, "label": "DB",
  "from": 0.8, "enter": "pop", "keys": [{ "at": 3, "x": 930 }, { "at": 4, "x": 700 }] }
```

MCP tools: `list_tech_reels`, `get_scene_layers`, and `set_scene_layers` (validates by default; pass
`dryRun: false` to save and `preview: true` to get a PNG of the beat back). A reel that uses any template must
give every beat a template. Layer types are defined in `src/schema/customLayers.ts`.
