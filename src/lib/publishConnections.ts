/**
 * Per-pipeline publish connection vault (P1 operator multi-account).
 * Tokens live in data/connections/<brandId>.json — not a single global .env overwrite.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LEGACY_ENV_BRAND_ID,
  type BrandId,
  currentBrandId,
  getBrand,
  isBrandId,
  LOCAL_OPERATOR_USER_ID
} from './brands.js';

const ROOT = process.cwd();
const VAULT_VERSION = 1 as const;

export type ConnectionPlatform = 'youtube' | 'instagram' | 'facebook';

export type InstagramVaultEntry = {
  connectionId: string;
  mode: 'instagram_login' | 'facebook_login';
  userId: string;
  accessToken: string;
  accountName?: string;
  expiresAt?: string;
  status: 'active' | 'expired' | 'revoked';
  updatedAt: string;
};

export type FacebookVaultEntry = {
  connectionId: string;
  pageId: string;
  accessToken: string;
  accountName?: string;
  status: 'active' | 'expired' | 'revoked';
  updatedAt: string;
};

export type YoutubeVaultEntry = {
  connectionId: string;
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
  accountName?: string;
  /** Series playlist — each Tech Short is appended after upload. */
  playlistId?: string;
  playlistTitle?: string;
  status: 'active' | 'expired' | 'revoked';
  updatedAt: string;
};

/** Operator series progress (DSA days + YouTube playlist) — not secrets. */
export type BrandSeriesTracker = {
  title: string;
  totalDays: number;
  /** Next day number to publish (1-based). */
  nextDay: number;
  lastPublishedDay?: number;
  lastPublishedAt?: string;
  lastEpisodeId?: string;
  youtubePlaylistId?: string;
  youtubePlaylistTitle?: string;
  youtubePlaylistUrl?: string;
};

export type BrandConnectionFile = {
  version: typeof VAULT_VERSION;
  ownerUserId: string;
  brandId: BrandId;
  platforms: {
    instagram?: InstagramVaultEntry;
    facebook?: FacebookVaultEntry;
    youtube?: YoutubeVaultEntry;
  };
  series?: BrandSeriesTracker;
};

