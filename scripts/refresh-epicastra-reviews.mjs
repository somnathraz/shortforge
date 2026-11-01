/**
 * Refresh EpicAstra YT+IG snapshot and APPEND new Oct videos to existing review md files.
 * Does not rewrite existing per-video sections; regenerates 2026-10/summary.md.
 */
import "../src/lib/loadEnv.js";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { getYoutubeAccessToken } from "../src/providers/youtubeUpload.js";
import { fetchYoutubeVideoStats, fetchYoutubeChannelStats } from "../src/providers/youtubeAnalytics.js";
import { resolveInstagramCredentials } from "../src/providers/metaUpload.js";
import { fetchInstagramAccountStats } from "../src/providers/metaAnalytics.js";
import { loadPublishLedger } from "../src/lib/publishLedger.js";

const root = path.resolve("docs/reviews/epicastra");
const END_DATE = new Date().toISOString().slice(0, 10);
const START_DATE = "2026-09-01";

function parseDuration(iso) {
  if (!iso) return null;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}
function fmtDur(s) {
  if (s == null) return "—";
  const m = Math.floor(s / 60),
    sec = s % 60;
  return m ? `${m}:${String(sec).padStart(2, "0")}` : `0:${String(sec).padStart(2, "0")}`;
}
function monthOf(iso) {
  return iso ? iso.slice(0, 7) : null;
}
function esc(s) {
  return String(s ?? "—").replace(/\|/g, "\\|");
}
function num(n, d = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return typeof n === "number" ? (d ? n.toFixed(d) : String(Math.round(n))) : String(n);
}
function msToSec(ms) {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}
function pct(n) {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}
function likeRate(likes, views) {
  if (!views) return "—";
  return pct(((likes || 0) / views) * 100);
}

// ---------- 1) Fetch raw ----------
const ytToken = await getYoutubeAccessToken();
async function ytReport(params) {
  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { authorization: `Bearer ${ytToken}` } });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
}

