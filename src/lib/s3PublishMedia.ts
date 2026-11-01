import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { currentBrand } from './brands.js';

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export type S3PublishConfig = {
  bucket: string;
  region: string;
  prefix: string;
  publicBaseUrl?: string;
  endpoint?: string;
  forcePathStyle: boolean;
  objectAcl?: 'public-read';
};

export function s3PublishConfigured(): boolean {
  return Boolean(
    trimEnv('S3_BUCKET') &&
      (trimEnv('AWS_ACCESS_KEY_ID') || trimEnv('S3_ACCESS_KEY_ID')) &&
      (trimEnv('AWS_SECRET_ACCESS_KEY') || trimEnv('S3_SECRET_ACCESS_KEY'))
  );
}

export function loadS3PublishConfig(): S3PublishConfig {
  const bucket = trimEnv('S3_BUCKET');
  if (!bucket) throw new Error('S3_BUCKET is required for Instagram Reel hosting');
  const region = trimEnv('AWS_REGION') || trimEnv('S3_REGION') || 'ap-south-1';
  // Prefer brand registry prefix so EpicAstra / Tech media never share the same keyspace.
  const brandPrefix = currentBrand().s3Prefix?.trim();
  const prefixRaw = (brandPrefix || trimEnv('S3_PREFIX') || 'mythology-factory/reels/').replace(
    /^\/+/,
    ''
  );
  const prefix = prefixRaw.endsWith('/') ? prefixRaw : `${prefixRaw}/`;
  const config: S3PublishConfig = {
    bucket,
    region,
    prefix,
    forcePathStyle: trimEnv('S3_FORCE_PATH_STYLE') === 'true'
  };
  const publicBaseUrl = trimEnv('S3_PUBLIC_BASE_URL');
  if (publicBaseUrl) config.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
  const endpoint = trimEnv('S3_ENDPOINT');
  if (endpoint) config.endpoint = endpoint;
  if (trimEnv('S3_OBJECT_ACL') === 'public-read') config.objectAcl = 'public-read';
  return config;
}

function createClient(config: S3PublishConfig): S3Client {
  const accessKeyId = trimEnv('AWS_ACCESS_KEY_ID') || trimEnv('S3_ACCESS_KEY_ID');
  const secretAccessKey = trimEnv('AWS_SECRET_ACCESS_KEY') || trimEnv('S3_SECRET_ACCESS_KEY');
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or S3_*) are required');
  }
  return new S3Client({
    region: config.region,
    credentials: { accessKeyId, secretAccessKey },
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle
  });
}