export type InstagramOAuthState = {
  brandId: BrandId;
  ownerUserId: string;
  nonce: string;
  exp: number;
};

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function connectionsDir(): string {
  const override = process.env.MF_CONNECTIONS_DIR?.trim();
  const dir = override ? path.resolve(override) : path.join(ROOT, 'data', 'connections');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function brandConnectionPath(brandId: BrandId): string {
  return path.join(connectionsDir(), `${brandId}.json`);
}

function newConnectionId(platform: ConnectionPlatform): string {
  return `conn_${platform}_${randomBytes(6).toString('hex')}`;
}

function emptyVault(brandId: BrandId): BrandConnectionFile {
  return {
    version: VAULT_VERSION,
    ownerUserId: LOCAL_OPERATOR_USER_ID,
    brandId,
    platforms: {}
  };
}

function readVaultFile(brandId: BrandId): BrandConnectionFile | null {
  const filePath = brandConnectionPath(brandId);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as BrandConnectionFile;
    if (raw.brandId !== brandId) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeBrandConnections(vault: BrandConnectionFile): string {
  const filePath = brandConnectionPath(vault.brandId);
  // Holds live OAuth tokens: owner read/write only.
  writeFileSync(filePath, `${JSON.stringify(vault, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(filePath, 0o600);
  return filePath;
}

/** One-time / backfill: copy global .env tokens into epicastra vault when missing. */
export function migrateEnvIntoVaultIfNeeded(brandId: BrandId = LEGACY_ENV_BRAND_ID): BrandConnectionFile {
  const existing = readVaultFile(brandId);
  const vault = existing || emptyVault(brandId);
  const now = new Date().toISOString();
  let changed = false;

  if (brandId === LEGACY_ENV_BRAND_ID) {
    if (!vault.platforms.instagram) {
      const igToken = trimEnv('INSTAGRAM_ACCESS_TOKEN');
      const igUserId = trimEnv('INSTAGRAM_USER_ID');
      if (igToken && igUserId) {
        vault.platforms.instagram = {
          connectionId: newConnectionId('instagram'),
          mode: 'instagram_login',
          userId: igUserId,
          accessToken: igToken,
          status: 'active',
          updatedAt: now
        };
        changed = true;
      } else {
        const metaToken = trimEnv('META_ACCESS_TOKEN') || trimEnv('FACEBOOK_PAGE_ACCESS_TOKEN');
        const businessId = trimEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID');
        if (metaToken && businessId) {
          vault.platforms.instagram = {
            connectionId: newConnectionId('instagram'),
            mode: 'facebook_login',
            userId: businessId,
            accessToken: metaToken,
            status: 'active',
            updatedAt: now
          };
          changed = true;
        }
      }
    }

    if (!vault.platforms.facebook) {
      const fbToken = trimEnv('META_ACCESS_TOKEN') || trimEnv('FACEBOOK_PAGE_ACCESS_TOKEN');
      const pageId = trimEnv('FACEBOOK_PAGE_ID');
      if (fbToken && pageId) {
        vault.platforms.facebook = {
          connectionId: newConnectionId('facebook'),
          pageId,
          accessToken: fbToken,
          status: 'active',
          updatedAt: now
        };
        changed = true;
      }
    }

    if (!vault.platforms.youtube) {
      const youtubeRefresh = trimEnv('YOUTUBE_REFRESH_TOKEN');
      if (youtubeRefresh) {
        vault.platforms.youtube = {
          connectionId: newConnectionId('youtube'),
          refreshToken: youtubeRefresh,
          status: 'active',
          updatedAt: now,
          ...(trimEnv('YOUTUBE_CLIENT_ID') ? { clientId: trimEnv('YOUTUBE_CLIENT_ID') } : {}),
          ...(trimEnv('YOUTUBE_CLIENT_SECRET')
            ? { clientSecret: trimEnv('YOUTUBE_CLIENT_SECRET') }
            : {})
        };
        changed = true;
      }
    }
  }

  if (changed) writeBrandConnections(vault);
  return vault;
}

export function loadBrandConnections(brandId: BrandId = currentBrandId()): BrandConnectionFile {
  return migrateEnvIntoVaultIfNeeded(brandId);
}

export function getInstagramVaultEntry(
  brandId: BrandId = currentBrandId()
): InstagramVaultEntry | null {
  const vault = loadBrandConnections(brandId);
  const entry = vault.platforms.instagram;
  if (!entry || entry.status === 'revoked') return null;
  return entry;
}

export function getFacebookVaultEntry(
  brandId: BrandId = currentBrandId()
): FacebookVaultEntry | null {
  const vault = loadBrandConnections(brandId);
  const entry = vault.platforms.facebook;
  if (!entry || entry.status === 'revoked') return null;
  return entry;
}

export function getYoutubeVaultEntry(
  brandId: BrandId = currentBrandId()
): YoutubeVaultEntry | null {
  const vault = loadBrandConnections(brandId);
  const entry = vault.platforms.youtube;
  if (!entry || entry.status === 'revoked') return null;
  return entry;
}

export function persistYoutubeVaultTokens(input: {
  brandId: BrandId;
  refreshToken: string;
  accountName?: string;
  clientId?: string;
  clientSecret?: string;
  playlistId?: string;
  playlistTitle?: string;
}): string {
  const vault = loadBrandConnections(input.brandId);
  const previous = vault.platforms.youtube;
  vault.platforms.youtube = {
    connectionId: previous?.connectionId || newConnectionId('youtube'),
    refreshToken: input.refreshToken,
    status: 'active',
    updatedAt: new Date().toISOString(),
    ...(input.accountName || previous?.accountName
      ? { accountName: input.accountName || previous?.accountName }
      : {}),
    ...(input.clientId || previous?.clientId
      ? { clientId: input.clientId || previous?.clientId }
      : {}),
    ...(input.clientSecret || previous?.clientSecret
      ? { clientSecret: input.clientSecret || previous?.clientSecret }
      : {}),
    ...(input.playlistId || previous?.playlistId
      ? { playlistId: input.playlistId || previous?.playlistId }
      : {}),
    ...(input.playlistTitle || previous?.playlistTitle
      ? { playlistTitle: input.playlistTitle || previous?.playlistTitle }
      : {})
  };
  const filePath = writeBrandConnections(vault);

  // Keep process.env aligned for EpicAstra / active brand (legacy callers).
  if (input.brandId === currentBrandId() || input.brandId === LEGACY_ENV_BRAND_ID) {
    process.env.YOUTUBE_REFRESH_TOKEN = input.refreshToken;
  }

  return filePath;
}

export function persistYoutubePlaylistId(input: {
  brandId: BrandId;
  playlistId: string;
  playlistTitle?: string;
}): string {
  const vault = loadBrandConnections(input.brandId);
  const previous = vault.platforms.youtube;
  if (!previous?.refreshToken) {
    throw new Error(
      `YouTube not connected for ${input.brandId} — Authorize YouTube before creating a playlist.`
    );
  }
  const playlistTitle = input.playlistTitle || previous.playlistTitle || 'DSA 90 Days';
  vault.platforms.youtube = {
    ...previous,
    playlistId: input.playlistId,
    playlistTitle,
    updatedAt: new Date().toISOString()
  };
  const series = vault.series || {
    title: playlistTitle,
    totalDays: 90,
    nextDay: 1
  };
  vault.series = {
    ...series,
    youtubePlaylistId: input.playlistId,
    youtubePlaylistTitle: playlistTitle,
    youtubePlaylistUrl: `https://www.youtube.com/playlist?list=${input.playlistId}`
  };
  return writeBrandConnections(vault);
}

export function getBrandSeriesTracker(
  brandId: BrandId = currentBrandId()
): BrandSeriesTracker | null {
  return loadBrandConnections(brandId).series || null;
}

/** Bump series day after a successful Tech publish (keeps playlist ids in sync). */
export function recordSeriesPublishDay(input: {
  brandId: BrandId;
  episodeId?: string;
  day?: number;
  playlistId?: string;
  playlistTitle?: string;
}): BrandSeriesTracker {
  const vault = loadBrandConnections(input.brandId);
  const previous = vault.series || {
    title: input.playlistTitle || 'DSA 90 Days',
    totalDays: 90,
    nextDay: 1
  };
  const publishedDay = input.day ?? previous.nextDay;
  const nextDay = Math.min(previous.totalDays, publishedDay + 1);
  const playlistId = input.playlistId || previous.youtubePlaylistId;
  const playlistTitle = input.playlistTitle || previous.youtubePlaylistTitle;
  vault.series = {
    ...previous,
    lastPublishedDay: publishedDay,
    nextDay,
    lastPublishedAt: new Date().toISOString(),
    ...(input.episodeId ? { lastEpisodeId: input.episodeId } : {}),
    ...(playlistId
      ? {
          youtubePlaylistId: playlistId,
          youtubePlaylistUrl: `https://www.youtube.com/playlist?list=${playlistId}`
        }
      : {}),
    ...(playlistTitle ? { youtubePlaylistTitle: playlistTitle } : {})
  };
  if (playlistId && vault.platforms.youtube) {
    vault.platforms.youtube = {
      ...vault.platforms.youtube,
      playlistId,
      ...(playlistTitle ? { playlistTitle } : {}),
      updatedAt: new Date().toISOString()
    };
  }
  writeBrandConnections(vault);
  return vault.series;
}

export function persistInstagramVaultTokens(input: {
  brandId: BrandId;
  accessToken: string;
  userId: string;
  accountName?: string;
  expiresIn?: number;
  mode?: 'instagram_login' | 'facebook_login';
}): { envPath: string; brandId: BrandId } {
  const vault = loadBrandConnections(input.brandId);
  const now = new Date();
  const expiresAt =
    input.expiresIn != null
      ? new Date(now.getTime() + input.expiresIn * 1000).toISOString()
      : undefined;
  const previous = vault.platforms.instagram;
  vault.platforms.instagram = {
    connectionId: previous?.connectionId || newConnectionId('instagram'),
    mode: input.mode || 'instagram_login',
    userId: input.userId,
    accessToken: input.accessToken,
    status: 'active',
    updatedAt: now.toISOString(),
    ...(input.accountName ? { accountName: input.accountName.replace(/^@/, '') } : {}),
    ...(expiresAt ? { expiresAt } : {})
  };
  const filePath = writeBrandConnections(vault);

  // Keep process.env aligned for the active brand only (legacy callers / same-process Desk).
  if (input.brandId === currentBrandId() || input.brandId === LEGACY_ENV_BRAND_ID) {
    process.env.INSTAGRAM_ACCESS_TOKEN = input.accessToken;
    process.env.INSTAGRAM_USER_ID = input.userId;
  }

  return { envPath: filePath, brandId: input.brandId };
}

export function persistFacebookVaultTokens(input: {
  brandId: BrandId;
  accessToken: string;
  pageId: string;
  accountName?: string;
}): string {
  const vault = loadBrandConnections(input.brandId);
  const previous = vault.platforms.facebook;
  vault.platforms.facebook = {
    connectionId: previous?.connectionId || newConnectionId('facebook'),
    pageId: input.pageId,
    accessToken: input.accessToken,
    status: 'active',
    updatedAt: new Date().toISOString(),
    ...(input.accountName ? { accountName: input.accountName } : {})
  };
  return writeBrandConnections(vault);
}

export function brandPublishProfiles(brandId: BrandId = currentBrandId()): ConnectionPlatform[] {
  const profiles = getBrand(brandId).publishProfiles;
  return profiles.filter((p): p is ConnectionPlatform =>
    p === 'youtube' || p === 'instagram' || p === 'facebook'
  );
}

function stateSecret(): string {
  return (
    trimEnv('CONNECTIONS_STATE_SECRET') ||
    trimEnv('INSTAGRAM_APP_SECRET') ||
    trimEnv('INSTAGRAM_CLIENT_SECRET') ||
    'mythology-factory-dev-oauth-state'
  );
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

/** Signed OAuth state binding brand (+ operator user) for Instagram Login. */
export function signInstagramOAuthState(input: {
  brandId: BrandId;
  ownerUserId?: string;
  ttlSeconds?: number;
}): string {
  const payload: InstagramOAuthState = {
    brandId: input.brandId,
    ownerUserId: input.ownerUserId || LOCAL_OPERATOR_USER_ID,
    nonce: randomBytes(8).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 600)
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', stateSecret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyInstagramOAuthState(raw: string | null | undefined): InstagramOAuthState {
  if (!raw?.trim()) {
    throw new Error('Missing OAuth state — restart Authorize Instagram from Desk for this pipeline.');
  }
  const [body, sigPart] = raw.split('.');
  if (!body || !sigPart) throw new Error('Invalid OAuth state format');
  const expected = createHmac('sha256', stateSecret()).update(body).digest();
  const actual = fromB64url(sigPart);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('Invalid OAuth state signature');
  }
  const payload = JSON.parse(fromB64url(body).toString('utf8')) as InstagramOAuthState;
  if (!isBrandId(payload.brandId)) throw new Error('OAuth state has unknown brandId');
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('OAuth state expired — click Authorize Instagram again.');
  }
  return payload;
}

/** Same signed state shape as Instagram — brand-bound for YouTube Desk OAuth. */
export function signYoutubeOAuthState(input: {
  brandId: BrandId;
  ownerUserId?: string;
  ttlSeconds?: number;
}): string {
  return signInstagramOAuthState(input);
}

export function verifyYoutubeOAuthState(raw: string | null | undefined): InstagramOAuthState {
  try {
    return verifyInstagramOAuthState(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      message
        .replace(/Authorize Instagram/g, 'Authorize YouTube')
        .replace(/Instagram/g, 'YouTube')
    );
  }
}

export function resolveBrandIdForPublish(episodeBrandId?: string | null): BrandId {
  if (isBrandId(episodeBrandId)) return episodeBrandId;
  return currentBrandId();
}
