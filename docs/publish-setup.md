# Publish setup (YouTube + Instagram + Facebook)

Upload runs **only after** human approval:

```bash
npm run package -- --episode hanuman-forgot-powers
npm run package -- --episode hanuman-forgot-powers --language hi
npm run package -- --episode hanuman-forgot-powers --language en
npm run review -- --episode hanuman-forgot-powers --action APPROVE
npm run publish -- --episode hanuman-forgot-powers --dry-run
npm run publish -- --episode hanuman-forgot-powers --platforms youtube,instagram,facebook
```

## Packaging (titles, descriptions, tags, covers)

Generate per-platform copy + cover images **before** publish:

```bash
npm run package -- --episode hanuman-forgot-powers
npm run package -- --episode hanuman-forgot-powers --image-provider gemini
npm run package -- --episode hanuman-forgot-powers --skip-covers   # text only
```

Outputs in `output/packaging/<episodeId>/`:

| File | Purpose |
|------|---------|
| `packaging.json` | Full structured pack |
| `packaging.hi.json` / `packaging.en.json` | Saved language-specific packs |
| `youtube.txt` / `instagram.txt` / `facebook.txt` | Human-readable title, description, tags |
| `cover-youtube.*` | 16:9 thumbnail |
| `cover-instagram.*` | 9:16 cover |
| `cover-facebook.*` | 1:1 cover |

`npm run publish` auto-loads this pack when present (`--require-packaging` to force it).

Default YouTube privacy is **private** (`YOUTUBE_PRIVACY=private`).

## YouTube

1. Google Cloud Console → create OAuth **Desktop** client.
2. Enable **YouTube Data API v3**.
3. Put in `.env`:

```text
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=http://localhost:8765/oauth2callback
YOUTUBE_PRIVACY=private
```

4. One-time auth (per pipeline — same Google client, different channels):

In Google Cloud → OAuth client → Authorized redirect URIs, keep the EpicAstra URI:

- `http://localhost:8765/oauth2callback` (CLI + Desk Authorize YouTube — same)

Then either:

- Desk → switch pipeline → Publish → **Authorize YouTube**, or
- CLI:

```bash
npm run publish:youtube-auth -- --brand epicastra
npm run publish:youtube-auth -- --brand tech-instagram
```

Refresh tokens are stored in `data/connections/<brandId>.json` (EpicAstra also backfills `.env`).

## Facebook Page + Instagram Reels (Meta)

You need a **Meta app that can publish Page / Instagram content**, not only “Facebook Login for users.”

### A. On the “Add use cases” screen (what you’re looking at now)

1. Keep **Authenticate and request data from users with Facebook Login** if it’s already selected (useful to get tokens).
2. In the left filter, open **Content management**.
3. Add the use case(s) for publishing / managing content on **Facebook Pages** and **Instagram** (wording varies: Page content, Instagram content publishing, Instagram API).  
   If Meta says use cases can’t combine, create a **second app** for content and keep Login on the first — then use the content app’s token for publish.
4. Click **Next** and finish app creation.

### B. Link accounts

1. Instagram must be a **Professional** account (Creator or Business).
2. In Meta Business Suite / Instagram settings, **link that IG account to a Facebook Page**.
3. You will publish as that **Page** (FB) and that **IG user id** (Reels).

### C. Permissions (App → App Review / permissions, or Graph API Explorer)

