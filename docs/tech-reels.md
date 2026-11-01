# Default Tech Reels template: Request Coalescing / Orbital v1

The Tech Reels desk now opens a dedicated storyboard studio by default. New scripts and the `tech:reel` CLI use the approved **Request coalescing — 61 seconds** identity. The reference MP4 remains unchanged. This is code-generated Remotion animation, with original diagrams, narration and timing; it does not reuse the reference Instagram footage.

## Create a future reel

1. Open `/desk` and select **Tech Reels**.
2. Enter the topic and choose **Copy LLM prompt + sample**. The complete brief includes the sample JSON; a text download is also available.
3. Generate the JSON in your LLM. Use a new `id` for each new reel.
4. Upload or paste it, review the claims and narration, then **Validate & save script**.
5. **Save & render final** produces narration, timed captions, animation and the final MP4. Watch progress in the render log and download the result. **Silent preview only** avoids narration generation.

Source files:
- `templates/tech-reel-sample.json`: valid vertical-scaling example.
- `templates/tech-instagram-script-llm-brief.txt`: editable/locked fields, speech guidance, layout limits and source rules.
- `src/lib/techReelScript.ts`: one bundle shared by default script downloads and studio prompts.
- `src/schema/techReel.ts`: runtime validation, including the stricter new-script contract.
- `src/visual/techReelTheme.ts`: code-owned visual identity.

## Fixed vs editable

**Fixed:** orbital style, #07080b background, #efc373 accent, the approved lavender/gold/mint/red palette, Arial/Helvetica titles, SFMono/Menlo labels, 56px headings, 37px captions, header/metric/caption/footer placement, watermark, 1080×1920 at 30fps, transitions and particle behavior, voice profile `TECH_ENGLISH_INDIA` (Rahul Bharadwaj / male Indian English / eleven_v4). No custom CSS, fonts, images, alternative skins, raw ElevenLabs voice ids, or injected code in JSON.

**Editable:** ID, title, learning goal, factual sources, caveat, 5–9 teaching beats, simple English narration, headlines, labels, node types/positions/state, request flows and a concise metric. Nodes keep stable IDs and carry overrides forward; each beat replaces the flow list. CPU and RAM annotations are optional on servers. Planned beats are 4–12 seconds and at most 35 spoken words; aim for 18–25 words to keep the full reel near a minute. Actual duration comes from speech, not the estimate. Speak Big-O as “O of one / O of n”; on-screen labels may still show O(1) / O(n).

Both browser and server reject changes to the locked settings. The LLM must return `NEEDS_REVIEW` for factual claims. Source metadata is not a substitute for checking accuracy; validation cannot establish that a claim is true or that every layout is readable.

## Rendering

```sh
npm run tech:reel -- --storyboard data/tech-reels/vertical-scaling.json
npm run tech:reel -- --storyboard data/tech-reels/request-coalescing.json
```

ElevenLabs is the default. Tech Reels lock narration to voice profile **`TECH_ENGLISH_INDIA`** (Rahul Bharadwaj — male Indian-accent English, `eleven_v4`, `language_code: en`). Episode JSON must store the profile id, never a raw ElevenLabs voice id. Optional Hindi/Hinglish uses `TECH_HINDI`. Override the Rahul id only with `TECH_ELEVENLABS_VOICE_ID` if needed. New speech consumes account credits; unchanged speech is cached by profile, text and model settings. `--tts edge` falls back to `en-IN-PrabhatNeural`.

Options: `--silent` (visual preview), `--prepare-only` (speech and timed props only), `--scale 0.5` (540×960 preview). Final output: `output/tech-reels/<id>/<id>.mp4`. Each beat's measured speech plus a short pause is rounded up to a video frame; captions and animation share that clock. Narration is normalized and mixed with quiet original transition tones. An unsuccessful render preserves the previous final MP4.

## Compatibility

Mythology creation and production remain unchanged. The Tech pipeline **Desk default** is the episode UI (`/desk`). Optional orbital / scene-template storyboard studio: `/desk?studio=1`. The legacy script endpoint explicitly requests `format=legacy`; `/api/episodes/template` for tech still returns the orbital storyboard bundle for LLM authoring when requested.

For deliberate re-rendering of an old storyboard only:

```sh
npm run tech:reel -- --storyboard data/tech-reels/database-scaling.json --legacy-template --tts elevenlabs
```

This opt-in compatibility flag is not offered in the new studio. Existing history is not bulk-restyled or deleted.

## Verification

The focused renderer, episode and EpicAstra regression suite passes 29 tests. UI build and Remotion TypeScript checks pass. Browser verification covers login, default tech selection, topic-specific prompt download, invalid palette rejection, JSON upload/create/save, rendering, and desktop/mobile layouts. API checks cover session enforcement, brand isolation and default template selection.

Repository-wide TypeScript still reports pre-existing errors in image generation, packaging, voice/publishing configuration, scene-video types, FFmpeg typing and a test import. These unrelated errors are not part of the template change.

## Scene-wise TS templates (create code first)

For packed per-beat visuals (`window.array`, `scale.machine`, `mobility.map`, …), the Remotion TS scene must exist before JSON can reference its id. See [tech-templates.md](./tech-templates.md).

```sh
npm run tech:template:list
npm run tech:template:scaffold -- --id mobility.surge
# implement remotion/src/templates/scenes/<id>.tsx, then set beats[].template in JSON
```
