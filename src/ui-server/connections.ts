import { currentBrandId, getBrand, type BrandId } from '../lib/brands.js';
import {
  brandPublishProfiles,
  getFacebookVaultEntry,
  getInstagramVaultEntry,
  getYoutubeVaultEntry,
  type ConnectionPlatform
} from '../lib/publishConnections.js';
import { resolveFacebookCredentials, resolveInstagramCredentials } from '../providers/metaUpload.js';
import {
  fetchYoutubeChannelTitle,
  resolveYoutubeCredentials,
  youtubeDeskRedirectUri
} from '../providers/youtubeUpload.js';
import { instagramMediaHostingStatus } from '../lib/s3PublishMedia.js';

export type PublishConnection = {
  platform: 'youtube' | 'instagram' | 'facebook';
  state: 'connected' | 'unchecked' | 'setup_required' | 'error';
  label: string;
  message: string;
  missing: string[];
  connectUrl: string;
  brandId: BrandId;
  accountName?: string;
  /** Instagram only — how the public MP4 will be provided */
  mediaHosting?: {
    ready: boolean;
    mode: 'env_url' | 's3' | 'missing';
    label: string;
    message: string;
    missing: string[];
    exampleKey?: string;
    publicUrl?: string;
  };
};

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function missing(names: string[]): string[] {
  return names.filter((name) => !present(name));
}

function deskYoutubeAuthUrl(brandId: BrandId): string {
  return `/api/publish/youtube-auth/start?pipeline=${encodeURIComponent(brandId)}`;
}

function deskInstagramAuthUrl(brandId: BrandId): string {
  return `/api/publish/instagram-auth/start?pipeline=${encodeURIComponent(brandId)}`;
}

function configuredConnection(
  platform: PublishConnection['platform'],
  label: string,
  connectUrl: string,
  brandId: BrandId,
  message?: string
): PublishConnection {
  return {
    platform,
    state: 'unchecked',
    label,
    message: message || 'Credentials found. Run Check connections before publishing.',
    missing: [],
    connectUrl,
    brandId
  };
}

function instagramSetupConnection(brandId: BrandId): PublishConnection {
  const deskAuthUrl = deskInstagramAuthUrl(brandId);
  const vault = getInstagramVaultEntry(brandId);
  if (resolveInstagramCredentials(brandId)) {
    const handle = vault?.accountName ? `@${vault.accountName.replace(/^@/, '')}` : null;
    return {
      ...configuredConnection(
        'instagram',
        'Instagram',
        deskAuthUrl,
        brandId,
        handle
          ? `Credentials found for ${handle} (${getBrand(brandId).label}). Run Check connections before publishing.`
          : `Credentials found for ${getBrand(brandId).label}. Run Check connections. Use Authorize Instagram to refresh.`
      ),
      ...(vault?.accountName ? { accountName: vault.accountName.replace(/^@/, '') } : {})
    };
  }

  if (present('INSTAGRAM_APP_ID') || present('INSTAGRAM_CLIENT_ID')) {
    const absent = missing(['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET']).filter((name) => {
      if (name === 'INSTAGRAM_APP_ID' && present('INSTAGRAM_CLIENT_ID')) return false;
      if (name === 'INSTAGRAM_APP_SECRET' && present('INSTAGRAM_CLIENT_SECRET')) return false;
      return true;
    });
    if (!absent.length) {
      return {
        platform: 'instagram',
        state: 'setup_required',
        label: 'Instagram',
        message: `Instagram app ready — Authorize Instagram for pipeline ${getBrand(brandId).label}.`,
        missing: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_USER_ID'],
        connectUrl: deskAuthUrl,
        brandId
      };
    }
    return {
      platform: 'instagram',
      state: 'setup_required',
      label: 'Instagram',
      message: `Missing ${absent.join(', ')} in .env.`,
      missing: absent,
      connectUrl: deskAuthUrl,
      brandId
    };
  }

  return {
    platform: 'instagram',
    state: 'setup_required',
    label: 'Instagram',
    message:
      'Add INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET to .env (one-time Meta app), then Authorize Instagram for this pipeline.',
    missing: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
    connectUrl: deskAuthUrl,
    brandId
  };
}

