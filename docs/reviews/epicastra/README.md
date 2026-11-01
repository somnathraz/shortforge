# EpicAstra performance reviews

Month-wise YouTube Shorts + Instagram Reels reviews with **every video**, Hindi/English titles, and full metrics.

## Do you need to enable an Instagram API?

**No.** Instagram is Meta Graph (not Google Cloud). EpicAstra already returns:

- views, reach, likes, comments, shares, saves  
- `ig_reels_avg_watch_time`, total watch time  
- `reels_skip_rate`

No extra GCP toggle is required. Keep the existing Instagram token refreshed (`instagram_business_basic` + publish). Optional later: `instagram_business_manage_insights` if Meta ever restricts insights — currently not blocking us.

YouTube needed **YouTube Analytics API** (done) + OAuth scope `yt-analytics.readonly` (done). Reporting API works with that scope.

## Folder layout

```
docs/reviews/epicastra/
  README.md                 ← this file
  _raw-snapshot.json        ← API dump
  _enriched-snapshot.json   ← + episode titles + retention
  2026-09/
    summary.md              ← month dashboard + ranked tables
    youtube.md              ← every Short, full detail
    instagram.md            ← every Reel, full detail
  2026-10/
    summary.md
    youtube.md
    instagram.md
```

## Per-video fields

### YouTube
Episode ID · Title (Hindi) · Title (English) · published YT title · video ID · URL · publishedAt · duration · format/story/topic · views/likes/comments/like-rate · Analytics AVD · % viewed · minutes watched · shares · subs gained/lost · retention @ 1/5/10/25/50/75/90%

### Instagram
Episode ID · Title (Hindi) · Title (English) · caption · media ID · permalink · publishedAt · product type · views · reach · avg watch · total watch · skip rate · likes · comments · shares · saves · interactions

## Months

| Month | Summary | YouTube | Instagram |
|-------|---------|---------|-----------|
| 2026-09 | [summary](./2026-09/summary.md) | [youtube](./2026-09/youtube.md) | [instagram](./2026-09/instagram.md) |
| 2026-10 | [summary](./2026-10/summary.md) | [youtube](./2026-10/youtube.md) | [instagram](./2026-10/instagram.md) |

## Refresh

Re-run the review snapshot script when you want updated numbers (especially for videos still in Analytics lag).
