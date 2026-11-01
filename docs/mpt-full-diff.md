# Full difference: MoneyPrinterTurbo notes vs EpicAstra

Source: your pasted MoneyPrinterTurbo analysis (sections 1–30).  
MPT claims are taken from that paste. EpicAstra status is verified against this repo.

Legend:

| Tag | Meaning |
| --- | --- |
| **HAVE** | Wired in EpicAstra today |
| **PARTIAL** | Exists but weaker / incomplete vs the MPT idea |
| **DON'T** | Missing — worth building |
| **OURS** | We have it; MPT does not (or is weaker) |
| **SKIP** | Intentionally not copying |

---

## 1. Overall architecture / orchestration

**MPT:** topic/script → LLM → material keywords → TTS → subtitles → visuals → MoviePy+FFmpeg → BGM → final → optional cross-post. Central `task.py`. Stage stops: `script | terms | audio | subtitle | materials | video`.

**EpicAstra:** topics/story → TTS → images → Sound Director → produce (Ken Burns + Wan/Veo) → package → review → publish. Separate npm CLIs + UI jobs (no single Python `task.py`).

| | Status |
| --- | --- |
| End-to-end orchestration | **HAVE** (CLI + desk) |
| Formal `stop_at=<stage>` task API | **PARTIAL** (run any script alone; no unified task stop flag) |
| Generic `terms → stock materials` stage | **SKIP** |

---

## 2. Paid AI-video early-stop (cost saver)

**MPT:** Generate paid clips one-by-one until usable duration ≥ narration; stop; avoid paying unused footage; stop new requests if remote job state uncertain.

**EpicAstra:** Story-time budget only (`maxPaidMotionScenes: 2`, `maxPaidMotionSeconds: 10`, `routeWithinBudget`). `produce.ts` still generates **every** remaining `AI_VIDEO` scene.

| | Status |
| --- | --- |
| Cap AI scenes at story time | **HAVE** |
| Runtime early-stop while generating | **DON'T** |
| Persist remote job IDs / uncertain-state halt | **DON'T** |

---

## 3. Hybrid video / image → fake video

**MPT:** Still/image → ImageClip → ~3%/sec zoom → short MP4. Many stock + AI video providers.

**EpicAstra:** STILL → FFmpeg `zoompan` (Ken Burns: zoom/pan/rise). AI_VIDEO → Wan/Veo. No Pexels/Pixabay/Coverr/MiniMax/Seedance/WaveSpeed layer.

| | Status |
| --- | --- |
| Image → local motion clip | **HAVE** |
| Multi stock providers | **SKIP** |
| Advanced local FX (parallax, particles, rain) | **DON'T** (prompt mentions parallax; not implemented) |

---

## 4. Script system

**MPT:** Flexible generic fields (`video_subject`, `video_script`, custom prompts). User can skip LLM and paste script.

**EpicAstra:** Structured episode JSON: hook, scenes, sourceReview, fiction gates, budget, optional `audioPlan` / `narrationStyle`.

| | Status |
| --- | --- |
| Structured mythology episode schema | **OURS** |
| Source / claim verification layer | **OURS** |
| Paste-script skip LLM | **PARTIAL** (can hand-edit episode JSON; no first-class “bring your own script” flag) |
| Generic MPT script prompt | **SKIP** |

---

## 5. Material planning (keywords)

**MPT:** LLM search terms (~5–8), ordered matching, optional TwelveLabs rerank. Solves narration/visual mismatch via ordered keywords.

**EpicAstra:** Per-scene object: `narrationHi`, `visualPrompt`, `camera`, `importance`, `renderMode`, `soundCue`, timings. Sound Director adds timed SFX. No keyword stock search.

| | Status |
| --- | --- |
| Scene-level screenplay object | **OURS** (stronger than keywords) |
| Keyword → stock download | **SKIP** |
| Full scene director fields (characters[], location, motionPrompt, motion_need) | **PARTIAL** (prompts + importance; not full cinematography object) |

---

## 6. Narration / actual audio duration

**MPT:** Multi TTS; measure **file** duration (not last word timestamp) to avoid short video / black tail.