console.log("Fetching YouTube channel + uploads…");
const channel = await fetchYoutubeChannelStats();
const uploadIds = await (async () => {
  const pl = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${channel.uploadsPlaylistId}&maxResults=50`,
    { headers: { authorization: `Bearer ${ytToken}` } }
  ).then((r) => r.json());
  return (pl.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
})();
const recent = await fetchYoutubeVideoStats(uploadIds);

console.log(`Fetching Analytics ${START_DATE} → ${END_DATE}…`);
const analytics = await ytReport({
  ids: "channel==MINE",
  startDate: START_DATE,
  endDate: END_DATE,
  metrics:
    "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost",
  dimensions: "video",
  maxResults: 50,
  sort: "-views"
});
const aById = Object.fromEntries(
  (analytics.rows || []).map((r) => [
    r[0],
    {
      views: r[1],
      minutes: r[2],
      avd: r[3],
      avp: r[4],
      likes: r[5],
      comments: r[6],
      shares: r[7],
      subsGained: r[8],
      subsLost: r[9]
    }
  ])
);

const days = await ytReport({
  ids: "channel==MINE",
  startDate: START_DATE,
  endDate: END_DATE,
  metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained",
  dimensions: "day"
});

console.log("Fetching Instagram media + insights…");
const ig = resolveInstagramCredentials();
const igAccount = await fetchInstagramAccountStats();
const allIg = [];
let next = `${ig.graphBase}/${ig.userId}/media?fields=${encodeURIComponent(
  "id,caption,timestamp,media_product_type,like_count,comments_count,permalink"
)}&limit=50&access_token=${encodeURIComponent(ig.token)}`;
while (next && allIg.length < 100) {
  const page = await fetch(next).then((r) => r.json());
  if (page.error) {
    console.error("IG media error", page.error);
    break;
  }
  allIg.push(...(page.data || []));
  next = page.paging?.next || null;
}

for (const m of allIg) {
  if (m.media_product_type !== "REELS" && m.media_product_type !== "VIDEO") {
    m._insights = null;
    continue;
  }
  const metric =
    "views,reach,total_interactions,likes,comments,shares,saved,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate";
  const ins = await fetch(
    `${ig.graphBase}/${m.id}/insights?metric=${encodeURIComponent(metric)}&access_token=${encodeURIComponent(ig.token)}`
  ).then((r) => r.json());
  const map = {};
  if (!ins.error) for (const row of ins.data || []) map[row.name] = row.values?.[0]?.value;
  else map._error = ins.error.message;
  m._insights = map;
}

function groupYt(month) {
  return recent
    .filter((v) => monthOf(v.publishedAt) === month)
    .map((v) => ({
      id: v.id,
      title: v.title,
      publishedAt: v.publishedAt,
      durationSec: parseDuration(v.duration),
      duration: fmtDur(parseDuration(v.duration)),
      url: v.url,
      dataViews: v.viewCount,
      dataLikes: v.likeCount,
      dataComments: v.commentCount,
      analytics: aById[v.id] || null
    }))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
}

function groupIg(month) {
  return allIg
    .filter((m) => monthOf(m.timestamp) === month)
    .map((m) => ({
      id: m.id,
      title: (m.caption || "").split("\n")[0].slice(0, 100),
      publishedAt: m.timestamp,
      permalink: m.permalink,
      product: m.media_product_type,
      likes: m.like_count,
      comments: m.comments_count,
      insights: m._insights
    }))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
}

const raw = {
  fetchedAt: new Date().toISOString(),
  youtube: {
    channel: {
      title: channel.title,
      customUrl: channel.customUrl,
      subscribers: channel.subscriberCount,
      views: channel.viewCount,
      videos: channel.videoCount
    },
    days: (days.rows || []).map((r) => ({
      day: r[0],
      views: r[1],
      minutes: r[2],
      avd: r[3],
      subsGained: r[4]
    })),
    byMonth: {
      "2026-09": groupYt("2026-09"),
      "2026-10": groupYt("2026-10")
    }
  },
  instagram: {
    account: igAccount
      ? {
          username: igAccount.username,
          followers: igAccount.followersCount,
          mediaCount: igAccount.mediaCount
        }
      : null,
    byMonth: {
      "2026-09": groupIg("2026-09"),
      "2026-10": groupIg("2026-10")
    }
  }
};

await mkdir(root, { recursive: true });
await writeFile(path.join(root, "_raw-snapshot.json"), JSON.stringify(raw, null, 2));
console.log(
  JSON.stringify(
    {
      fetchedAt: raw.fetchedAt,
      ytSep: raw.youtube.byMonth["2026-09"].length,
      ytOct: raw.youtube.byMonth["2026-10"].length,
      igSep: raw.instagram.byMonth["2026-09"].length,
      igOct: raw.instagram.byMonth["2026-10"].length
    },
    null,
    2
  )
);

// ---------- 2) Enrich ----------
async function loadEpisodes() {
  const dirs = ["data/episodes", "data/episodes-import", "data/episodes-tech", "data/tech-reels"];
  const byId = new Map();
  for (const dir of dirs) {
    const abs = path.resolve(dir);
    let names = [];
    try {
      names = await readdir(abs);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const ep = JSON.parse(await readFile(path.join(abs, name), "utf8"));
        if (!ep?.id) continue;
        byId.set(ep.id, {
          episodeId: ep.id,
          titleHi: ep.titleHi || null,
          titleEn: ep.titleEn || null,
          topic: ep.topic || null,
          format: ep.format || null,
          storyKind: ep.storyKind || null
        });
      } catch {}
    }
  }
  return byId;
}

async function loadPublishMaps() {
  const publishRoot = path.resolve("output/publish");
  const episodes = await readdir(publishRoot).catch(() => []);
  const ytToEp = new Map();
  const igToEp = new Map();
  for (const episodeId of episodes) {
    const ledger = await loadPublishLedger(episodeId);
    for (const item of ledger) {
      if (item.platform === "youtube" && item.id) ytToEp.set(item.id, episodeId);
      if (item.platform === "instagram") {
        for (const f of item.formats || []) {
          if (f.kind === "reel" && f.id) igToEp.set(f.id, episodeId);
        }
        if (item.id) {
          for (const part of String(item.id).split(",")) {
            const m = /^(?:reel:)?(\d+)$/i.exec(part.trim()) || /^reel:(.+)$/i.exec(part.trim());
            if (m) igToEp.set(m[1], episodeId);
          }
        }
      }
    }
  }
  return { ytToEp, igToEp };
}

const episodes = await loadEpisodes();
const { ytToEp, igToEp } = await loadPublishMaps();

function resolveTitles(episodeId, platformTitle) {
  const ep = episodeId ? episodes.get(episodeId) : null;
  return {
    episodeId: episodeId || null,
    titleHi: ep?.titleHi || null,
    titleEn: ep?.titleEn || null,
    topic: ep?.topic || null,
    format: ep?.format || null,
    storyKind: ep?.storyKind || null,
    platformTitle: platformTitle || null
  };
}

for (const month of ["2026-09", "2026-10"]) {
  for (const v of raw.youtube.byMonth[month] || []) {
    Object.assign(v, resolveTitles(ytToEp.get(v.id) || null, v.title));
  }
  for (const m of raw.instagram.byMonth[month] || []) {
    Object.assign(m, resolveTitles(igToEp.get(m.id) || null, m.title));
  }
}

async function retentionPoints(videoId) {
  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", START_DATE);
  url.searchParams.set("endDate", END_DATE);
  url.searchParams.set("metrics", "audienceWatchRatio,relativeRetentionPerformance");
  url.searchParams.set("dimensions", "elapsedVideoTimeRatio");
  url.searchParams.set("filters", `video==${videoId}`);
  const json = await fetch(url, { headers: { authorization: `Bearer ${ytToken}` } }).then((r) =>
    r.json()
  );
  const rows = json.rows || [];
  if (!rows.length) return null;
  const at = (p) => rows.reduce((a, b) => (Math.abs(a[0] - p) < Math.abs(b[0] - p) ? a : b));
  const pts = {};
  for (const p of [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9]) {
    const row = at(p);
    pts[`${Math.round(p * 100)}%`] = {
      watchRatio: Number(row[1].toFixed(3)),
      relative: Number(row[2].toFixed(3))
    };
  }
  const early = rows.filter((x) => x[0] <= 0.1);
  if (early.length >= 2) pts.first10Drop = Number((early[0][1] - early[early.length - 1][1]).toFixed(3));
  return pts;
}

// Existing IDs in Oct detail files
function extractIds(md, field) {
  const re = new RegExp(`\\| \\*\\*${field}\\*\\* \\| \`([^\`]+)\` \\|`, "g");
  const ids = new Set();
  let m;
  while ((m = re.exec(md))) ids.add(m[1]);
  return ids;
}

