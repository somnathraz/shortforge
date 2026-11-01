# Publish identity architecture

**Status:** Phase P1 implemented in code; P2 (multi-user hosted) still planned.  
**Goal:** Any signed-in user can connect **their** Instagram (and later Facebook/YouTube), produce pipeline content, and publish **only** to accounts they authorized — with **multiple pipelines** (EpicAstra, Tech, …) that never cross-publish.

Related: [`meta-connect-plan.md`](./meta-connect-plan.md), [`multi-pipeline-ui-plan.md`](./multi-pipeline-ui-plan.md), [`multi-account-architecture.md`](./multi-account-architecture.md), [`../publish-setup.md`](../publish-setup.md).

---

## 1. Product requirements

| Requirement | Meaning |
| --- | --- |
| Connect any Instagram | User clicks Authorize → OAuth into **our** Meta app → their Professional IG is linked |
| Multi-pipeline | Same person (or operator) can run EpicAstra + Tech with **separate** destination accounts |
| Publishable media | Final Short/Reel is a public HTTPS MP4 (S3); Meta pulls that URL |
| Proper setup | One Meta app (us); creators need no developer account once app is Live |
| Safe by default | Token A never publishes episode B; pipeline filter + brand lock + ownership lock |

**Hard Meta constraint:** Graph publish always needs **our** app with content-publish scopes. Creators never create their own Meta app when we host Live OAuth.

---

## 2. Mental model (three axes)

```text
  USER (who is logged in)
    │
    ├── owns CONNECTIONS (IG / FB / YT tokens)
    │
    └── works in PIPELINE / brand (epicastra | tech-instagram)
              │
              └── owns EPISODES + media under that brand
                        │
                        └── PUBLISH only if
                              episode.brandId == connection.brandId
                              AND connection.ownerUserId == session.userId
```

- **Pipeline** = content factory profile (prompts, episode dir, visuals, default platforms).
- **Connection** = a social account token bound to `(userId, brandId, platform)`.
- **Episode** = work product stamped with `brandId` (+ later `ownerUserId`).

---

## 3. System context

```text
┌─────────────┐     HTTPS      ┌──────────────────────┐
│  Desk UI    │ ◄────────────► │  API / Desk server   │
└─────────────┘                │  auth · jobs · publish│
                               └──────────┬───────────┘
                                          │
          ┌───────────────────────────────┼───────────────────────────────┐
          ▼                               ▼                               ▼
   ┌─────────────┐                 ┌─────────────┐                 ┌─────────────┐
   │ Meta Graph  │                 │ Object store│                 │ Token vault │
   │ IG / FB API │                 │ S3 public   │                 │ encrypted   │
   └─────────────┘                 │ MP4 / thumbs│                 │ connections │
                                   └─────────────┘                 └─────────────┘
          ▲
          │ OAuth only
   ┌─────────────┐
   │ Instagram / │
   │ Facebook    │
   │ (creator)   │
   └─────────────┘
```

**Env holds only platform app secrets** (Meta app id/secret, Google OAuth client, AWS keys, encryption key).  
**User tokens never live in process-global `INSTAGRAM_ACCESS_TOKEN` for multi-user.**

---

## 4. Layered design

| Layer | Responsibility | Today | Target |
| --- | --- | --- | --- |
| **L0 Identity** | Session / user id | Implicit single operator | `userId` + session cookie/JWT |
| **L1 Pipeline** | Brand config, episode dirs, prompts | `X-Pipeline` + `config/brands/*` | Unchanged idea; always required on API |
| **L2 Connections** | OAuth + token CRUD | Single `.env` overwrite | Vault rows keyed by user + brand + platform |
| **L3 Media** | Public URL for Meta | S3 / `PUBLISH_VIDEO_PUBLIC_URL` | Per-user prefix: `s3://…/{userId}/{brandId}/…` |
| **L4 Publish** | Upload Reel/Story/Page | Global creds in `metaUpload` | Resolve creds from vault using episode ownership |
| **L5 Audit** | Ledger / schedules | File-based | Same + `userId` + `connectionId` |

---

## 5. Data model

### 5.1 Core entities

```text
User
  id, email, createdAt

PipelineBrand  (config file, not DB)
  id: epicastra | tech-instagram
  episodesDir, publishProfiles[], s3Prefix, …

Connection
  id
  ownerUserId
  brandId                 // which pipeline this destination serves
  platform                // instagram | facebook | youtube
  accountExternalId       // IG user id / Page id / YT channel
  accountName             // @handle for UI
  mode                    // instagram_login | facebook_page | youtube_oauth
  accessTokenEnc          // encrypted at rest
  refreshTokenEnc?        // YT / long-lived refresh
  scopes[]
  expiresAt?
  status                  // active | expired | revoked
  createdAt, updatedAt

Episode  (existing JSON +)
  id, brandId
  ownerUserId             // add when multi-user
  …scenes, packaging…

PublishJob
  id, episodeId, connectionId, platform
  status, metaFormats, scheduledAt?, error?
```

