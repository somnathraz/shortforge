# Plan: Instagram / Facebook connect (Meta)

**Status:** Phase 1–2 (operator vault) implemented — see code under `src/lib/publishConnections.ts`.  
**Goal:** Make it clear who can connect IG/FB, what Meta setup is unavoidable, and what we build next so EpicAstra + Tech can publish without `.env` token roulette.

**System design (source of truth for multi-user + multi-pipeline publish):**  
[`publish-identity-architecture.md`](./publish-identity-architecture.md)

Related: [`multi-account-architecture.md`](./multi-account-architecture.md), [`multi-pipeline-ui-plan.md`](./multi-pipeline-ui-plan.md), [`../publish-setup.md`](../publish-setup.md).

---

## 1. The real question

> Can people connect their Instagram / Facebook with the current Desk, or do they need Meta developer setup?

| Who | Can they connect today? | What they need |
| --- | --- | --- |
| **You (operator)** | Yes, after one-time Meta app setup | Meta developer app + `.env` app id/secret; then Desk **Authorize Instagram** |
| **Second brand (Tech IG)** | Not cleanly | Same Meta app (or second app) + second token set; today one `.env` overwrites the other |
| **Random creators / customers** | No | Would need a **Live** Meta app, App Review, hosted redirect URLs, per-user token storage — not this product yet |

**Hard Meta rule (never goes away):** publishing Reels/Page video always requires a Meta/Instagram **app** with content-publish permissions. Nobody can publish via Graph API with only a normal IG password login and no app.

---

## 2. Current state (what we already have)

```text
Desk Publish
   │
   ├─ Instagram
   │    • Needs INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET in .env (Meta app)
   │    • Then OAuth: Authorize Instagram → writes INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID into .env
   │    • Also needs public MP4 (S3 or PUBLISH_VIDEO_PUBLIC_URL)
   │
   ├─ Facebook
   │    • No OAuth button
   │    • Manual: META_ACCESS_TOKEN + FACEBOOK_PAGE_ID in .env
   │
   └─ Storage model
        • Single global .env (one IG account active at a time)
        • persistInstagramLoginTokens() overwrites the same keys
```

So: **Instagram login UX exists for one operator account.** Multi-account and multi-user are missing.

---

## 3. Product choice (pick one north star)

### Option A — Operator multi-account (recommended next)

You run the factory. Two (or more) of *your* brand accounts connect cleanly.

- One Meta developer account (yours).
- Per-pipeline connection records: EpicAstra IG/FB/YT vs Tech IG.
- Desk shows only connections for the active pipeline.
- Tokens stored per `brandId`, not one global `INSTAGRAM_ACCESS_TOKEN`.

**Who benefits:** you.  
**Who does not:** strangers connecting their own IG.

### Option B — Multi-user “Connect my Instagram” (SaaS-style)

**Possible: yes.** Creators do **not** each need a Meta developer account. They only OAuth into **your** Live app and upload to **their** IG/Page.

Requires beyond current repo:

1. Your Meta app in **Live** mode + **App Review** (`instagram_business_content_publish`, Page publish scopes).
2. Public HTTPS redirect URIs (not `127.0.0.1`) on a hosted Desk/API.
3. Per-user encrypted token store (DB), not `.env` writes.
4. Login/session for Desk users (so uploads use the right token).
5. Privacy policy, data deletion callback, Meta business verification often.
6. Per-user S3 media + abuse/rate limits.

**Not possible without that:** local-only Desk + Development-mode app for strangers.

### Decision for this plan

**End goal = Option B** (anyone connects their IG via our Live Meta app).  
**Ship Option A / architecture Phase P1 first** (operator multi-pipeline vault), then **Phase P2** multi-user — see [`publish-identity-architecture.md`](./publish-identity-architecture.md) §§11–14.

---

## 4. Target architecture (Option A)

```text
config/brands/
  epicastra.json          publishProfiles: [youtube, instagram, facebook]
  tech-instagram.json     publishProfiles: [instagram]

data/connections/         (new — not .env for account tokens)
  epicastra.json
  tech-instagram.json

.env                      (shared infra only)
  INSTAGRAM_APP_ID / SECRET   ← your Meta app (one app can authorize multiple IG users you own)
  META_APP_ID / SECRET        ← if Facebook Login path used
  S3_* / AWS_*                ← media hosting
  YOUTUBE_CLIENT_*            ← Google project (shared); refresh tokens per brand in connections files
```

Example connection record:

```json
{
  "brandId": "tech-instagram",
  "instagram": {
    "mode": "instagram_login",
    "userId": "…",
    "accessToken": "…",
    "accountName": "@techhandle",
    "expiresAt": "…"
  },
  "facebook": null,
  "youtube": null
}
```

**Rules:**