export function publicObjectUrl(config: S3PublishConfig, key: string): string {
  if (config.publicBaseUrl) return `${config.publicBaseUrl}/${key.replace(/^\/+/, '')}`;
  if (config.endpoint) {
    const endpoint = config.endpoint.replace(/\/$/, '');
    return config.forcePathStyle
      ? `${endpoint}/${config.bucket}/${key}`
      : `${endpoint.replace('://', `://${config.bucket}.`)}/${key}`;
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

function sanitizeEpisodeId(episodeId: string): string {
  const cleaned = episodeId.trim().replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'unknown-episode';
}

/**
 * Keys look like:
 *   mythology-factory/reels/{episodeId}/short.mp4
 * Optional timestamped archive when S3_KEEP_VERSIONS=true:
 *   mythology-factory/reels/{episodeId}/2026-09-05T10-00-00-000Z.mp4
 */
function buildObjectKey(
  config: S3PublishConfig,
  localPath: string,
  options?: { key?: string; episodeId?: string }
): string {
  if (options?.key) {
    const override = options.key.replace(/^\/+/, '');
    if (options.episodeId) {
      return `${config.prefix}${sanitizeEpisodeId(options.episodeId)}/${override}`;
    }
    return `${config.prefix}${override}`;
  }

  const episodeId = options?.episodeId ? sanitizeEpisodeId(options.episodeId) : null;
  const base = path.basename(localPath).replace(/[^\w.\-]+/g, '_') || 'short.mp4';
  const keepVersions = trimEnv('S3_KEEP_VERSIONS') === 'true';

  if (episodeId) {
    if (keepVersions) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      return `${config.prefix}${episodeId}/${stamp}-${base}`;
    }
    // Keep Reel + Story as separate objects so a Story trim does not clobber the full Short.
    const isStoryCut = /story60s|[-_.]story\./i.test(base);
    return `${config.prefix}${episodeId}/${isStoryCut ? 'story.mp4' : 'short.mp4'}`;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${config.prefix}${stamp}-${base}`;
}

export async function uploadPublicMp4(options: {
  localPath: string;
  key?: string;
  episodeId?: string;
  force?: boolean;
}): Promise<{ key: string; url: string; bucket: string; episodeId?: string; reused: boolean }> {
  if (!s3PublishConfigured()) {
    throw new Error(
      'S3 not configured. Set S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (see docs/publish-setup.md)'
    );
  }
  const config = loadS3PublishConfig();
  const client = createClient(config);
  const key = buildObjectKey(config, options.localPath, {
    ...(options.key ? { key: options.key } : {}),
    ...(options.episodeId ? { episodeId: options.episodeId } : {})
  });
  const fileStat = await stat(options.localPath);
  const force =
    options.force === true ||
    trimEnv('S3_FORCE_REUPLOAD') === 'true' ||
    trimEnv('S3_KEEP_VERSIONS') === 'true';

  if (!force) {
    try {
      const head = await client.send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: key
        })
      );
      const remoteSize = Number(head.ContentLength || 0);
      if (remoteSize > 0 && remoteSize === fileStat.size) {
        const url = publicObjectUrl(config, key);
        console.log(`S3 reuse (same size ${remoteSize} bytes): s3://${config.bucket}/${key}`);
        return {
          key,
          url,
          bucket: config.bucket,
          reused: true,
          ...(options.episodeId ? { episodeId: sanitizeEpisodeId(options.episodeId) } : {})
        };
      }
      console.log(
        `S3 object exists but size differs (remote ${remoteSize} vs local ${fileStat.size}) — re-uploading`
      );
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const httpStatus = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      if (name !== 'NotFound' && httpStatus !== 404) {
        // Permission or other issues — fall through to PutObject which will surface a clearer error.
        console.warn(
          `S3 HeadObject skipped reuse check: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: createReadStream(options.localPath),
      ContentType: 'video/mp4',
      ContentLength: fileStat.size,
      CacheControl: 'public, max-age=3600',
      ...(config.objectAcl ? { ACL: config.objectAcl } : {}),
      Metadata: {
        ...(options.episodeId ? { episodeid: sanitizeEpisodeId(options.episodeId) } : {})
      }
    })
  );

  const url = publicObjectUrl(config, key);
  console.log(`S3 uploaded: s3://${config.bucket}/${key}`);
  return {
    key,
    url,
    bucket: config.bucket,
    reused: false,
    ...(options.episodeId ? { episodeId: sanitizeEpisodeId(options.episodeId) } : {})
  };
}

/** Instagram (and browsers) must be able to GET the MP4 with no auth. */
export async function assertPublicVideoUrl(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000)
  });
  if (response.ok) {
    const type = response.headers.get('content-type') || '';
    if (type && !/video|octet-stream|mp4/i.test(type)) {
      console.warn(`Public URL content-type is "${type}" — Instagram expects video/mp4`);
    }
    return;
  }
  // Some S3 configs reject HEAD but allow GET
  const get = await fetch(url, {
    method: 'GET',
    headers: { range: 'bytes=0-0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000)
  });
  if (get.ok || get.status === 206) return;

  throw new Error(
    `Public video URL is not reachable (HTTP ${response.status}). ` +
      `Instagram got the same failure. Fix S3 public read on this object/prefix, then retry.\n` +
      `URL: ${url}\n` +
      `Bucket policy needs s3:GetObject for Principal "*" on your reels prefix, and Block Public Access must allow public policies.`
  );
}

/** Resolve a public HTTPS URL for Instagram: explicit env, else auto-upload to S3. */
export async function resolveInstagramVideoPublicUrl(
  localVideoPath: string,
  episodeId?: string
): Promise<{
  url: string;
  source: 'env' | 's3';
  key?: string;
  reused?: boolean;
}> {
  const fromEnv = trimEnv('META_REEL_VIDEO_URL') || trimEnv('PUBLISH_VIDEO_PUBLIC_URL');
  if (fromEnv) {
    await assertPublicVideoUrl(fromEnv);
    return { url: fromEnv, source: 'env' };
  }
  if (!s3PublishConfigured()) {
    throw new Error(
      'Instagram needs a public HTTPS MP4. Set PUBLISH_VIDEO_PUBLIC_URL, or configure S3_BUCKET + AWS keys to auto-upload.'
    );
  }
  const uploaded = await uploadPublicMp4({
    localPath: localVideoPath,
    ...(episodeId ? { episodeId } : {})
  });
  try {
    await assertPublicVideoUrl(uploaded.url);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n` +
        `Uploaded key: s3://${uploaded.bucket}/${uploaded.key}`
    );
  }
  return {
    url: uploaded.url,
    source: 's3',
    key: uploaded.key,
    reused: uploaded.reused
  };
}