### 5.2 Storage strategy (phased)

| Phase | Store | Path |
| --- | --- | --- |
| **P1 Operator** | Files | `data/connections/{brandId}.json` (gitignored); operator = synthetic `userId: local-operator` |
| **P2 Multi-user** | DB (SQLite → Postgres) | `connections` table; tokens encrypted with `CONNECTIONS_ENCRYPTION_KEY` |
| Always | `.env` | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, AWS, `CONNECTIONS_ENCRYPTION_KEY` |

P1 file shape (compatible with P2 migration):

```json
{
  "version": 1,
  "ownerUserId": "local-operator",
  "brandId": "tech-instagram",
  "platforms": {
    "instagram": {
      "connectionId": "conn_…",
      "mode": "instagram_login",
      "userId": "1789…",
      "accountName": "@handle",
      "accessToken": "…",
      "expiresAt": "2026-12-01T00:00:00.000Z",
      "status": "active"
    }
  }
}
```

---

## 6. OAuth & publish flows

### 6.1 Connect Instagram (any account)

```text
Desk (pipeline = tech-instagram, user = U)
  → GET /api/publish/instagram-auth/start
       ?  state = signed({ userId, brandId, nonce, exp })
  → Meta / Instagram authorize
  → GET /api/publish/instagram-oauth/callback?code&state
  → verify state signature + expiry
  → exchange code → long-lived token
  → UPSERT Connection(ownerUserId=U, brandId, platform=instagram)
  → Desk: Connected @handle
```

**Rules:**

- `state` must bind **both** `userId` and `brandId` (not brand alone).
- Same user may connect different IG accounts on different pipelines.
- Re-Authorize replaces that `(user, brand, platform)` row only.

### 6.2 Publish Reel

```text
Approve episode E (brandId=B, ownerUserId=U)
  → Resolve Connection where
       ownerUserId=U AND brandId=B AND platform=instagram AND status=active
  → Ensure public MP4 at s3://bucket/{U}/{B}/{episodeId}/final.mp4
  → Graph: create media container → publish
  → Ledger row: userId, connectionId, episodeId, platform
```

**Refuse if** any of: no connection, brand mismatch, owner mismatch, media not public HTTPS, token expired (offer Refresh).

### 6.3 Multi-pipeline isolation

```text
User U
  ├─ pipeline epicastra  → Connection IG-A, FB-Page-A, YT-A
  └─ pipeline tech       → Connection IG-B
```

Desk lists only connections for **active pipeline**.  
API publish ignores client-supplied “use this token”; server resolves from vault.

---

## 7. API surface (target)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/pipelines` | Existing brand list |
| `GET` | `/api/publish/connections` | Filter: session user + `X-Pipeline` |
| `POST` | `/api/publish/connections/test` | Verify token live |
| `GET` | `/api/publish/instagram-auth/start` | Signed state with user+brand |
| `GET` | `/api/publish/instagram-oauth/callback` | Persist to vault |
| `DELETE` | `/api/publish/connections/:id` | Disconnect / revoke locally |
| `POST` | `/api/publish/upload` | Existing; resolve creds from vault |
| `GET` | `/api/meta/data-deletion` | Required for Live Meta apps |
| `POST` | `/api/meta/deauthorize` | Meta deauthorize callback |

Headers: `X-Pipeline` (required for publish/episode routes).  
Auth: session cookie (P2); P1 may skip login and use `local-operator`.

---

## 8. Security & compliance

| Control | Implementation |
| --- | --- |
| App secrets | `.env` / secret manager only |
| User tokens | Encrypted at rest; never logged; never returned in full to UI |
| OAuth state | HMAC-signed, short TTL, single-use nonce |
| CSRF | Same-site cookies + state param |
| Isolation | All resolve paths require `userId` + `brandId` |
| Media | Private bucket + CloudFront **or** public prefix limited to publish objects; no listing of other users |
| Meta Live | Privacy policy URL, data deletion callback, App Review for publish scopes |
| Local-only | Development-mode app: only Meta roles/testers can OAuth — document clearly |

---

## 9. Media hosting (publishable image/video)

Instagram/Facebook **download** the file from a public HTTPS URL. Localhost never works for strangers (or for Reels in production).

```text
Produce final.mp4
  → upload S3 key:  publish/{userId}/{brandId}/{episodeId}/final.mp4
  → public URL:     https://cdn.example.com/publish/.../final.mp4
  → pass URL to Graph REELS / STORIES container
```

Also apply to cover/thumbnail images if the platform path needs them.  
Shared infra: one bucket; **prefix isolation** per user and brand.

---

## 10. Setup runbooks

### 10.1 Operator / local (P1) — your two pipelines

