# Tech Reels (CodeWithSom) performance reviews

Month-wise YouTube Shorts + Instagram Reels for pipeline `tech-instagram`.

- YouTube: **CodeWithSom** (@buildwithsom)
- Instagram: **@codewithsom**

Credentials: `data/connections/tech-instagram.json` (separate from EpicAstra).

## Folder layout

```
docs/reviews/codewithsom/
  README.md
  _raw-snapshot.json
  _enriched-snapshot.json
  YYYY-MM/
    summary.md
    youtube.md
    instagram.md
```

## Months

| Month | Summary | YouTube | Instagram |
|-------|---------|---------|-----------|
| 2026-10 | [summary](./2026-10/summary.md) | [youtube](./2026-10/youtube.md) | [instagram](./2026-10/instagram.md) |

## Refresh

```bash
ACTIVE_BRAND=tech-instagram node --import tsx scripts/generate-brand-reviews.mjs
```
