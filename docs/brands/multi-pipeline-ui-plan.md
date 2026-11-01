# Plan: Multi-pipeline Desk (EpicAstra ↔ Tech)

**Status:** planning — do not build until you approve this plan.  
**Goal:** One Desk app. User **picks a pipeline on load** and can **switch mid-session**. Each pipeline has its own episodes, prompts, visuals, packaging, and publish targets — without mixing.

Related: [`multi-account-architecture.md`](./multi-account-architecture.md), [`tech-instagram-north-star.md`](./tech-instagram-north-star.md).

---

## 1. What “pipeline” means

| Pipeline ID | Brand | Content | Episodes dir | Default publish |
| --- | --- | --- | --- | --- |
| `epicastra` | EpicAstra | Mythology shorts | `data/episodes` | YT + IG A + FB |
| `tech-instagram` | Tech (name TBD) | DSA / sysdesign / app / news | `data/episodes-tech` | IG B (YT later optional) |

Same **phases** for both (Script → Voice → Visuals → Produce → Review → Publish).  
What changes per pipeline: **copy, LLM briefs, image brand, language defaults, episode list, publish connections, CTAs**.

```text
App load
   │
   ▼
┌─────────────────────────┐
│  Pipeline gate (modal)  │  ← only if no saved pipeline
│  EpicAstra  |  Tech IG  │
└────────────┬────────────┘
             ▼
     Active pipeline context
             │
   ┌─────────┴─────────┐
   ▼                   ▼
 Episode list A     Episode list B
 Heritage visuals   Tech editorial
 Myth prompts       Tech prompts
 Account pack A     Account pack B
```

---

## 2. UI plan (correct first)

### 2.1 On application load — Pipeline gate

**When:** First visit, or `localStorage` has no `mf.activePipeline`.

**What:** Full-viewport overlay (not a tiny toast). One job: choose pipeline.

```text
┌──────────────────────────────────────────────┐
│              Mythology Factory               │
│         Choose a production pipeline         │
│                                              │
│  ┌────────────────┐   ┌────────────────┐     │
│  │   EpicAstra    │   │  Tech Reels    │     │
│  │ Mythology YT/IG│   │ DSA · design   │     │
│  │ [Enter]        │   │ [Enter]        │     │
│  └────────────────┘   └────────────────┘     │
│                                              │
│  Remember my choice on this device  ☑        │
└──────────────────────────────────────────────┘
```

**Rules:**
- Selecting a pipeline sets `activePipeline`, clears selected episode if it belongs to the other brand, then loads that episode list.
- Do **not** put stats, publish status, or episode lists on this screen — gate only.
- Brand signal: EpicAstra = heritage/warm; Tech = clean/editorial (CSS variables swap with pipeline).

### 2.2 Mid-session switch — always available

**Where:** Top bar (next to brand name), compact control:

```text
[ EpicAstra ▾ ]   episode title…        connections
```

Dropdown / sheet:
- Current pipeline (check)
- Other pipeline
- Short warning if switch would leave unsaved work / in-flight job

**On switch:**
1. If a job is running → block switch (“Cancel job first”) or offer cancel.
2. Confirm dialog: “Switch to Tech? Episode selection will reset. Assets stay on disk under their episode folders.”
3. Persist new `mf.activePipeline`.
4. Clear `mf.selectedEpisodeFile` (or namespace keys per pipeline — prefer **namespaced** keys).
5. Reload episodes + connections for that pipeline.
6. Reset active phase to Script (or last phase for that pipeline if we store per-pipeline phase later).

**Namespaced storage (recommended):**

| Key | Purpose |
| --- | --- |
| `mf.activePipeline` | `epicastra` \| `tech-instagram` |
| `mf.pipeline.<id>.selectedEpisode` | Last episode file for that pipeline |
| `mf.pipeline.<id>.activePhase` | Optional — remember step per pipeline |

So switching back restores the previous episode for that pipeline.

### 2.3 Desk chrome while inside a pipeline

| Area | Behavior |
| --- | --- |
| Brand mark / title | Shows pipeline name (EpicAstra Desk / Tech Desk) |
| Theme tokens | Pipeline-specific CSS variables |
| Empty state | Pipeline-specific sample hooks / “New episode” copy |
| Script tools | Download **that** pipeline’s LLM brief |
| Visuals step | Heritage frame controls **only** for `epicastra`; diagram/tech style for tech |
| Publish | Only connections tagged for this pipeline; wrong IG account never listed |
| Phase stepper | Same 6 steps; blurbs can differ slightly (e.g. tech Script = “concept + accuracy”) |

### 2.4 What UI does **not** do in v1

- No dual-pane editing both pipelines at once
- No cross-pipeline episode move (can be a later “duplicate as tech” action)
- No second browser window requirement — one Desk, context switch is enough

---

## 3. Backend / config plan

### 3.1 Brand registry

`config/brands/epicastra.json` + `config/brands/tech-instagram.json`:

