# Contributing

Thanks for helping. This is a small, opinionated tool — please open an issue before a large change.

```bash
npm install && npm --prefix ui install
npm test                      # root tests (node:test)
npm --prefix ui run typecheck # Desk UI
npm run doctor                # sanity check your environment
```

- **Pipelines** (channels/accounts) are config: `npm run pipeline:new`. A new *engine kind* is code — talk to us first.
- **Never commit secrets, tokens, episode data or third-party media.** `.env`, `data/connections/`, `data/episodes*/`, `output/` and audio files are gitignored; keep it that way.
- Keep the approval gates intact: no change should let a step run, or publish, before the previous one is approved.
- Add a test for behaviour you change. Match the surrounding code style.
