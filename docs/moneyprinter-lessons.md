# EpicAstra vs MoneyPrinterTurbo — gap analysis

Reference: [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MIT, Python).  
EpicAstra should **selectively copy engineering ideas**, not fork their `script → keywords → stock footage` model.

Related: [`epicastra-north-star.md`](./epicastra-north-star.md)

---

## Our stack (today)

| Layer | Choice |
| --- | --- |
| Language | **TypeScript / Node 20+** (ESM) |
| Validation | Zod |
| Story LLM | Ollama, OpenRouter, Groq, NVIDIA NIM, OpenAI |
| TTS | Edge (free), **Sarvam Bulbul**, ElevenLabs |
| Images | Pollinations (free), Gemini |
| AI video | Wan (NIM/Comfy), Veo |
| Motion / assemble | **FFmpeg** (Ken Burns, concat, burn-in) |
| Audio | Sound Director LLM + SFX library + BGM mix |
| Desk UI | Vite + React 19 + Tailwind / shadcn |
| Jobs | UI server spawns `npm run …` |
| Publish | **Direct** YouTube / Instagram / Facebook APIs + S3 for IG media URL |
| Characters | `characters/<id>/profile.json` (+ optional master image) |

**Not our stack:** Python, MoviePy, Streamlit, Redis task manager, Upload-Post middleman.

---

## Feature matrix

| Idea from MoneyPrinterTurbo | EpicAstra status | Notes |
| --- | --- | --- |
| Stage-based pipeline | **Have** | story → tts → images → audio → produce → package → review → publish |
| Stop / test one stage | **Partial** | Separate npm scripts; UI phase gates; no formal `stop_at=audio` task API |
| Actual narration file duration | **Don't have** | Timeline uses planned `durationSeconds`; no ffprobe retime |
| Paid AI-video early-stop | **Partial** | Story-time budget (`maxPaidMotionScenes/Seconds` + `routeWithinBudget`); produce still runs every remaining AI_VIDEO scene |
| Persist remote job IDs / avoid double-charge | **Don't have** | Needed for Wan/Veo long jobs |
| Image → local motion (Ken Burns) | **Have** | `ffmpegRender` zoompan; improve with parallax/FX next |
| Generic keyword → stock search | **Don't want** | We use scene JSON + prompts |
| Structured mythology script + source review | **Have (ours)** | `sourceReview`, claims, fiction gate |
| Character consistency registry | **Have (ours)** | `characters/` — MPT has none |
| Multi TTS providers | **Have** | Edge / Sarvam / ElevenLabs |
| Voice preview reuse (no double TTS pay) | **Partial** | Desk selects existing MP3; no explicit “preview cache key” |
| Word-level / Whisper subtitles | **Don't have** | Scene-block SRT burn-in only |
| Rich caption styling / karaoke | **Don't have** | Basic white + outline |
| Hardware encode (VideoToolbox) | **Don't have** | `libx264` only |
| Audio + 0.1s material pad | **Don't have** | Should add |
| BGM with graceful fail | **Partial** | Mix warns if BGM missing; continue voice+SFX |
| Structured SFX cue timeline | **Have (ours)** | Sound Director — MPT lacks this |
| Async publish (video COMPLETE before cross-post) | **Partial** | Separate `publish` CLI/UI step; not auto-background after produce |
| Bounded generation queue | **Don't have** | Later |
| Direct social APIs | **Have (ours)** | Prefer over Upload-Post |
| Analytics → next topic | **Don't have** | North-star later |
| Comment keyword → IG DM | **Don't have** | North-star later |
| Episodic series model | **Don't have** | Spec only in north-star |

---

## What we already have that MPT does not

```text
mythology storytelling + source review
character registry / consistency
scene JSON (timing, importance, renderMode, prompts)
still vs AI_VIDEO budget routing (at story time)
Sound Director (BGM mood + timed SFX)
direct Instagram / Facebook / YouTube publish
S3 media hosting for Reels
Hinglish suspense packaging + covers
desk UI with phase approvals
EpicAstra north-star (mystery hooks, series, rewards)
```

---

## What we should copy next (priority)

1. **ffprobe real narration duration → retime scenes** (no black last frame)
2. **Paid AI-video early-stop / hard enforce budget at produce time**
3. **Persist remote gen job IDs + uncertain-state stop** (no double charge)
4. **VideoToolbox encoder + soft fallback**
5. **+0.1s media pad vs audio**
6. **Better still→motion** (pan / parallax / light FX — still cheap)
7. **Richer captions** (later: word timing; mythology highlights)
8. **Async publish states** (`VIDEO_READY` vs `PUBLISHING` vs `PARTIAL_PUBLISH_FAILURE`)
9. **Bounded job queue** when batching many episodes

**Do not copy:** generic script prompts, keyword stock matching, Upload-Post, random BGM as primary, full-length Wan for every second.

---

## Architecture stance (unchanged)

```text
MoneyPrinterTurbo = broad AI Shorts factory
EpicAstra         = specialized mythology story production engine
```

Video generation is **one scene renderer**, not the product.

Target render mix for a ~50s Short (concept):

```text
~10–15s AI_VIDEO (hooks / miracles)
~rest STILL + local motion / FX
```

---

## GitHub readiness checklist

- [x] `.gitignore` covers `.env`, `node_modules`, `output/`, tokens
- [x] `.env.example` documented (no secrets)
- [x] MIT `LICENSE`
- [x] Architecture / gap docs in `docs/`
- [ ] `git init` + first commit
- [ ] Create GitHub repo (`gh repo create`) — private recommended until polish
- [ ] Push `main`
- [ ] Confirm no API keys in history (`git log` / secret scan)

Never commit: `.env`, OAuth tokens, Wan tunnel secrets, production episode dumps with private URLs.