const ytOctPath = path.join(root, "2026-10", "youtube.md");
const igOctPath = path.join(root, "2026-10", "instagram.md");
const ytOctMd = await readFile(ytOctPath, "utf8");
const igOctMd = await readFile(igOctPath, "utf8");
const existingYt = extractIds(ytOctMd, "Video ID");
const existingIg = extractIds(igOctMd, "Media ID");

const newYt = (raw.youtube.byMonth["2026-10"] || []).filter((v) => !existingYt.has(v.id));
const newIg = (raw.instagram.byMonth["2026-10"] || []).filter((m) => !existingIg.has(m.id));

console.log(`New YT since last docs: ${newYt.length}`, newYt.map((v) => v.id));
console.log(`New IG since last docs: ${newIg.length}`, newIg.map((m) => m.id));

console.log("Fetching retention for new YT videos (and any missing analytics)…");
for (const v of raw.youtube.byMonth["2026-10"] || []) {
  if (!newYt.includes(v) && existingYt.has(v.id)) {
    // keep null for old ones in snapshot; detail md already has retention
    if (!v.analytics) {
      v.retention = null;
      continue;
    }
  }
  if (!v.analytics) {
    v.retention = null;
    continue;
  }
  // Always refresh retention for new; for old with analytics, skip to save quota unless new
  if (!newYt.includes(v)) {
    v.retention = null;
    continue;
  }
  try {
    v.retention = await retentionPoints(v.id);
    process.stdout.write(".");
  } catch {
    v.retention = null;
  }
}
console.log(" done");

await writeFile(path.join(root, "_enriched-snapshot.json"), JSON.stringify(raw, null, 2));