function facebookSetupConnection(brandId: BrandId): PublishConnection {
  const connectUrl = 'https://developers.facebook.com/apps/';
  const vault = getFacebookVaultEntry(brandId);
  if (resolveFacebookCredentials(brandId)) {
    return {
      ...configuredConnection(
        'facebook',
        'Facebook',
        connectUrl,
        brandId,
        vault?.accountName
          ? `Credentials found for ${vault.accountName} (${brandId}).`
          : `Page token found for pipeline ${brandId}. Run Check connections.`
      ),
      ...(vault?.accountName ? { accountName: vault.accountName } : {})
    };
  }

  // Prefer vault messaging; fall back to env keys for epicastra setup hints.
  return {
    platform: 'facebook',
    state: 'setup_required',
    label: 'Facebook',
    message: `Missing Page token for ${brandId}. Add META_ACCESS_TOKEN + FACEBOOK_PAGE_ID to .env (migrates into data/connections/${brandId}.json) or paste into the connection vault.`,
    missing: ['META_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'],
    connectUrl,
    brandId
  };
}

function youtubeSetupConnection(brandId: BrandId): PublishConnection {
  const deskAuthUrl = deskYoutubeAuthUrl(brandId);
  const vault = getYoutubeVaultEntry(brandId);
  if (resolveYoutubeCredentials(brandId)) {
    return {
      ...configuredConnection(
        'youtube',
        'YouTube',
        deskAuthUrl,
        brandId,
        vault?.accountName
          ? `Credentials found for ${vault.accountName} (${getBrand(brandId).label}). Run Check connections before publishing.`
          : `Credentials found for ${getBrand(brandId).label}. Run Check connections. Use Authorize YouTube to refresh.`
      ),
      ...(vault?.accountName ? { accountName: vault.accountName } : {})
    };
  }

  const missingClient = missing(['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']);
  if (!missingClient.length) {
    return {
      platform: 'youtube',
      state: 'setup_required',
      label: 'YouTube',
      message: `YouTube app ready — Authorize YouTube for pipeline ${getBrand(brandId).label}. Redirect URI: ${youtubeDeskRedirectUri()}`,
      missing: ['YOUTUBE_REFRESH_TOKEN'],
      connectUrl: deskAuthUrl,
      brandId
    };
  }

  return {
    platform: 'youtube',
    state: 'setup_required',
    label: 'YouTube',
    message: `Missing ${missingClient.join(', ')} in .env (one Google OAuth client for all pipelines).`,
    missing: missingClient,
    connectUrl: 'https://console.cloud.google.com/apis/credentials',
    brandId
  };
}

function attachInstagramMediaHosting(connection: PublishConnection): PublishConnection {
  if (connection.platform !== 'instagram') return connection;
  const hosting = instagramMediaHostingStatus();
  return {
    ...connection,
    mediaHosting: {
      ready: hosting.ready,
      mode: hosting.mode,
      label: hosting.label,
      message: hosting.message,
      missing: hosting.missing,
      ...(hosting.exampleKey ? { exampleKey: hosting.exampleKey } : {}),
      ...(hosting.publicUrl ? { publicUrl: hosting.publicUrl } : {})
    },
    message:
      connection.state === 'setup_required'
        ? connection.message
        : hosting.ready
          ? `${connection.message} Media: ${hosting.label}.`
          : `${connection.message} Media hosting not ready — ${hosting.message}`
  };
}

export function publishConnectionSetup(
  brandId: BrandId = currentBrandId()
): PublishConnection[] {
  const profiles = brandPublishProfiles(brandId);
  const builders: Record<ConnectionPlatform, () => PublishConnection> = {
    youtube: () => youtubeSetupConnection(brandId),
    instagram: () => attachInstagramMediaHosting(instagramSetupConnection(brandId)),
    facebook: () => facebookSetupConnection(brandId)
  };
  return profiles.map((platform) => builders[platform]());
}