1. OAuth callback receives `brandId` (state param) and writes that brand’s file only.
2. Publish refuses if episode `brandId` ≠ connection `brandId`.
3. Desk Publish list filters by active pipeline.
4. `.env` keeps **app** secrets; **user/page tokens** move out of global keys (migrate existing tokens once).

---

## 5. Meta setup checklist (still required once)

Do this outside the code (you, Meta console):

### Shared (both brands)

1. Meta developer account → create app with Instagram / content publishing use cases.
2. Add redirect URIs:
   - Desk: `http://127.0.0.1:8787/api/publish/instagram-oauth/callback`
   - CLI (optional): existing CLI callback
3. Put `INSTAGRAM_APP_ID` + `INSTAGRAM_APP_SECRET` in `.env`.
4. S3 (or public URL) ready for Reels.

### Per brand account

| Brand | Instagram | Facebook |
| --- | --- | --- |
| EpicAstra | Professional IG A → Authorize in Desk while pipeline = EpicAstra | Page A → token + page id (manual now; OAuth later) |
| Tech | Professional IG B → Authorize while pipeline = Tech | Skip at launch (IG-only) |

IG must be Professional (Creator/Business). For Facebook Login path, IG must be linked to a Page.

---

## 6. Build phases

### Phase 0 — Decisions (this doc)

- [ ] Confirm Option A (operator multi-account), not SaaS yet
- [ ] Tech: IG-only at connect time (no FB)
- [ ] Token storage: `data/connections/<brandId>.json` (gitignored) vs encrypted file — pick one
- [ ] One Meta app for both IG accounts vs two apps (one app is enough if you admin both IG users)

### Phase 1 — Connection store + brand-scoped IG OAuth

1. Add `data/connections/` + load/save helpers; gitignore secrets.
2. Migrate current `.env` IG token into `epicastra` connection on first run (optional helper).
3. OAuth `state` = `brandId` (or signed payload).
4. `persistInstagramLoginTokens` writes connection file for that brand, not global overwrite.
5. `resolveInstagramCredentials(brandId)` reads connection store.
6. Desk: Authorize Instagram uses active pipeline’s brandId.
7. Smoke: connect EpicAstra IG, switch pipeline, connect Tech IG, both persist.

### Phase 2 — Publish safety + Desk UX

1. Publish path always passes episode `brandId` into credential resolve.
2. Connections API returns only profiles for active pipeline.
3. Clear UI copy: “App credentials in .env (once). Account login per pipeline.”
4. Token expiry / Refresh Instagram per brand.

### Phase 3 — Facebook operator connect (optional)

1. Add Facebook Login OAuth (Page picker) similar to IG, or keep Graph Explorer paste but **per brand** fields in connection file.
2. EpicAstra only until Tech needs FB.

### Phase 4 — Multi-user SaaS (end goal — architecture Phase P2)

1. Hosted Desk + public redirects.
2. Meta App Review + Live mode.
3. User accounts + encrypted token DB (`ownerUserId` on every connection).
4. Per-tenant S3 prefix + rate limits + disconnect/delete + Meta data-deletion callback.

Full design: [`publish-identity-architecture.md`](./publish-identity-architecture.md).  
Do not start Phase 4 until Phase 1–2 (operator vault + brand lock) are green.

---

## 7. What Desk should say to the user

| State | Message |
| --- | --- |
| Missing app id/secret | “One-time: add Meta Instagram app ID/secret to `.env` (see publish-setup). Then Authorize.” |
| App ready, no account | “Authorize Instagram for **this pipeline**.” |
| Connected | “Connected @handle · pipeline Tech/EpicAstra.” |
| Wrong pipeline | Never list the other brand’s IG. |

Avoid implying strangers can plug any IG without Meta app ownership.

---

## 8. Out of scope (v1)

- Letting customers connect accounts without your Meta app
- TikTok / Upload-Post wrappers
- Storing tokens in git or committing `data/connections/*.json`
- Automatic Meta App Review submission

---

## 9. Acceptance (Option A done)

1. EpicAstra and Tech each have their own IG connection after Authorize.
2. Switching pipeline does not wipe the other token.
3. Publishing a tech episode cannot hit EpicAstra IG.
4. Facebook still works for EpicAstra via connection record (manual token OK).
5. New machine: copy `.env` app secrets + `data/connections/` (or re-Authorize).

---

## 10. Locked product choices

1. **End goal:** multi-user connect-any-IG (architecture P2).  
2. **Near-term:** operator multi-pipeline vault (architecture P1 / Phases 1–2 here).  
3. **Tech connect:** IG-only at launch.  
4. **Token files:** `data/connections/<brand>.json` (gitignored).  
5. **One Meta app** for all OAuth clients.

Implement **Phase 1 + 2** with multi-pipeline Phase E; then P2 when hosting + App Review are ready.  
Architecture: [`publish-identity-architecture.md`](./publish-identity-architecture.md).
