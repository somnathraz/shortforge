# Video experiments: fal.ai

This is an optional CLI experiment, isolated from normal production. It animates existing reviewed images, keeps the same continuous narration/mix and captions, and writes its own outputs. It never changes episode JSON, review selections, existing clips, or publishing state.

## Setup

Add `FAL_KEY=your-key` to the local ignored `.env` using a key from the [fal dashboard](https://fal.ai/dashboard/keys). Keep it server-side. No new npm dependency or GPU setup is needed. FFmpeg/ffprobe and the existing project dependencies must be installed.

Two model profiles are included:

| CLI name | Endpoint | Request durations |
| --- | --- | --- |
| `kling` | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | 5 or 10 seconds |
| `ltx` | `fal-ai/ltx-2.3/image-to-video/fast` | 6–20 seconds in even increments |

Kling is the default comparison starting point, not a claim that it will perform better. Hailuo is intentionally not implemented yet. Add it through a tested model profile when needed.

## Preview → one clip → full episode

Run in `mythology-factory`. The current example is Vamana–Bali:

```sh
npm run video:experiment -- plan --episode data/episodes/1790169775562-why-lord-vamana-asked-king-bali-for-only-three-steps-of-land.json --model kling
npm run video:experiment -- plan --episode data/episodes/1790169775562-why-lord-vamana-asked-king-bali-for-only-three-steps-of-land.json --model ltx
```

`plan` reads local files and writes a preview; it never contacts fal or generates media. Images come from review selections, then canonical `scene-<id>.png/jpg/jpeg/webp` files. `--images-dir folder` explicitly overrides review selection. A missing selected image fails instead of silently switching to another image.

Narration comes from the existing episode audio resolver. For a controlled comparison, use **the same explicit `--audio path/to/final-mix.wav` on every command**. Existing mixes retain their BGM/SFX. This experiment does not generate or remix audio. Use the normal audio workflow first if needed. An explicit missing audio file is an error.

```sh
# Generate at most one NEW clip, save its request ID/result, then stop.
npm run video:experiment -- run --episode data/episodes/episode.json --model kling --audio output/audio/final-mix.wav --limit 1

# Resume the same experiment and assemble the complete video.
npm run video:experiment -- run --episode data/episodes/episode.json --model kling --audio output/audio/final-mix.wav

# Compare LTX with exactly the same source assets/audio.
npm run video:experiment -- run --episode data/episodes/episode.json --model ltx --audio output/audio/final-mix.wav
```

`run` sends images and prompts to fal and incurs provider charges. The `--limit` flag limits new submissions in that invocation, not previously queued work. Commands are sequential to keep small experiments predictable.

Generation uses the smallest supported duration that covers each visual window; assembly trims surplus video without cutting narration. The opening uses the first scene's image, and the ending uses the last. Windows over 10 seconds are split using the same source image. This common limit keeps edits comparable between models. Thus 8 source images may require more than 8 generations. Scene timings use the existing approximate narration alignment, not word-level forced alignment.

**Current preview:** the selected Vamana–Bali audio is 99.68 seconds, yielding 14 clips from 8 images. Kling plans 140 generated seconds; LTX plans 112. Shorten/re-record narration first if you want a 45–60-second experiment; the pipeline does not truncate it for you.

## Outputs, comparison and costs

Each run lives in `output/experiments/video/<episode-id>/<model>-<content-hash>/`:

- `preview.json`: offline plan, with prompts, source paths, durations and optional cost estimate.
- `plan.json`: executed plan, including input hashes and provider settings.
- `report.json`: request IDs, per-clip status/errors and observed wall time.
- `shot-001.mp4`, etc.: validated clips.
- `final.mp4` and `final.srt`: complete 1080×1920 output and captions.

The run hash includes story, image contents, audio contents, endpoint and model inputs. Switching models or changing source content creates a separate run. Repeating identical inputs resumes it. Output paths can be relocated using `--output-root` (a new root has no cache and may incur new charges).

```sh
# Reassemble only; never calls fal and needs no API key.
npm run video:experiment -- assemble --episode data/episodes/episode.json --model kling --audio output/audio/final-mix.wav

npm run video:experiment -- compare output/experiments/video/EPISODE/kling-HASH/report.json output/experiments/video/EPISODE/ltx-HASH/report.json
```

Comparison reports mark runs incomparable if source images, prompts, audio or the edit differ. They show completion, errors, planned generation seconds, final duration and observed wall time. Wall time includes local handling and waiting; it is not GPU time. After publishing manually, record retention, stayed-to-watch, average percentage viewed and your visual-quality notes separately; this tool does not infer quality or upload anything.

No prices are hardcoded. Supply `--usd-per-second CURRENT_RATE` on the initial run for an approximate whole-plan estimate. This assumes a simple per-second rate for the configured model/settings, including rounded-up durations. Confirm pricing in fal before using it. Actual cost is `null`; consult fal billing. Preview estimates do not include failed requests or different pricing tiers.

## Failures and resume

- Queue GETs retry transient failures. Timeouts and download failures retain the same request ID; rerun identical inputs to resume.
- Paid POST submissions are never blindly retried. If the connection dies before a receipt is saved, the report remains `submitting` and resume stops. Check fal's dashboard; if it was accepted, copy its receipt (`request_id`, `status_url`, `response_url`) into that shot in `report.json` and set its status to `queued`. Only reset it to `pending` after confirming no generation was accepted.
- A completed provider error remains attached to the original request. Decide whether to run a new experiment after inspecting the dashboard; it is never silently charged again.
- Invalid or missing downloaded media are fetched again from the same request, not regenerated. Assembly rejects missing clips. There is no automatic still fallback in this experiment.
- Atomic JSON writes and a per-run `.lock` prevent concurrent submission from two CLI processes. If a process is killed, inspect the PID written in `.lock`; remove that lock only after confirming the process is gone, then resume. Keep the report/request IDs.
- Local model acceptance can be tested without credentials; live quality, access and billing still need a real account.

## Code boundaries: adding or discarding a path

All fal experiment code is in `src/experiments/video/`:

| File | Responsibility |
| --- | --- |
| `models.ts` | Model endpoints, legal durations and input mapping |
| `plan.ts` | Read selected images, align existing audio, fingerprint the experiment |
| `fal.ts` | Authenticated queue transport and unauthenticated media download |
| `runner.ts` | Persist/resume requests, validate/cache media, call the shared renderer |
| `cli.ts` | Explicit user commands and argument parsing |

The runner accepts a small `VideoProvider` interface for offline testing and future adapters. Add a model with the same `video.url` output contract in `models.ts` and add payload tests. A different provider needs an adapter implementing `submit`, `result`, and `download`; do not add provider-specific conditionals to the episode schema or FFmpeg renderer.

This change touches existing files only to register `video:experiment` in `package.json` and add the sample `FAL_KEY` entry in `.env.example`. It reuses the renderer's previously added `productionShots` interface. Wan remains under `produce:wan`; ordinary still/AI production remains under its existing commands.

To discard this feature, remove `src/experiments/video`, `test/video-experiments.test.ts`, this guide, the npm script, and the sample environment entry. No rollback of core production code or database migration is required. Keep generated outputs if you want the comparison evidence.

## API references

Verified 2026-09-25 against primary documentation:

- [Kling 2.5 Turbo Pro I2V schema](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/api)
- [LTX-2.3 Fast I2V schema](https://fal.ai/models/fal-ai/ltx-2.3/image-to-video/fast/api)
- [fal queue API](https://fal.ai/docs/documentation/model-apis/inference/queue)

```sh
npm run typecheck
node --import tsx --test test/video-experiments.test.ts
npm test
```

## In the desktop web UI

Open an episode → **Step 4: Produce → Animate with fal.ai**. Save/approve the script, voice and visuals as usual, choose Kling or LTX, then click **Preview experiment**. Preview saves your current selections and shows the actual timeline and generation length. **Test 1 clip · Paid** generates at most one new clip; **Generate / resume full video · Paid** completes the run. Saved clips and final output play directly in the panel. The panel remains available alongside existing outputs for comparison.

The UI reads `FAL_KEY` only on the server and shows setup instructions when it is missing. Restart `npm run ui` after changing `.env` or backend code. Published episode locks remain in force. Results stay separate from the production review/publish selection; downloading an experiment does not replace your approved final.

UI wiring is isolated in `src/ui-server/videoExperiments.ts`, `ui/src/components/video-experiments.tsx` and `ui/src/lib/video-experiments.ts`, plus one route and one component mount in the existing server/App. Remove those along with the experiment module to discard the feature. Requests respond immediately while generation continues server-side; refreshing the page reads persisted progress. Restarting the server stops an active run; resume using the same selections.
