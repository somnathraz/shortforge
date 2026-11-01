/**
 * Instagram Login OAuth (Business) — authorize URL + code exchange + long-lived token.
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */
import type { BrandId } from '../lib/brands.js';
import { currentBrandId } from '../lib/brands.js';
import { signInstagramOAuthState } from '../lib/publishConnections.js';

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export type InstagramAppConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function instagramAppConfig(): InstagramAppConfig {
  const clientId = trimEnv('INSTAGRAM_APP_ID') || trimEnv('INSTAGRAM_CLIENT_ID');
  const clientSecret = trimEnv('INSTAGRAM_APP_SECRET') || trimEnv('INSTAGRAM_CLIENT_SECRET');
  const redirectUri =
    trimEnv('INSTAGRAM_REDIRECT_URI') ||
    `http://127.0.0.1:${process.env.UI_PORT || '8787'}/api/publish/instagram-oauth/callback`;

  const missing: string[] = [];
  if (!clientId) missing.push('INSTAGRAM_APP_ID');
  if (!clientSecret) missing.push('INSTAGRAM_APP_SECRET');
  if (missing.length) {
    throw new Error(
      `Instagram OAuth needs ${missing.join(' + ')} in .env (Instagram app credentials).`
    );
  }

  return { clientId: clientId!, clientSecret: clientSecret!, redirectUri };
}

export function instagramAuthSetup(brandId: BrandId = currentBrandId()): {
  ready: boolean;
  missing: string[];
  redirectUri: string;
  brandId: BrandId;
  authUrl?: string;
} {
  const missing: string[] = [];
  if (!(trimEnv('INSTAGRAM_APP_ID') || trimEnv('INSTAGRAM_CLIENT_ID'))) {
    missing.push('INSTAGRAM_APP_ID');
  }
  if (!(trimEnv('INSTAGRAM_APP_SECRET') || trimEnv('INSTAGRAM_CLIENT_SECRET'))) {
    missing.push('INSTAGRAM_APP_SECRET');
  }
  const redirectUri =
    trimEnv('INSTAGRAM_REDIRECT_URI') ||
    `http://127.0.0.1:${process.env.UI_PORT || '8787'}/api/publish/instagram-oauth/callback`;
  if (missing.length) {
    return { ready: false, missing, redirectUri, brandId };
  }
  return {
    ready: true,
    missing: [],
    redirectUri,
    brandId,
    authUrl: instagramAuthUrl(instagramAppConfig(), brandId)
  };
}

/** Browser authorization URL (Instagram Login). */
export function instagramAuthUrl(
  config = instagramAppConfig(),
  brandId: BrandId = currentBrandId()
): string {
  const scopes = [
    'instagram_business_basic',
    'instagram_business_content_publish'
  ].join(',');
  const state = signInstagramOAuthState({ brandId });

  return (
    `https://www.instagram.com/oauth/authorize` +
    `?enable_fb_login=0` +
    `&force_authentication=1` +
    `&client_id=${encodeURIComponent(config.clientId)}` +
    `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${encodeURIComponent(state)}`
  );
}

export type InstagramTokenExchange = {
  accessToken: string;
  userId: string;
  expiresIn?: number;
  tokenType?: string;
};

/** Exchange ?code= for a short-lived user access token. */
export async function exchangeInstagramAuthCode(
  code: string,
  config = instagramAppConfig()
): Promise<InstagramTokenExchange> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    code
  });

  const response = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30_000)
  });
  const json = (await response.json()) as {
    access_token?: string;
    user_id?: number | string;
    expires_in?: number;
    token_type?: string;
    error_type?: string;
    error_message?: string;
    code?: number;
  };
  if (!response.ok || !json.access_token || json.user_id == null) {
    throw new Error(
      json.error_message ||
        json.error_type ||
        `Instagram code exchange failed (${response.status})`
    );
  }
  return {
    accessToken: json.access_token,
    userId: String(json.user_id),
    ...(json.expires_in != null ? { expiresIn: json.expires_in } : {}),
    ...(json.token_type ? { tokenType: json.token_type } : {})
  };
}

function instagramGraphBase(): string {
  const version = trimEnv('INSTAGRAM_GRAPH_VERSION') || trimEnv('META_GRAPH_VERSION') || 'v21.0';
  const apiBase = (trimEnv('INSTAGRAM_API_BASE') || 'https://graph.instagram.com').replace(
    /\/$/,
    ''
  );
  return /\/v\d+\.\d+$/i.test(apiBase) ? apiBase : `${apiBase}/${version}`;
}

/** Exchange short-lived token for a long-lived Instagram user token (~60 days). */
export async function exchangeInstagramLongLivedToken(
  shortLivedToken: string,
  config = instagramAppConfig()
): Promise<{ accessToken: string; expiresIn?: number }> {
  const url =
    `${instagramGraphBase()}/access_token?` +
    new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: config.clientSecret,
      access_token: shortLivedToken
    });

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error?.message || `Long-lived token exchange failed (${response.status})`);
  }
  return {
    accessToken: json.access_token,
    ...(json.expires_in != null ? { expiresIn: json.expires_in } : {})
  };
}

/**
 * Refresh an existing long-lived Instagram user token (~60 more days).
 * Token must still be valid and usually ≥24h old. No browser OAuth.
 */
export async function refreshInstagramLongLivedToken(
  longLivedToken: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const url =
    `${instagramGraphBase()}/refresh_access_token?` +
    new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: longLivedToken
    });

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error?.message ||
        `Instagram token refresh failed (${response.status}). If expired, use Desk → Refresh Instagram (OAuth).`
    );
  }
  return {
    accessToken: json.access_token,
    ...(json.expires_in != null ? { expiresIn: json.expires_in } : {})
  };
}

export async function fetchInstagramUsername(
  accessToken: string,
  userId: string
): Promise<string | undefined> {
  const url =
    `${instagramGraphBase()}/${encodeURIComponent(userId)}?` +
    new URLSearchParams({ fields: 'id,username', access_token: accessToken });
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const json = (await response.json()) as { username?: string; error?: { message?: string } };
  if (!response.ok) return undefined;
  return json.username;
}

/** Full authorize → code → long-lived token (+ optional username). */
export async function completeInstagramOAuth(code: string): Promise<{
  accessToken: string;
  userId: string;
  username?: string;
  expiresIn?: number;
}> {
  const short = await exchangeInstagramAuthCode(code);
  let accessToken = short.accessToken;
  let expiresIn = short.expiresIn;
  try {
    const longLived = await exchangeInstagramLongLivedToken(short.accessToken);
    accessToken = longLived.accessToken;
    expiresIn = longLived.expiresIn ?? expiresIn;
  } catch {
    // Keep short-lived token if long-lived exchange fails (still usable for testing).
  }
  const username = await fetchInstagramUsername(accessToken, short.userId);
  return {
    accessToken,
    userId: short.userId,
    ...(username ? { username } : {}),
    ...(expiresIn != null ? { expiresIn } : {})
  };
}