export type InstagramMediaHostingStatus = {
  ready: boolean;
  mode: 'env_url' | 's3' | 'missing';
  label: string;
  message: string;
  missing: string[];
  /** Example object key once episode id is known */
  exampleKey?: string;
  /** Env override URL if set (safe to show in UI) */
  publicUrl?: string;
  bucket?: string;
  region?: string;
  prefix?: string;
};

/** Desk UI / connection check: how Instagram will get a public MP4. */
export function instagramMediaHostingStatus(episodeId?: string): InstagramMediaHostingStatus {
  const envUrl = trimEnv('META_REEL_VIDEO_URL') || trimEnv('PUBLISH_VIDEO_PUBLIC_URL');
  if (envUrl) {
    return {
      ready: true,
      mode: 'env_url',
      label: 'Fixed public URL',
      message: 'Using PUBLISH_VIDEO_PUBLIC_URL / META_REEL_VIDEO_URL for Instagram.',
      missing: [],
      publicUrl: envUrl
    };
  }

  if (s3PublishConfigured()) {
    const config = loadS3PublishConfig();
    const folder = episodeId ? sanitizeEpisodeId(episodeId) : '<episodeId>';
    const exampleKey = `${config.prefix}${folder}/short.mp4`;
    return {
      ready: true,
      mode: 's3',
      label: 'S3 auto-upload',
      message: `On Instagram upload, the master MP4 is uploaded to S3 as ${exampleKey}, then Instagram fetches that public HTTPS URL.`,
      missing: [],
      exampleKey,
      bucket: config.bucket,
      region: config.region,
      prefix: config.prefix
    };
  }

  const missing = [
    !trimEnv('S3_BUCKET') ? 'S3_BUCKET' : null,
    !(trimEnv('AWS_ACCESS_KEY_ID') || trimEnv('S3_ACCESS_KEY_ID')) ? 'AWS_ACCESS_KEY_ID' : null,
    !(trimEnv('AWS_SECRET_ACCESS_KEY') || trimEnv('S3_SECRET_ACCESS_KEY'))
      ? 'AWS_SECRET_ACCESS_KEY'
      : null
  ].filter((item): item is string => Boolean(item));

  return {
    ready: false,
    mode: 'missing',
    label: 'Public media missing',
    message:
      'Instagram cannot read localhost. Configure S3 auto-upload (S3_BUCKET + AWS keys) or set PUBLISH_VIDEO_PUBLIC_URL to a public HTTPS MP4.',
    missing: missing.length ? missing : ['S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
  };
}
