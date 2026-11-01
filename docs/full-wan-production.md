# Full Wan episode experiment

Run from mythology-factory. The public episode JSON/importer remains unchanged.

```sh
npm run produce:wan -- --episode data/episodes/1790169775562-why-lord-vamana-asked-king-bali-for-only-three-steps-of-land.json --plan-only
npm run produce:wan -- --episode data/episodes/episode.json
```

The second command resolves existing episode narration, uses the existing Sound Director for continuous BGM/SFX, creates one Gemini keyframe per shot and animates every shot through Wan ComfyUI. `--tts` generates narration with the existing Edge TTS provider when needed. `--audio path/to/final-mix.wav` consumes an explicit mix unchanged. `--no-audio-mix` uses narration alone.

Configure GOOGLE_AI_API_KEY and the existing GOOGLE_IMAGE_MODEL, WAN_COMFY_URL and WAN_COMFY_WORKFLOW settings. The bundled workflow is a placeholder: export your Wan I2V graph from ComfyUI in API format. This command deliberately uses ComfyUI I2V, not the driving-video NIM backend. Generation uses 16 fps, 4n+1 frames and the existing configurable Wan resolution; final output is 1080x1920 at 30 fps.

Outputs: `output/wan-production/<episode-id>/production-plan.json`, per-shot keyframes/clips, `production-report.json`, `final.mp4`, and `final.srt`. Use `--output-dir` for a separate experiment. Character profile reference images and script identity locks are supplied to the image provider. Shot/keyframe content determines cache directories; changing the keyframe invalidates its video. Use a new output directory after changing the Wan workflow/model/settings.

The planner creates 2–4 coverage shots per story scene plus opening/ending coverage, with deterministic action/reaction/wide/detail compositions. It is a baseline coverage director, not an LLM story rewrite. The latest Vamana–Bali script produces 21 shots on its planned 60-second clock. Production timing uses actual audio length; section boundaries retain the existing character-weighted approximation, not forced word alignment. Narration and captions are never split at shot boundaries.

Generation retries up to `--attempts 2` (maximum 5). Reports persist on failure. `--reuse-only` forbids image/video generation and validates cached clips. `--fallback-still` explicitly permits Ken Burns fallback for failed/missing Wan clips and marks the report accordingly; default full-Wan production fails rather than silently substituting stills. Existing `produce` and `render` paths remain available.

Reports distinguish reused clips, attempts, failures, and fallback shots, and record Wan request wall time and final duration. GPU time/cost remain null because the ComfyUI client does not expose billing or GPU execution measurements. Request wall time includes queue/download overhead and is not GPU time.

Validation: automated tests cover timeline continuity, workflow input patching, short clip rejection, and real FFmpeg assembly with audio and SRT output. A real Wan quality/cost test requires the configured GPU service and API workflow. Nothing is published automatically.
