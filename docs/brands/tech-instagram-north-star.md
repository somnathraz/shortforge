# Tech Instagram — product & content north star

**Status:** planning — second account on the same factory as EpicAstra.  
**Working slug:** `tech-instagram` (rename when you pick a public brand name).

---

## Positioning

**Not enough:** “Random coding tips” or reposted news screenshots. That does not build a recognizable Reels channel.

**Promise (pick one voice and stay consistent):**

> **Under 60 seconds: one concept, one mental model, one thing you can use in interviews or at work.**

Or (Hinglish / India tech audience):

> **DSA, system design aur naye tech updates — har Reel mein ek clear takeaway.**

**Audience:** developers and students (0–5 YOE), interview prep, builders shipping apps, people who want signal without a 40-minute video.

**Language:** default **English** for reach; optional **Hinglish** series later — do not mix randomly in the same series.

---

## Content engine (every Reel)

```text
Relatable pain or surprising claim
      ↓
One focused concept (not a syllabus)
      ↓
Visual proof (diagram / pseudo-code / before-after)
      ↓
Clear takeaway (“remember this one line”)
      ↓
Reason to follow (series name + tomorrow’s topic)
```

**Core rule:** one Reel = **one** idea. Never “today we cover DSA + system design + React.”

| Weak | Better | Stronger |
| --- | --- | --- |
| Binary search explained | Why binary search fails on unsorted data | The one line interviewers listen for in binary search |
| Microservices | What is microservices | When microservices make your startup slower |
| React 19 update | React 19 is out | React 19 change that breaks this old pattern |

---

## Content pillars (rotate weekly)

| Pillar | Slug | Example hook | Format bias |
| --- | --- | --- | --- |
| DSA pattern | `dsa` | “Two pointers — but when **not** to use them” | Pseudo-code + 1 example |
| DSA trap | `dsa-trap` | “This looks like DP — it isn’t” | Wrong vs right |
| System design | `sysdesign` | “Cache aside vs read-through in 45 sec” | Box diagram |
| Architecture | `architecture` | “Event-driven without the mess” | Flow arrows |
| App building | `app-build` | “MVP auth: what to ship first” | Screen / layer stack |
| Tech update | `tech-news` | “What changed in X and who should care” | Headline + 2 bullets |
| Career / interview | `interview` | “System design round: start here” | Checklist |
| Tooling | `tooling` | “One git command that saves code review” | Terminal-style still |

**Launch mix (first 30 Reels):**

- 40% DSA (`dsa` + `dsa-trap`)
- 25% system design + architecture
- 20% app building
- 15% tech updates (timely; batch-record when news drops)

---

## Series (episodic, not one-offs)

Name series on-screen and in captions so IG saves/follows compound.

```text
TECH — TWO POINTERS (5 parts)
  EP01  When two pointers actually work
  EP02  Sorted array tricks
  EP03  Palindrome pattern
  EP04  Container with most water — intuition
  EP05  Common interview mistake

TECH — SYSTEM DESIGN BASICS
  EP01  Latency vs throughput
  EP02  Load balancer in one slide
  EP03  DB replication — read your writes
  ...
```

Store `seriesId`, `seriesTitle`, `episodeInSeries`, `pillar` on each episode JSON (fields to add in code — see architecture doc).

---

## 45–60 second structure

```text
0–2s     HOOK (claim / question / “stop doing X”)
2–8s     Context (who this is for)
8–35s    Teach (max 3 beats; one visual per beat)
35–50s   Payoff (rule of thumb / mnemonic)
50–57s   CTA (“Part 2 tomorrow” / “Save for interview”)
57–60s   Optional brand sting (no long outro)
```

Wire into LLM briefs and packaging — same idea as EpicAstra’s timed script blocks.

---

## Visual & audio identity (different from EpicAstra)

| Dimension | EpicAstra | Tech Instagram |
| --- | --- | --- |
| Frame | Heritage border + wordmark | **No heritage frame** — `TECH_EDITORIAL` clean 9:16 |
| Imagery | Myth scenes, character lock | **Deterministic `techVisual`** for teaching diagrams; AI stills only for atmosphere/thumbnails |
| Motion | Wan on dramatic scenes | Animated `techVisual` beats synced to scene duration (TTS-aligned at render) |
| BGM | Divine / epic / emotional | Lo-fi / neutral tech bed (new folder under `assets/audio/bgm/`) |
| Voice | Hindi mythology narrator | English (or Hinglish) clear educator tone |
| Captions | Hindi burn-in default | English; keyword highlight optional later |
| Fact gate | `sourceReview` / mythology fiction | **Tech accuracy** — no fake APIs; cite version when news |

Visual brand key: `TECH_EDITORIAL` (`src/visual/tech-editorial-style.ts`). Desk Images hides EpicAstra heritage controls for this pipeline.

### Deterministic teaching visuals (`techVisual`)

EpicAstra path (unchanged):

```text
Narration → AI image prompt → beautiful still → Ken Burns / Wan
```

Tech path:

```text
Narration → techVisual { visualType, visualData, animationSteps }
         → SVG frames (exact numbers) → H.264 clip → assemble with TTS clock
```

- Schema: `src/schema/techVisual.ts` (optional on scenes + `hookTechVisual`)
- Renderer: `src/tech-visuals/` (mythology episodes must omit these fields)
- Preview/clips: `npm run tech:visuals -- --episode data/episodes-tech/….json [--preview]`
- Types: `ARRAY_LOOKUP`, `ARRAY_TRAVERSAL`, `NESTED_LOOP_GRID`, `HALVING`, `GROWTH_BARS`, `TIME_VS_SPACE`, `COMPLEXITY_LADDER`, `TECH_HOOK`
- `animationSteps[].at` is a **fraction of scene duration (0–1)** so TTS retiming keeps beats aligned
- Final Short length follows **real TTS audio** (`narration-aligned`), not the planned 40s JSON total
- Prefer **50–60s** picture plans for DSA education

AI images must not invent teaching numbers. If a scene has `techVisual`, image generation is skipped for that slot.

---

## Instagram growth (later)

Same playbook as EpicAstra north star, adapted:

- Comment keyword → DM (cheatsheet PDF, Notion link, “part 2 list”)
- Pillar-specific CTAs: “Comment **MAP** for the complexity cheat sheet”
- Saves-first metrics (education Reels)

---

## What “done” looks like for v1

1. Episodes live under `data/episodes-tech/` (or `data/episodes/` with `brandId: tech-instagram`).
2. Story + image prompts use tech templates, not mythology LLM system text.
3. Publish uses **second** IG OAuth token / user id — never the EpicAstra account.
4. S3 prefix e.g. `tech-instagram/<episodeId>/` for Reel public URL.
5. Desk filter or env `ACTIVE_BRAND=tech-instagram` so you do not mix packaging CTAs.

---

## Open decisions (fill before build)

| Decision | Options |
| --- | --- |
| Public brand name | TBD — drives wordmark + CTA copy |
| Primary language | English (recommended) vs Hinglish |
| YouTube later? | IG-only first vs same episodes to YT Shorts |
| Voice provider | ElevenLabs educator vs Edge English |
| Accuracy review | Human checklist vs LLM “fact lint” pass |
