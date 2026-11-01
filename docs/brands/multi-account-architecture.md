# Multi-account architecture (EpicAstra factory)

Goal: run **EpicAstra mythology** and **tech Instagram** from one codebase without cross-publishing or mixed prompts.

---

## Mental model

```text
                    ┌─────────────────────────┐
                    │   Shared pipeline core   │
                    │ TTS · images · produce   │
                    │ package · review · publish │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
     brand: epicastra                    brand: tech-instagram
     universe: data/universes/           universe: data/universes/
       channel.json (today)               tech-instagram.json
     visual: EPICASTRA_HERITAGE          visual: TECH_EDITORIAL
     episodes: data/episodes/            episodes: data/episodes-tech/
     publish: IG account A               publish: IG account B
     S3: epicastra/…                     S3: tech-instagram/…
```

Today the repo is **single-brand by default** (`EPICASTRA_HERITAGE`, one `.env` IG block). Tech is a **configuration + template fork**, not a second repository.

---

## Recommended repo layout

```text
data/
  universes/
    channel.json              # EpicAstra (existing)
    tech-instagram.json       # editorial + pillar weights
  episodes/                   # mythology JSON
  episodes-tech/              # tech JSON (new)

templates/
  episode-script-llm-brief.txt           # EpicAstra
  tech-instagram-script-llm-brief.txt    # tech (new)

src/visual/
  epicastra-style.ts          # existing
  tech-editorial-style.ts     # planned

config/brands/
  epicastra.json              # defaults: voice, CTA, packaging
  tech-instagram.json

.env                          # shared API keys (OpenAI, Gemini, …)
.env.epicastra                # optional: YOUTUBE_*, INSTAGRAM_* account A
.env.tech-instagram           # optional: INSTAGRAM_* account B only
```

**Episode JSON additions** (both brands):

```json
{
  "brandId": "tech-instagram",
  "pillar": "sysdesign",
  "seriesId": "system-design-basics",
  "seriesTitle": "System Design Basics",
  "episodeInSeries": 3,
  "storyKind": "TECH_EDUCATION",
  "primaryLanguage": "en"
}
```

EpicAstra keeps `storyKind` as mythology enums; tech uses a separate enum when implemented.

---

## Environment & publish separation

| Variable group | EpicAstra | Tech IG |
| --- | --- | --- |
| `INSTAGRAM_*` / token | Account A | Account B (separate Meta app or same app, different user) |
| `S3_PREFIX` | `epicastra/` | `tech-instagram/` |
| `EPISODES_DIR` | `data/episodes` | `data/episodes-tech` |
| `ACTIVE_BRAND` | `epicastra` | `tech-instagram` |

Run pattern (future):

```bash
# load brand-specific publish creds
export $(grep -v '^#' .env.tech-instagram | xargs)
export ACTIVE_BRAND=tech-instagram EPISODES_DIR=data/episodes-tech

npm run story -- --brand tech-instagram "Cache aside vs read-through"
npm run publish -- --episode cache-aside-101 --platforms instagram
```

Until `ACTIVE_BRAND` exists in code, use a **second checkout** or manual `.env` swap for IG tokens — document which account is active in a sticky note in Desk.

---

## What to reuse vs fork

| Layer | Reuse | Fork / new |
| --- | --- | --- |
| Episode schema (scenes, timings) | Yes | Add brand + pillar + series fields |
| Produce / FFmpeg / captions | Yes | Default language + font style per brand |
| Wan / Comfy | Yes | Lower budget; prefer STILL |
| `generateEpisode.ts` system prompt | No | Tech editor prompt |
| Image prompt builder | No | `TECH_EDITORIAL` diagrams |
| Sound Director | Partial | New BGM moods: `focus`, `neutral`, `urgent` |
| `characters/` profiles | No | Optional “host avatar” later |
| Package / CTA strings | No | Tech follow CTAs |
| Analytics | Yes | Filter ledger by `brandId` |

---

## Implementation phases

### Phase 0 — Strategy (now)

- [x] North star: [`tech-instagram-north-star.md`](./tech-instagram-north-star.md)
- [ ] Pick public brand name + handle
- [ ] Create second IG Professional account + Meta app tokens
- [ ] Add `data/universes/tech-instagram.json` pillar weights

### Phase 1 — Content without code changes

- Hand-write 3 episode JSON files in `data/episodes-tech/` (copy shape from mythology episodes).
- English narration; STILL-only; produce with current Desk.
- Publish manually or swap IG env — validates format before automation.

### Phase 2 — Templates

- Tech LLM brief + `generateEpisode` branch on `brandId`
- `tech-editorial-style.ts` + `visualStyle.brand: TECH_EDITORIAL`
- Topic suggester reads `data/universes/tech-instagram.json`

### Phase 3 — Product

- Desk: brand switcher, filtered episode list
- Packaging defaults per `config/brands/*.json`
- Publish connections: multiple IG rows (account name + token path)
- Analytics: `brandId` on publish ledger

### Phase 4 — Growth

- Comment → DM keyword map per pillar
- Series scheduler (same as mythology publish schedules, namespaced by brand)

---

## Risk checklist

- **Wrong account publish:** require `brandId` match on connection before upload.
- **Mythology visuals on tech script:** image validator rejects heritage wordmark when `brandId !== epicastra`.
- **Inaccurate tech:** human review step + “no fabricated API/version” rule in LLM brief.
- **Scope creep:** no YouTube until IG pillar mix proves retention (unless you explicitly want Shorts parity).

---

## Related docs

- EpicAstra strategy: [`../epicastra-north-star.md`](../epicastra-north-star.md)
- Publish wiring: [`../publish-setup.md`](../publish-setup.md)
- **Publish identity (IG connect + multi-user):** [`publish-identity-architecture.md`](./publish-identity-architecture.md)
- Meta connect plan: [`meta-connect-plan.md`](./meta-connect-plan.md)