// ---------- 3) Markdown helpers ----------
function ytVideoSection(v, index) {
  const a = v.analytics;
  const lines = [];
  lines.push(`### ${index}. ${esc(v.titleHi || v.platformTitle || v.id)}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Episode ID** | \`${esc(v.episodeId || "unmapped")}\` |`);
  lines.push(`| **Title (Hindi)** | ${esc(v.titleHi || "—")} |`);
  lines.push(`| **Title (English)** | ${esc(v.titleEn || "—")} |`);
  lines.push(`| **YouTube title (published)** | ${esc(v.platformTitle)} |`);
  lines.push(`| **Video ID** | \`${v.id}\` |`);
  lines.push(`| **URL** | ${v.url} |`);
  lines.push(`| **Published** | ${esc(v.publishedAt)} |`);
  lines.push(`| **Duration** | ${esc(v.duration)} (${v.durationSec ?? "—"}s) |`);
  lines.push(`| **Format / story** | ${esc(v.format || "—")} / ${esc(v.storyKind || "—")} |`);
  lines.push(`| **Topic** | ${esc(v.topic || "—")} |`);
  lines.push("");
  lines.push(`**Reach & engagement (Data API)**`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Views | ${num(v.dataViews)} |`);
  lines.push(`| Likes | ${num(v.dataLikes)} |`);
  lines.push(`| Comments | ${num(v.dataComments)} |`);
  lines.push(`| Like rate | ${likeRate(v.dataLikes, v.dataViews)} |`);
  lines.push("");
  if (a) {
    lines.push(`**YouTube Analytics (Studio-depth)**`);
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|------:|`);
    lines.push(`| Views (Analytics) | ${num(a.views)} |`);
    lines.push(`| Estimated minutes watched | ${num(a.minutes)} |`);
    lines.push(`| Average view duration (AVD) | ${num(a.avd)}s |`);
    lines.push(`| Average % viewed | ${pct(a.avp)} |`);
    lines.push(`| Likes | ${num(a.likes)} |`);
    lines.push(`| Comments | ${num(a.comments)} |`);
    lines.push(`| Shares | ${num(a.shares)} |`);
    lines.push(`| Subscribers gained | ${num(a.subsGained)} |`);
    lines.push(`| Subscribers lost | ${num(a.subsLost)} |`);
    lines.push("");
  } else {
    lines.push(`**YouTube Analytics:** not available yet (typical 24–72h lag for new uploads).`);
    lines.push("");
  }
  if (v.retention) {
    lines.push(`**Audience retention curve (watch ratio @ % of video)**`);
    lines.push("");
    lines.push(`| Position | Audience still watching | vs similar videos |`);
    lines.push(`|----------|------------------------:|------------------:|`);
    for (const key of ["1%", "5%", "10%", "25%", "50%", "75%", "90%"]) {
      const p = v.retention[key];
      if (!p) continue;
      lines.push(`| ${key} | ${p.watchRatio} | ${p.relative} |`);
    }
    if (v.retention.first10Drop != null) {
      lines.push("");
      lines.push(`First-10% absolute drop: **${v.retention.first10Drop}**`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function igVideoSection(m, index) {
  const i = m.insights || {};
  const lines = [];
  lines.push(`### ${index}. ${esc(m.titleHi || m.platformTitle || m.id)}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Episode ID** | \`${esc(m.episodeId || "unmapped")}\` |`);
  lines.push(`| **Title (Hindi)** | ${esc(m.titleHi || "—")} |`);
  lines.push(`| **Title (English)** | ${esc(m.titleEn || "—")} |`);
  lines.push(`| **IG caption (first line)** | ${esc(m.platformTitle)} |`);
  lines.push(`| **Media ID** | \`${m.id}\` |`);
  lines.push(`| **Permalink** | ${m.permalink || "—"} |`);
  lines.push(`| **Published** | ${esc(m.publishedAt)} |`);
  lines.push(`| **Product type** | ${esc(m.product)} |`);
  lines.push(`| **Format / story** | ${esc(m.format || "—")} / ${esc(m.storyKind || "—")} |`);
  lines.push(`| **Topic** | ${esc(m.topic || "—")} |`);
  lines.push("");
  lines.push(`**Instagram insights**`);
  lines.push("");
  if (i._error) {
    lines.push(`Insights error: ${esc(i._error)}`);
    lines.push("");
  } else {
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|------:|`);
    lines.push(`| Views | ${num(i.views)} |`);
    lines.push(`| Reach (unique accounts) | ${num(i.reach)} |`);
    lines.push(`| Views / reach | ${i.views && i.reach ? (i.views / i.reach).toFixed(2) : "—"} |`);
    lines.push(`| Avg watch time | ${msToSec(i.ig_reels_avg_watch_time)} |`);
    lines.push(
      `| Total watch time | ${
        i.ig_reels_video_view_total_time != null
          ? `${(i.ig_reels_video_view_total_time / 1000 / 60).toFixed(1)} min`
          : "—"
      } |`
    );
    lines.push(`| Skip rate | ${i.reels_skip_rate != null ? pct(i.reels_skip_rate) : "—"} |`);
    lines.push(`| Likes | ${num(i.likes ?? m.likes)} |`);
    lines.push(`| Comments | ${num(i.comments ?? m.comments)} |`);
    lines.push(`| Shares | ${num(i.shares)} |`);
    lines.push(`| Saves | ${num(i.saved)} |`);
    lines.push(`| Total interactions | ${num(i.total_interactions)} |`);
    lines.push(`| Like rate (likes/views) | ${likeRate(i.likes ?? m.likes, i.views)} |`);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function monthSummary(month, ytList, igList, ch, igAcc) {
  const ytViews = ytList.reduce((s, v) => s + (v.dataViews || 0), 0);
  const igViews = igList.reduce((s, m) => s + (m.insights?.views || 0), 0);
  const ytWithA = ytList.filter((v) => v.analytics);
  const avgAvd = ytWithA.length
    ? ytWithA.reduce((s, v) => s + v.analytics.avd, 0) / ytWithA.length
    : null;
  const avgAvp = ytWithA.length
    ? ytWithA.reduce((s, v) => s + v.analytics.avp, 0) / ytWithA.length
    : null;
  const igSkip = igList.map((m) => m.insights?.reels_skip_rate).filter((x) => x != null);
  const avgSkip = igSkip.length ? igSkip.reduce((a, b) => a + b, 0) / igSkip.length : null;
  const topYt = [...ytList].sort((a, b) => (b.dataViews || 0) - (a.dataViews || 0))[0];
  const topIg = [...igList].sort((a, b) => (b.insights?.views || 0) - (a.insights?.views || 0))[0];

  return `# EpicAstra review — ${month}

Fetched: ${raw.fetchedAt}

## Channel snapshot

| | YouTube | Instagram |
|--|--------:|----------:|
| Handle | ${ch.customUrl || ch.title} | @${igAcc?.username || "—"} |
| Audience | ${ch.subscribers} subs | ${igAcc?.followers} followers |
| Lifetime views / media | ${ch.views} views · ${ch.videos} videos | ${igAcc?.mediaCount} media |
| **This month uploads** | **${ytList.length}** Shorts | **${igList.length}** Reels |
| **This month views (sum)** | **${ytViews}** | **${igViews}** |

## Month highlights

| | YouTube | Instagram |
|--|---------|-----------|
| Top by views | ${topYt ? `${topYt.titleHi || topYt.platformTitle} (**${topYt.dataViews}**)` : "—"} | ${topIg ? `${topIg.titleHi || topIg.platformTitle} (**${topIg.insights?.views}**)` : "—"} |
| Avg AVD / skip | AVD ${avgAvd != null ? avgAvd.toFixed(0) + "s" : "—"} · %viewed ${avgAvp != null ? avgAvp.toFixed(1) + "%" : "—"} | Skip ${avgSkip != null ? avgSkip.toFixed(1) + "%" : "—"} |

## Ranked YouTube (${month})

| # | Hindi title | English title | Views | Likes | AVD | % viewed | Duration | Episode |
|--:|-------------|---------------|------:|------:|----:|---------:|---------:|---------|
${ytList
  .slice()
  .sort((a, b) => (b.dataViews || 0) - (a.dataViews || 0))
  .map(
    (v, i) =>
      `| ${i + 1} | ${esc(v.titleHi)} | ${esc(v.titleEn)} | ${num(v.dataViews)} | ${num(v.dataLikes)} | ${v.analytics ? v.analytics.avd + "s" : "—"} | ${v.analytics ? pct(v.analytics.avp) : "—"} | ${esc(v.duration)} | \`${esc(v.episodeId)}\` |`
  )
  .join("\n")}

## Ranked Instagram (${month})

| # | Hindi title | English title | Views | Reach | Avg watch | Skip % | Likes | Saves | Episode |
|--:|-------------|---------------|------:|------:|----------:|-------:|------:|------:|---------|
${igList
  .slice()
  .sort((a, b) => (b.insights?.views || 0) - (a.insights?.views || 0))
  .map((m, i) => {
    const ins = m.insights || {};
    return `| ${i + 1} | ${esc(m.titleHi)} | ${esc(m.titleEn)} | ${num(ins.views)} | ${num(ins.reach)} | ${msToSec(ins.ig_reels_avg_watch_time)} | ${ins.reels_skip_rate != null ? pct(ins.reels_skip_rate) : "—"} | ${num(ins.likes ?? m.likes)} | ${num(ins.saved)} | \`${esc(m.episodeId)}\` |`;
  })
  .join("\n")}

## Diagnosis notes (${month})

- Cross-check Shorts **≤ ~75s** vs long outliers (AVD % collapses when runtime is 2+ min).
- IG **skip rate ~30%** = healthy for EpicAstra winners; **≥40%** = hook problem.
- IG **reach ≈ followers** = cold start / no distribution; winners show reach in the thousands.
- Prefer mystery-hook Hindi titles that already crossed 1K on either platform.

## Detail pages

- [YouTube video-by-video](./youtube.md)
- [Instagram video-by-video](./instagram.md)
`;
}

// ---------- 4) Append new sections to Oct detail files ----------
const ytList = raw.youtube.byMonth["2026-10"] || [];
const igList = raw.instagram.byMonth["2026-10"] || [];
const nextYtIndex = existingYt.size + 1;
const nextIgIndex = existingIg.size + 1;

// Sort new by views desc to match prior convention within the append block,
// but keep publish-chrono for "where we left" continuity — use publish desc (newest first).
const newYtSorted = [...newYt].sort((a, b) => (b.dataViews || 0) - (a.dataViews || 0));
const newIgSorted = [...newIg].sort((a, b) => (b.insights?.views || 0) - (a.insights?.views || 0));

let ytAppend = "";
if (newYtSorted.length) {
  ytAppend =
    `\n\n## Appended ${raw.fetchedAt.slice(0, 10)} (new since prior review)\n\n` +
    newYtSorted.map((v, i) => ytVideoSection(v, nextYtIndex + i)).join("\n");
}
let igAppend = "";
if (newIgSorted.length) {
  igAppend =
    `\n\n## Appended ${raw.fetchedAt.slice(0, 10)} (new since prior review)\n\n` +
    newIgSorted.map((m, i) => igVideoSection(m, nextIgIndex + i)).join("\n");
}

function patchHeader(md, { fetchedAt, countLabel, count, channelLine }) {
  let out = md.replace(/^Fetched:.*$/m, `Fetched: ${fetchedAt} (appended from prior; new sections below)`);
  if (countLabel) {
    out = out.replace(
      new RegExp(`(${countLabel}: \\*\\*)\\d+(\\*\\*)`),
      `$1${count}$2`
    );
  }
  if (channelLine) {
    // refresh first channel/account snapshot line if present
    out = out.replace(/^Channel:.*$/m, channelLine).replace(/^Account:.*$/m, channelLine);
  }
  return out;
}

const ch = raw.youtube.channel;
const igAcc = raw.instagram.account;

let ytOut = patchHeader(ytOctMd, {
  fetchedAt: raw.fetchedAt,
  countLabel: "Videos this month",
  count: ytList.length,
  channelLine: `Channel: **${ch.title}** (${ch.customUrl || ""}) · ${ch.subscribers} subscribers · ${ch.views} lifetime views`
});
let igOut = patchHeader(igOctMd, {
  fetchedAt: raw.fetchedAt,
  countLabel: "Reels this month",
  count: igList.length,
  channelLine: `Account: **@${igAcc?.username}** · ${igAcc?.followers} followers · ${igAcc?.mediaCount} media`
});

if (ytAppend) ytOut = ytOut.replace(/\s*$/, "") + "\n" + ytAppend;
if (igAppend) igOut = igOut.replace(/\s*$/, "") + "\n" + igAppend;

await writeFile(ytOctPath, ytOut);
await writeFile(igOctPath, igOut);
await writeFile(
  path.join(root, "2026-10", "summary.md"),
  monthSummary("2026-10", ytList, igList, ch, igAcc)
);

// Also refresh Sept summary numbers (no append — same video set expected)
const ytSep = raw.youtube.byMonth["2026-09"] || [];
const igSep = raw.instagram.byMonth["2026-09"] || [];
await writeFile(
  path.join(root, "2026-09", "summary.md"),
  monthSummary("2026-09", ytSep, igSep, ch, igAcc)
);

console.log(
  JSON.stringify(
    {
      ok: true,
      appendedYt: newYtSorted.map((v) => ({
        id: v.id,
        episodeId: v.episodeId,
        titleHi: v.titleHi,
        views: v.dataViews
      })),
      appendedIg: newIgSorted.map((m) => ({
        id: m.id,
        episodeId: m.episodeId,
        titleHi: m.titleHi,
        views: m.insights?.views
      })),
      ytOctTotal: ytList.length,
      igOctTotal: igList.length
    },
    null,
    2
  )
);