Request / use at least:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts` (Facebook Page video)
- `instagram_basic`
- `instagram_content_publish` (Instagram Reels)

For a personal/test app, generate a token with those scopes for your admin user, then exchange for a **long-lived Page token**.

### D. Get IDs + token (Graph API Explorer is fine)

1. [Graph API Explorer](https://developers.facebook.com/tools/explorer/) → select your app → Generate token with the permissions above.
2. `GET /me/accounts` → copy your Page `id` → `FACEBOOK_PAGE_ID`, and the Page `access_token` → `META_ACCESS_TOKEN`.
3. `GET /{page-id}?fields=instagram_business_account` → copy `instagram_business_account.id` → `INSTAGRAM_BUSINESS_ACCOUNT_ID`.
4. Prefer a **long-lived Page token** (expires in ~60 days, or never for some system users). Short user tokens will break publish.

### E. What gets published (Reel + Story)

By default, Facebook and Instagram each publish **both**:

| Platform | Reel | Story (24h) |
|----------|------|-------------|
| Instagram | `media_type=REELS` | `media_type=STORIES` |
| Facebook Page | `/video_reels` | `/video_stories` |

Both formats need a **public HTTPS MP4** (S3 auto-upload or `PUBLISH_VIDEO_PUBLIC_URL`). Stories have no caption via API.

Toggle in `.env` if needed:

```text
META_PUBLISH_REEL=true
META_PUBLISH_STORY=true
```

Set either to `false` to skip that format.

## Instagram Reels

Two supported auth paths (first match wins):

### Path A — Instagram Login (what you have)

```text
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
# Desk redirect (must match Meta app Redirect URI):
# INSTAGRAM_REDIRECT_URI=http://127.0.0.1:8787/api/publish/instagram-oauth/callback
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_USER_ID=
INSTAGRAM_API_BASE=https://graph.instagram.com
INSTAGRAM_GRAPH_VERSION=v21.0
```

Refresh token (prefer silent refresh while still valid):

```bash
npm run publish:instagram-refresh
# or full browser OAuth if expired:
npm run publish:instagram-auth
```

Or in Desk → Publish → **Authorize Instagram** / **Refresh Instagram** (browser OAuth).

- Uses `graph.instagram.com` (not Facebook Page token).
- Needs scopes like `instagram_business_basic` + `instagram_business_content_publish`.
- **Reels need a public HTTPS MP4** (Instagram downloads it). Prefer S3 auto-upload below, or set:

```text
PUBLISH_VIDEO_PUBLIC_URL=https://your-bucket/episode.mp4
```

### Path B — Facebook Login / Page-linked IG

```text
META_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ACCOUNT_ID=
```

Uses `graph.facebook.com` with a Page token.

### Verify

Restart UI → Publish → Instagram should leave “Setup required” → **Re-check connections** → Connected @username.

## S3 setup for Instagram Reels (public MP4)

Instagram cannot read `localhost`. Host the approved Short on S3 (or R2), then publish uses that HTTPS URL.

### 1. Create the bucket (AWS console)

1. S3 → **Create bucket** (e.g. `mythology-factory-reels`) in a region close to you (`ap-south-1`).
2. **Block Public Access**: turn **off** “Block all public access” for this bucket **or** keep blocks on and use **CloudFront** + `S3_PUBLIC_BASE_URL` (recommended for production).
3. Simple public-prefix policy (if not using CloudFront) — **required** or Instagram gets ERROR / 403:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadReels",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/epicastra/*"
    }
  ]
}
```

Replace `YOUR_BUCKET_NAME` and the prefix (`epicastra/*` or `mythology-factory/reels/*`) to match your `S3_BUCKET` + `S3_PREFIX`.

**Block Public Access:** turn **off** “Block all public access” (or at least allow public bucket policies). Upload working + Instagram ERROR usually means PutObject works but GetObject is still **403**.

Quick check:

```bash
curl -I "https://YOUR_BUCKET.s3.REGION.amazonaws.com/epicastra/episode-id/short.mp4"
```

Must return `HTTP/1.1 200` (not 403).

4. IAM user with `s3:PutObject` (and `s3:PutObjectAcl` if using ACL) on that prefix. Create access key.

### 2. Put in `.env`

```text
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
S3_BUCKET=mythology-factory-reels
S3_PREFIX=mythology-factory/reels/
# Optional CDN:
# S3_PUBLIC_BASE_URL=https://dxxxxx.cloudfront.net
# Only if ACLs are enabled on the bucket:
# S3_OBJECT_ACL=public-read
```

### 3. Test upload

```bash
npm run publish:s3-upload -- --video output/final/<episode>.mp4 --episode <episodeId>
```

Objects are stored episode-wise:

```text
s3://your-bucket/mythology-factory/reels/<episodeId>/short.mp4
```

Open the printed URL in a browser/incognito — it must download/play **without** AWS login.

Set `S3_KEEP_VERSIONS=true` if you want timestamped files under each episode folder instead of overwriting `short.mp4`.

### 4. Publish

With S3 configured, Instagram publish **auto-uploads** the master MP4 and uses that URL. You do **not** need to set `PUBLISH_VIDEO_PUBLIC_URL` every time.

```bash
npm run publish -- --episode <id> --platforms instagram
```

### Cloudflare R2 (optional)

```text
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=true
S3_BUCKET=mythology-reels
AWS_ACCESS_KEY_ID=<r2 access key>
AWS_SECRET_ACCESS_KEY=<r2 secret>
S3_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev
AWS_REGION=auto
```

## Safety

- `npm run publish -- --dry-run` never uploads.
- Missing credentials → platform **skipped**, not a hard crash (other platforms still run).
- Reports: `output/publish/<episodeId>/publish-*.json` and `publish` block on the production JSON.