**EpicAstra:** Edge + Sarvam + ElevenLabs. Timeline from planned `durationSeconds`. `ffprobe` only for YouTube Shorts geometry check — **not** TTS retime.

| | Status |
| --- | --- |
| Multiple TTS engines | **HAVE** |
| Measure narration file length → retime scenes | **DON'T** |

---

## 7. Voice preview caching

**MPT:** Preview TTS; if script/voice/rate unchanged, reuse for final (no double pay).

**EpicAstra:** Desk lists episode MP3s; approve + reuse selected file in produce. No hash cache key on script+voice+rate.

| | Status |
| --- | --- |
| Reuse approved take in produce | **PARTIAL** |
| Explicit preview cache invalidation key | **DON'T** |

---

## 8. Subtitle engine

**MPT:** Edge word timestamps or Whisper; sentence/word modes; fonts, colors, stroke, bg, position, spring/pop, Unicode wrap.

**EpicAstra:** Scene-block SRT from `narrationHi` + burn-in (`FontSize=22`, white, outline). No Whisper, no word karaoke, no mythology gold highlights.

| | Status |
| --- | --- |
| Burn-in captions | **PARTIAL** (basic) |
| Word-level / Whisper / rich styling | **DON'T** |

---

## 9. Video composition

**MPT:** MoviePy + FFmpeg; 1080×1920 (+ landscape/square); cover/contain; random/sequential; speed; transitions (fade/slide/zoom); prefer one slice per source.

**EpicAstra:** FFmpeg concat of scene clips → mute video → mux audio → optional subs. Default 1080×1920. Sequential scenes. No fade/slide transition library; no random stock slicing.

| | Status |
| --- | --- |
| Vertical Short assemble | **HAVE** |
| Transition library / cover-contain / random order | **DON'T** / **SKIP** (random stock) |

---

## 10. FFmpeg concat optimization + HW encode

**MPT:** FFmpeg concat list; `h264_nvenc` / `amf` / `qsv` / `mf` / **`videotoolbox`** with fallback to `libx264`.

**EpicAstra:** FFmpeg concat list **HAVE**. Encoder hard-coded **`libx264`** — no VideoToolbox.

| | Status |
| --- | --- |
| Concat demuxer assemble | **HAVE** |
| Hardware encode + fallback | **DON'T** |

---

## 11. Tiny timing pad (+0.1s)

**MPT:** Material length ≈ audio duration + 0.1s to avoid black last frame from rounding.

**EpicAstra:** Mux uses `-shortest` and `-t` = **sum of planned scene durations**, not probed audio + pad.

| | Status |
| --- | --- |
| Audio+0.1s pad / probe-based length | **DON'T** |

---

## 12. Background music

**MPT:** local / random / AI BGM (ElevenLabs Music, Sonilo); volume + 3s fade-out; loop; **BGM fail ≠ fail whole video**.

**EpicAstra:** Sound Director picks `bgmMood`; mix from `assets/audio/bgm/`; quiet bed + limiter; missing BGM → warn, continue voice+SFX. No random BGM picker; no ElevenLabs Music / Sonilo.

| | Status |
| --- | --- |
| Mood BGM + graceful degrade | **PARTIAL** / **HAVE** degrade |
| Random / AI-generated BGM providers | **SKIP** / later optional |

---

## 13. SFX engine

**MPT:** Essentially narration + BGM. No structured SFX cue JSON.

**EpicAstra:** Sound Director LLM → `audioPlan.sfx[]` → FFmpeg `adelay`/`amix` + library under `assets/audio/sfx/`.

| | Status |
| --- | --- |
| Timed SFX plan + mix | **OURS** |

---

## 14. Publishing architecture

**MPT:** Upload-Post middleman → TikTok / IG / YT.

**EpicAstra:** Direct YouTube Data API, Instagram Graph, Facebook Page videos; S3 only for public Reel URL. No TikTok yet. No Upload-Post.

| | Status |
| --- | --- |
| Direct platform APIs | **OURS** (preferred) |
| TikTok | **DON'T** |
| Upload-Post | **SKIP** |

---

## 15. Publish does not block generation

**MPT:** Mark video COMPLETE, then publish in background pool; publish fail ≠ generation fail.