```json
{
  "id": "epicastra",
  "label": "EpicAstra",
  "episodesDir": "data/episodes",
  "universeFile": "data/universes/channel.json",
  "scriptBrief": "templates/episode-script-llm-brief.txt",
  "visualBrand": "EPICASTRA_HERITAGE",
  "defaultLanguage": "hi",
  "publishProfiles": ["youtube", "instagram", "facebook"],
  "s3Prefix": "epicastra/",
  "ctaDefault": "Follow EpicAstra for more mythology Shorts."
}
```

Tech sibling with `episodes-tech`, `TECH_EDITORIAL`, `en`, IG-only, etc.

### 3.2 API: pipeline-aware

| Change | Detail |
| --- | --- |
| `GET /api/pipelines` | List brands (id, label, blurb) |
| `GET/POST /api/session/pipeline` | Optional server echo; primary source of truth can stay client + header |
| Request header | `X-Pipeline: epicastra` on episode/job/publish calls |
| `EPISODES_DIR` | Resolved from brand config using header (fallback `.env` / `epicastra`) |
| Jobs (`runJob`) | Pass `brandId` into story/images/package so prompts fork |
| Connections | Filter by pipeline publish profile / env group |

### 3.3 Safety rails (must ship with switch)

1. **Episode brand lock:** Every episode JSON gets `brandId`. Listing only returns matching brand; open of wrong brand → 404.
2. **Publish lock:** Publish refuses if connection’s brand ≠ episode `brandId`.
3. **Prompt lock:** Image builder refuses heritage wordmark for tech (and vice versa).
4. **Output paths:** Prefer `output/...` keyed by episode id (already); optional `output/<brandId>/` later if collision risk appears.

### 3.4 Shared vs forked code

| Shared | Forked per pipeline |
| --- | --- |
| Phase stepper, produce FFmpeg, Wan client, Desk shell | Story LLM system prompt |
| TTS providers | Default language / voice presets |
| Job runner shell | Image style module |
| Review / schedule mechanics | Packaging CTA + titles |
| | Publish credential set |

---

## 4. Build phases (order of work)

### Phase A — Plan approval (this doc)
- [ ] Confirm pipeline names / public tech brand name
- [ ] Confirm IG-only for tech at launch vs YT too
- [ ] Approve gate + mid-switch UX

### Phase B — Config + API skeleton (no fancy UI yet)
1. Add `config/brands/*.json`
2. `GET /api/pipelines`
3. Resolve episodes dir from `X-Pipeline` header
4. Stamp `brandId` on new episodes; filter list
5. Smoke: CLI/curl can list both dirs

### Phase C — Pipeline gate + switcher UI
1. Gate overlay on load
2. Top-bar pipeline switcher + confirm
3. Namespaced localStorage
4. Theme token swap
5. Wire all `listEpisodes` / `getEpisode` / `runJob` clients to send header

### Phase D — Content forks
1. Tech LLM brief wired into generate/import
2. `TECH_EDITORIAL` visual prompts (minimal v1: clean 9:16, no heritage)
3. Packaging defaults per brand
4. Hide mythology-only controls when on tech

### Phase E — Publish separation
1. Connection vault per brand (`data/connections/`) — see [`publish-identity-architecture.md`](./publish-identity-architecture.md) Phase P1
2. Desk shows only matching connections; OAuth state binds `brandId`
3. S3 prefix from brand config (later `{userId}/{brandId}/` for multi-user P2)
4. Publish refuses cross-brand (and later cross-user) credentials

### Phase F — Polish
1. Per-pipeline last episode restore
2. Analytics filter by brand
3. Series fields for tech pillars

---

## 5. User journeys (acceptance)

**First open**
1. Open Desk → see gate (not mythology episode list).
2. Choose EpicAstra → see mythology episodes.
3. Refresh → skip gate, still EpicAstra.

**Mid-way switch**
1. Mid-script on EpicAstra → switcher → confirm → Tech empty list / tech episodes.
2. Switch back → previous EpicAstra episode restored.
3. Job running → switch blocked until cancel/finish.

**No cross-publish**
1. Tech episode cannot publish to EpicAstra IG connection.
2. Health / Wan tunnel shared (GPU is shared infra).

---

## 6. Suggested UI copy

| Surface | EpicAstra | Tech |
| --- | --- | --- |
| Gate title | EpicAstra | Tech Reels |
| Gate blurb | Cinematic mythology under 60s | DSA, system design, app building |
| Empty list | Create a mystery Short | Create a one-concept Reel |
| Script CTA | Generate story | Generate concept script |

---

## 7. Risks & decisions for you

| Decision | Recommendation |
| --- | --- |
| Tech public name | Needed before polish; slug can stay `tech-instagram` |
| Remember choice | Yes, checkbox default on |
| Switch while dirty form | Confirm + discard draft fields (episode JSON on disk stays) |
| Server vs client pipeline | Client header + localStorage; server never trusts body brand alone without matching episode `brandId` |
| Monolith App.tsx | Extract `PipelineProvider` early in Phase C to avoid a 5k-line mess |

---

## 8. Next step after you approve

Implement **Phase B + C** first (config, header, gate, switcher) so you can feel the UI with existing mythology episodes and an empty tech list — then Phase D/E content + publish.

Reply with:
1. Tech brand display name  
2. Tech publish: IG-only or IG+YT  
3. Any change to the gate / switch UX  

Then build starts from Phase B.
