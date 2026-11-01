# Scene-wise Remotion templates

Templates are **TypeScript scene modules**. Reel JSON only stores the template **id** after the TS file exists.

## Series days (optional)

In Tech Studio, **00 / Series** plans Day 1 / Day 2 titles before scene work. Plans live in `data/tech-series/*.json`. Selecting a day fills the LLM topic and can link a reel + scene template id.

## Flow (correct order)

```text
0. Optional: start a series → Day 1 / Day 2 titles in Tech Studio

1. Need a new scene look?
   Tech Studio → 01 / Scene TSX → paste .tsx → Format TSX → Save scene
   OR
   npm run tech:template:scaffold -- --id mobility.surge

2. Id is now registered in:
   - data/tech-templates/catalog.json   (runtime validation, no restart)
   - src/visual/techReelTemplates.ts
   - remotion/src/templates/registry.ts
   - remotion/src/templates/scenes/<id>.tsx

3. Implement / paste the scene component (theme from templates/theme.ts).

4. Upload reel JSON with every beat:
   "template": "mobility.surge"

5. Validate & save → Render in Tech Studio (or CLI tech:reel).
```

If JSON references an unknown id, validation fails with:

`Create it first: npm run tech:template:scaffold -- --id …`

## Commands

```sh
npm run tech:template:list
npm run tech:template:scaffold -- --id pack.name
```

List also writes `data/tech-templates/CATALOG.md`.

## Built-in templates

| id | Pack | Notes |
|---|---|---|
| `window.array` | window | Sliding-window particle array (`beat.window`) |
| `scale.machine` | scale | Vertical scaling (`beat.hardware`) |
| `mobility.map` | mobility | Draft city map (`beat.templateProps`) |

## Shared look

- Theme/fonts: `src/visual/techReelTheme.ts`
- Remotion import: `remotion/src/templates/theme.ts`
- Shell chrome: `remotion/src/compositions/TemplateShell.tsx`

When **every** beat has `template`, Remotion uses `TemplateShell` instead of style-based labs.