async function testYoutube(connection: PublishConnection): Promise<PublishConnection> {
  const creds = resolveYoutubeCredentials(connection.brandId);
  if (!creds) throw new Error('YouTube credentials missing');

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token'
  });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20_000)
  });
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || 'OAuth token refresh failed');
  }
  const accountName = await fetchYoutubeChannelTitle(token.access_token);
  return {
    ...connection,
    state: 'connected',
    message: accountName
      ? `Connected to ${accountName} (${getBrand(connection.brandId).label}).`
      : `YouTube connection verified (${getBrand(connection.brandId).label}).`,
    ...(accountName ? { accountName } : {})
  };
}

async function testInstagram(connection: PublishConnection): Promise<PublishConnection> {
  const creds = resolveInstagramCredentials(connection.brandId);
  if (!creds) throw new Error('Instagram credentials missing');

  const response = await fetch(
    `${creds.graphBase}/${encodeURIComponent(creds.userId)}?` +
      new URLSearchParams({
        fields: 'id,username,name',
        access_token: creds.token
      }),
    { signal: AbortSignal.timeout(20_000) }
  );
  const result = (await response.json()) as {
    id?: string;
    name?: string;
    username?: string;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(result.error?.message || 'Instagram account check failed');
  const accountName = result.username || result.name || result.id;
  const modeLabel = creds.mode === 'instagram_login' ? 'Instagram Login' : 'Facebook Login';
  return attachInstagramMediaHosting({
    ...connection,
    state: 'connected',
    message: accountName
      ? `Connected to @${accountName.replace(/^@/, '')} (${modeLabel} · ${getBrand(connection.brandId).label}).`
      : `Instagram connection verified (${modeLabel} · ${getBrand(connection.brandId).label}).`,
    ...(accountName ? { accountName: accountName.replace(/^@/, '') } : {})
  });
}

async function testFacebook(connection: PublishConnection): Promise<PublishConnection> {
  const creds = resolveFacebookCredentials(connection.brandId);
  if (!creds) throw new Error('Facebook credentials missing');
  const version = process.env.META_GRAPH_VERSION || 'v21.0';
  const response = await fetch(
    `https://graph.facebook.com/${version}/${encodeURIComponent(creds.pageId)}?` +
      new URLSearchParams({ fields: 'id,name', access_token: creds.token }),
    { signal: AbortSignal.timeout(20_000) }
  );
  const result = (await response.json()) as {
    name?: string;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(result.error?.message || 'Facebook Page check failed');
  const accountName = result.name;
  return {
    ...connection,
    state: 'connected',
    message: accountName
      ? `Connected to ${accountName} (${connection.brandId}).`
      : `Facebook connection verified (${connection.brandId}).`,
    ...(accountName ? { accountName } : {})
  };
}

export async function testPublishConnections(
  platforms?: PublishConnection['platform'][],
  brandId: BrandId = currentBrandId()
): Promise<PublishConnection[]> {
  const setup = publishConnectionSetup(brandId);
  const wanted = new Set(
    (platforms?.length ? platforms : setup.map((item) => item.platform)).filter((platform) =>
      setup.some((item) => item.platform === platform)
    )
  );
  // Never leak other brands' destinations (e.g. EpicAstra YT/FB on tech-instagram).
  const scoped = setup.filter((connection) => wanted.has(connection.platform));
  return Promise.all(
    scoped.map(async (connection) => {
      if (connection.state === 'setup_required') return connection;
      try {
        if (connection.platform === 'youtube') return await testYoutube(connection);
        if (connection.platform === 'instagram') return await testInstagram(connection);
        return await testFacebook(connection);
      } catch (error) {
        const failed = {
          ...connection,
          state: 'error' as const,
          message: error instanceof Error ? error.message : String(error)
        };
        return connection.platform === 'instagram' ? attachInstagramMediaHosting(failed) : failed;
      }
    })
  );
}