**EpicAstra:** Produce and publish are **separate** steps (good separation). Not auto-queued background publish after produce. No `PARTIAL_PUBLISH_FAILURE` state machine in task manager.

| | Status |
| --- | --- |
| Generation ≠ publish coupling | **PARTIAL** (manual separation) |
| Background publish + rich publish states | **DON'T** |

---

## 16. Task management / queue

**MPT:** Max concurrent + max queued; 429 when full; InMemory or Redis.

**EpicAstra:** UI `runJob` spawns `npm` per request; no concurrency cap; no Redis.

| | Status |
| --- | --- |
| Bounded queue | **DON'T** (later) |

---

## 17. Task state / failed stage

**MPT:** `task_id`, progress, videos, `failed_stage` (`script|terms|audio|…`), cross_post fields.

**EpicAstra:** Production report JSON per produce; UI job stdout/stderr; review approvals. No unified task state machine across all stages.

| | Status |
| --- | --- |
| Per-produce cost/report | **PARTIAL** |
| Full pipeline task state + failed_stage | **DON'T** |

---

## 18. API design (FastAPI-style)

**MPT:** FastAPI `POST /videos`, `/audio`, `/subtitle`, `GET /tasks`, uploads.

**EpicAstra:** Desk HTTP API (`/api/jobs`, episodes, publish connections) + npm CLI. Same services under both — principle **HAVE**, surface smaller than MPT FastAPI.

| | Status |
| --- | --- |
| Shared logic under UI + CLI | **HAVE** |
| Public REST task API parity with MPT | **PARTIAL** |

---

## 19. Web UI / CLI / batch

**MPT:** Streamlit + FastAPI + CLI + batch up to 100 + agent skill.

**EpicAstra:** React desk + many npm scripts. No batch manifest runner (`npm run batch -- episodes.json`).

| | Status |
| --- | --- |
| Desk UI + CLI | **HAVE** |
| Batch 100-task runner | **DON'T** |

---

## 20. Technical stack

| MPT | EpicAstra |
| --- | --- |
| Python 3.11+, MoviePy, Streamlit, FastAPI, Edge TTS, Whisper, Redis, LiteLLM, Pydub | **Node/TS**, Zod, FFmpeg, Vite/React, Edge/Sarvam/ElevenLabs, AWS S3 SDK |
| ~70% coverage target | `npm test` exists; no 70% coverage gate |

| | Status |
| --- | --- |
| Different stack by design | **OURS** — do not migrate to Python/MPT |

---

## 21. Monolithic modules

**MPT:** Huge `material.py` / `llm.py` / `cli.py` / `task.py`.

**EpicAstra:** Split `providers/`, `pipeline/`, `audio/`, `cli/`, `schema/`.

| | Status |
| --- | --- |
| Provider-shaped architecture | **OURS** — keep |

---

## 22. Generic prompts insufficient

**MPT:** Arbitrary-topic narration.

**EpicAstra:** Mythology-specific system prompt + sourceReview + fiction rules.

| | Status |
| --- | --- |
| Mythology/editorial prompts | **OURS** |
| Copy MPT generic script engine | **SKIP** |

---

## 23. Character consistency

**MPT:** None.

**EpicAstra:** `characters/<id>/profile.json` (+ optional master); prompt enrichment. Seeded Hanuman/Jambavan; not full Krishna roster yet.

| | Status |
| --- | --- |
| Character registry | **OURS** (expand library) |

---

## 24. Scene-level cinematography

**MPT:** script → terms → materials.

**EpicAstra:** scene has camera, visualPrompt, renderMode, importance — but not full shot-type / lighting / motion-complexity / transition fields.

| | Status |
| --- | --- |
| Screenplay-ish scenes | **PARTIAL** → grow toward §30 |

---

## 25. Image animation quality

**MPT:** Slow zoom only.

**EpicAstra:** Multiple Ken Burns modes (zoom in/out, pan, rise/fall) + motion low/med/high — still no parallax/particles/lightning FX.

| | Status |
| --- | --- |
| Better than single zoom | **PARTIAL** |
| Cheap FX layer | **DON'T** (next invest) |

---

## 26. Biggest lesson — “Story Production Engine”

