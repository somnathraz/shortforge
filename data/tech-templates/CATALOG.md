# Tech reel scene templates

Create the **TS scene first** (CLI or Tech Studio paste), then reference its id in reel JSON.

```sh
npm run tech:template:list
npm run tech:template:scaffold -- --id mobility.surge
```

## Registered templates

- `custom.ui-paste-test` (draft, pack=custom): Scene template custom.ui-paste-test. Set beats[].template to "custom.ui-paste-test". Requires: none.
- `mobility.map` (draft, pack=mobility): Use for Uber-like nearby search / match / route. Pass map props in beat.templateProps. Scaffold more mobility.* scenes as needed. Requires: none.
- `scale.machine` (ready, pack=scale): Use for scale-up / single-machine capacity lessons. Requires beat.hardware. Requires: hardware.
- `sys.hot-path-counter` (ready, pack=sys): Click analytics and hot-row contention. templateProps.stage: hook, demo, hotpath, lock, pool, counter, flush, rule, teaser. Requires: none.
- `window.array` (ready, pack=window): Use for contiguous subarray / sliding window / two-pointer array lessons. Requires beat.window. Requires: window.

## Shared theme

Fonts/colors live in `src/visual/techReelTheme.ts` (imported by every scene via `remotion/src/templates/theme.ts`).