1. Create Meta app → Instagram content publish use case.  
2. Redirect URI: `http://127.0.0.1:8787/api/publish/instagram-oauth/callback`  
3. `.env`: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, S3 vars.  
4. Desk → EpicAstra → Authorize Instagram (account A).  
5. Switch pipeline → Tech → Authorize Instagram (account B).  
6. Produce → ensure S3 hosting ready → Publish.

Creators outside Meta tester list **cannot** use this mode.

### 10.2 Multi-user hosted (P2) — anyone connects

1. Host API+UI on `https://desk.yourdomain.com`.  
2. Meta app: Live mode; add production redirect  
   `https://desk.yourdomain.com/api/publish/instagram-oauth/callback`.  
3. App Review: `instagram_business_content_publish` (+ Page scopes if FB).  
4. Privacy policy + data deletion + deauthorize URLs.  
5. Ship user login; encrypt vault with `CONNECTIONS_ENCRYPTION_KEY`.  
6. Per-user S3 prefix + rate limits.  
7. Creators: Professional IG → Connect → produce → publish. **No** Meta developer account for them.

---

## 11. Mapping to current codebase

| Component | File(s) today | Change |
| --- | --- | --- |
| Brand registry | `src/lib/brands.ts`, `config/brands/*` | Keep; publishProfiles drive UI |
| Pipeline header | `src/ui-server/server.ts` (`X-Pipeline`) | Keep; add session user |
| Connection probe | `src/ui-server/connections.ts` | Read vault filtered by user+brand |
| IG OAuth | `src/providers/instagramAuth.ts` | Signed state user+brand |
| Persist tokens | `src/ui-server/instagramAuthPersist.ts` | Stop global `.env` overwrite; write vault |
| Resolve creds | `src/providers/metaUpload.ts` | `resolveInstagramCredentials({ userId, brandId })` |
| Publish | `src/pipeline/publish.ts` | Ownership + brand locks |
| S3 media | `src/lib/s3PublishMedia.ts` | Prefix `{userId}/{brandId}/` |
| Desk Publish UI | `ui/src/App.tsx` | Per-pipeline connections; Connect any IG copy |

---

## 12. Implementation phases

### Phase P1 — Operator multi-pipeline connections (near-term)

- [x] `data/connections/` + gitignore; `ownerUserId: local-operator`
- [x] OAuth state = signed `{ brandId }` (user fixed to operator)
- [x] Persist per brand; migrate existing `.env` IG token → `epicastra`
- [x] `resolve*(brandId)`; publish brand lock + publishProfiles filter
- [x] Desk: Authorize per active pipeline; Tech shows IG only

**Acceptance:** EpicAstra IG + Tech IG both persist; switch pipeline does not wipe tokens; wrong brand cannot publish.

### Phase P2 — Multi-user OAuth (anyone)

- [ ] User auth + sessions
- [ ] DB vault + encryption
- [ ] State includes `userId`; all APIs scoped
- [ ] Hosted HTTPS + Meta Live + App Review
- [ ] Data deletion / deauthorize endpoints
- [ ] Per-user S3 + rate limits
- [ ] Episode `ownerUserId`

**Acceptance:** Two different logins connect two different IG accounts on the same pipeline without seeing each other’s tokens; each can publish only to their connection.

### Phase P3 — Facebook + YouTube parity

- [ ] Facebook Page OAuth / picker into vault
- [ ] YouTube refresh tokens per user+brand (not only global env)
- [ ] Desk multi-select publish still brand-filtered

### Phase P4 — Growth

- [ ] Connection health cron (refresh before expiry)
- [ ] Team/workspace: multiple users share a brand (optional RBAC)
- [ ] Analytics filtered by userId + brandId

---

## 13. Non-goals

- Requiring every creator to open Meta Developer Console  
- Storing tokens in git  
- Cross-pipeline publish “for convenience”  
- TikTok in this architecture doc  
- Sharing one global `.env` token across users

---

## 14. Decision record

| Decision | Choice | Rationale |
| --- | --- | --- |
| End goal | Multi-user connect-any-IG (P2) | Product ask: anyone can publish to their account |
| Near-term ship | P1 operator multi-pipeline | Unblocks EpicAstra + Tech without hosting/App Review wait |
| Token key | `(ownerUserId, brandId, platform)` | Isolates pipelines and users |
| Media key | `publish/{userId}/{brandId}/{episodeId}/` | Prevents URL guessing across tenants |
| One Meta app | Yes | Creators OAuth into our app; we hold app secret |

---

## 15. Open items before P2 coding

1. Hosting domain for Desk callback  
2. Auth provider (email magic link vs Google vs both)  
3. SQLite-first vs Postgres-from-day-one  
4. Whether Tech pipeline allows Facebook later or stays IG-only  

P1 can start without answering 1–3.