**MPT mental model:** AI video / footage factory.  
**Your recommendation:** AI Story Production Engine; video is one renderer.

**EpicAstra:** Already aligned in docs + hybrid STILL/AI_VIDEO; not fully scored scene strategy yet.

| | Status |
| --- | --- |
| Stance | **OURS** / adopt fully in product language |

---

## 27. Recommended EpicAstra architecture diagram

Your diagram (topic → research → story → scene director → still/AI/stock → motion → narration → sound → captions → render → cover → publish → analytics → topic) is the **target**.

| Block | Now |
| --- | --- |
| Topic engine | **PARTIAL** (suggest-topics; no analytics loop) |
| Research / source | **PARTIAL** (claims list; no deep research agent) |
| Story engine | **HAVE** |
| Scene director | **PARTIAL** |
| STILL / AI video | **HAVE** (stock optional **SKIP**) |
| Motion engine | **PARTIAL** |
| Narration | **HAVE** |
| Sound Director | **HAVE** |
| Caption engine | **PARTIAL** |
| Final render | **HAVE** |
| Cover + metadata | **HAVE** (package) |
| Publisher | **HAVE** |
| Analytics → topics | **DON'T** |

---

## 28. Copy table (your §28) — EpicAstra answer

| Feature | Your call | EpicAstra now |
| --- | --- | --- |
| Stage-based pipeline | Yes | **HAVE** |
| Stop at intermediate stage | Yes | **PARTIAL** |
| Actual narration duration | Yes | **DON'T** |
| Paid-generation early-stop | Absolutely | **DON'T** (budget at story only) |
| Provider failure tracking | Yes | **PARTIAL** (attempts/errors in produce report) |
| Remote paid-job ID persistence | Yes | **DON'T** |
| Image → local motion | Yes, improve | **HAVE** → improve FX |
| Subtitle system | Yes | **PARTIAL** |
| Hardware FFmpeg fallback | Yes | **DON'T** |
| Async publishing | Yes | **PARTIAL** |
| Bounded queue | Later | **DON'T** |
| Redis | Later | **DON'T** |
| Generic keyword system | No | **SKIP** |
| Generic story prompt | No | **SKIP** |
| Upload-Post | No | **SKIP** |
| Random stock | Mostly no | **SKIP** |
| Random BGM | No | **SKIP** |
| Full-narration AI video | Definitely no | **Aligned** (budget caps AI_VIDEO) |

---

## 29. What EpicAstra already has that is better

Matches your list — all **OURS** / present to some degree:

```text
mythology storytelling + source review
character registry
scene JSON + still vs AI_VIDEO
Wan/Veo providers
Hindi TTS (Edge/Sarvam/ElevenLabs)
Sound Director SFX
S3 + direct IG/FB/YT
suspense packaging + covers
north-star (mystery, series, comment→DM later)
```

---

## 30. Feature to implement next — Scene Render Strategy

**MPT lesson:** Don’t Wan every second.

**Your formula:** score importance / motion_need / cost → STILL+KenBurns / STILL+FX / AI_VIDEO.

**EpicAstra now:** `importance` + `renderMode` + budget router only — **no** `motion_need` calculator, no auto FX tier.

| | Status |
| --- | --- |
| Scene Render Strategy engine | **DON'T** — **recommended #1 product feature** after TTS-duration sync / produce early-stop |

---

## Bottom line (your closing)

| Statement | Agreement |
| --- | --- |
| MPT = useful reference for staging, cost, timing, subs, compose, tasks, async publish | **Yes** |
| Do not fork / rebuild on MPT | **Yes** |
| Keep specialized mythology/scene/character pipeline | **Yes — already our path** |
| Selectively copy engineering into Node EpicAstra | **Yes — priorities in docs/moneyprinter-lessons.md** |

---

## Priority build order (from this full diff)

1. ffprobe narration duration → retime scenes (+0.1s pad)  
2. Paid AI early-stop + job-id persistence at produce/animate  
3. Scene Render Strategy (`motion_need` → STILL / FX / AI_VIDEO)  
4. VideoToolbox + libx264 fallback  
5. Richer captions (then word-level)  
6. Async publish states  
7. Later: queue, analytics loop, IG comment→DM  
