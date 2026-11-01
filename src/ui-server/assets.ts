import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { probeAudioDuration } from '../audio/ffprobe.js';
import { outputDir } from './paths.js';
import type { AssetFile, EpisodeAssets, ProductionReportSummary, SceneAsset } from './types.js';
import { loadPublishLedger, mergePublishLedgers } from '../lib/publishLedger.js';

async function listFiles(dir: string, filter?: (name: string) => boolean): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (!filter || filter(entry.name)))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function walkFiles(dir: string, filter?: (name: string) => boolean): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkFiles(full, filter)));
    } else if (entry.isFile() && (!filter || filter(entry.name))) {
      found.push(full);
    }
  }
  return found;
}

function toPublic(absolute: string): string {
  const root = outputDir();
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  return `/api/media/${relative}`;
}

function toRelative(absolute: string): string {
  return path.relative(outputDir(), absolute).split(path.sep).join('/');
}

function sceneIdFromName(name: string): number | null {
  if (/^scene-ending(\.|-|$)/i.test(name)) return -1;
  if (/^scene-hook(\.|-|$)/i.test(name)) return 0;
  const match = name.match(/scene-(\d+)/i);
  if (!match) return null;
  return Number(match[1]);
}

function providerFromName(name: string, parentHint?: string): string {
  const lower = `${parentHint || ''} ${name}`.toLowerCase();
  if (lower.includes('upload')) return 'upload';
  if (lower.includes('veo')) return 'veo';
  if (lower.includes('wan') || lower.includes('ai-video')) return 'wan';
  if (lower.includes('ffmpeg') || lower.includes('kenburns')) return 'ffmpeg';
  return 'clip';
}

function audioProviderFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('final-mix') || lower.includes('sfx-mix')) return 'sound-director';
  if (lower.includes('edge')) return 'edge-tts';
  if (lower.includes('eleven')) return 'elevenlabs';
  if (lower.includes('sarvam')) return 'sarvam';
  return 'tts';
}

function imageProviderFromName(name: string): string {
  if (/upload/i.test(name)) return 'upload';
  return /\.jpe?g$/i.test(name) ? 'pollinations' : 'gemini';
}

async function sourceProviderFor(absolute: string, fallback: string): Promise<string> {
  try {
    const source = JSON.parse(await readFile(`${absolute}.source.json`, 'utf8')) as {
      provider?: string;
    };
    return source.provider?.trim() || fallback;
  } catch {
    return fallback;
  }
}

const durationCache = new Map<string, { signature: string; duration: number }>();

async function toAssetFile(absolute: string, provider?: string): Promise<AssetFile> {
  const info = await stat(absolute);
  const name = path.basename(absolute);
  // Bust browser/img cache when the same path is overwritten after regenerate.
  const baseUrl = toPublic(absolute);
  const base: AssetFile = {
    url: `${baseUrl}?v=${Math.round(info.mtimeMs)}`,
    path: toRelative(absolute),
    name,
    mtimeMs: info.mtimeMs,
    ...(provider ? { provider } : { provider: providerFromName(name) })
  };
  if (/\.(wav|mp3|m4a|aac|ogg|mp4|mov|webm|m4v)$/i.test(name)) {
    try {
      const signature = `${info.mtimeMs}:${info.size}`;
      const cached = durationCache.get(absolute);
      base.durationSeconds = cached?.signature === signature ? cached.duration : Number((await probeAudioDuration(absolute)).toFixed(2));
      if (durationCache.size > 1000) durationCache.clear();
      durationCache.set(absolute, { signature, duration: base.durationSeconds });
    } catch {
      // optional enrichment
    }
  }
  return base;
}

async function loadProduction(episodeId: string): Promise<ProductionReportSummary | null> {
  const reportPath = path.join(outputDir(), 'final', `${episodeId}.production.json`);
  try {
    const raw = JSON.parse(await readFile(reportPath, 'utf8')) as {
      reviewStatus?: string;
      finalVideo?: string;
      totals?: { costUsd?: number };
      regenerateSceneIds?: number[];
      scenes?: unknown[];
      staleReason?: string;
      publish?: ProductionReportSummary['publish'];
    };
    const fallbackFinal = path.join(outputDir(), 'final', `${episodeId}.mp4`);
    let finalVideo: string | undefined;
    if (raw.finalVideo) {
      const absolute = path.isAbsolute(raw.finalVideo)
        ? raw.finalVideo
        : path.resolve(raw.finalVideo);
      const root = outputDir();
      if (absolute === root || absolute.startsWith(root + path.sep)) {
        finalVideo = toPublic(absolute);
      }
    }
    if (!finalVideo && (await fileExists(fallbackFinal))) {
      finalVideo = toPublic(fallbackFinal);
    }
    const publishResults = mergePublishLedgers(
      await loadPublishLedger(episodeId),
      raw.publish?.results || []
    );
    return {
      path: toPublic(reportPath),
      reviewStatus: (raw.reviewStatus as ProductionReportSummary['reviewStatus']) || 'PENDING',
      ...(finalVideo ? { finalVideo } : {}),
      costUsd: Number(raw.totals?.costUsd || 0),
      regenerateSceneIds: raw.regenerateSceneIds || [],
      sceneCount: Array.isArray(raw.scenes) ? raw.scenes.length : 0,
      ...(raw.staleReason ? { staleReason: raw.staleReason } : {}),
      ...(publishResults.length
        ? {
            publish: {
              lastAt: raw.publish?.lastAt || publishResults.at(-1)?.recordedAt || '',
              dryRun: raw.publish?.dryRun || false,
              results: publishResults
            }
          }
        : {})
    };
  } catch {
    return null;
  }
}

async function loadHeritageDemos(episodeId: string): Promise<EpisodeAssets['heritageDemos']> {
  const dir = path.join(outputDir(), 'images', episodeId);
  const names = await listFiles(dir, (name) => /^demo-heritage-(strong|thin)\.(jpe?g|png)$/i.test(name));
  if (!names.length) return undefined;

  let strong: AssetFile | undefined;
  let thin: AssetFile | undefined;
  let variant: string | undefined;

  for (const absolute of names) {
    const base = path.basename(absolute);
    const weight = /strong/i.test(base) ? 'strong' : 'thin';
    const asset = await toAssetFile(absolute, await sourceProviderFor(absolute, 'heritage-demo'));
    if (weight === 'strong') strong = asset;
    else thin = asset;
    try {
      const meta = JSON.parse(await readFile(`${absolute}.source.json`, 'utf8')) as {
        visualStyle?: { frameVariant?: string };
      };
      if (meta.visualStyle?.frameVariant) variant = meta.visualStyle.frameVariant;
    } catch {
      // optional
    }
  }

  if (!strong && !thin) return undefined;
  return {
    ...(variant ? { variant } : {}),
    ...(strong ? { strong } : {}),
    ...(thin ? { thin } : {})
  };
}

export async function collectAssets(episodeId: string): Promise<EpisodeAssets> {
  const root = outputDir();

  const audioAbs = await listFiles(path.join(root, 'audio'), (name) =>
    /\.(mp3|wav)$/i.test(name)
  );
  // Only episode-tagged files — never orphan narration-edge-* from other runs.
  const audioSources = audioAbs.filter((file) => path.basename(file).includes(episodeId));
  const audioRanked = await Promise.all(
    audioSources.map(async (file) =>
      toAssetFile(
        file,
        await sourceProviderFor(file, audioProviderFromName(path.basename(file)))
      )
    )
  );
  audioRanked.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const imageFiles = await listFiles(
    path.join(root, 'images', episodeId),
    (name) => /\.(png|jpe?g|webp)$/i.test(name)
  );

  const clipSearchRoots = [
    path.join(root, 'veo', episodeId),
    path.join(root, 'ai-video', episodeId),
    path.join(root, 'clips', episodeId),
    path.join(root, 'wan'),
    path.join(root, 'final', episodeId, 'scene-clips')
  ];
  const clipFiles: string[] = [];
  for (const dir of clipSearchRoots) {
    clipFiles.push(...(await walkFiles(dir, (name) => /\.(mp4|mov|webm|m4v)$/i.test(name))));
  }

  const byScene = new Map<number, SceneAsset>();
  const ensure = (id: number) => {
    const existing = byScene.get(id);
    if (existing) return existing;
    const created: SceneAsset = {
      sceneId: id,
      imageCandidates: [],
      clipCandidates: []
    };
    byScene.set(id, created);
    return created;
  };

  for (const file of imageFiles) {
    const id = sceneIdFromName(path.basename(file));
    if (id == null) continue;
    const scene = ensure(id);
    const asset = await toAssetFile(
      file,
      await sourceProviderFor(file, imageProviderFromName(path.basename(file)))
    );
    scene.imageCandidates.push(asset);
    scene.image = asset.url;
    scene.imagePath = asset.path;
  }

  for (const file of clipFiles) {
    const id = sceneIdFromName(path.basename(file));
    if (id == null) continue;
    const scene = ensure(id);
    const rel = toRelative(file);
    const provider = providerFromName(path.basename(file), rel);
    const asset = await toAssetFile(file, provider);
    scene.clipCandidates.push(asset);
    if (provider === 'veo' && !scene.veoClip) scene.veoClip = asset.url;
    if (!scene.clip) scene.clip = asset.url;
  }

  for (const scene of byScene.values()) {
    const isCanonical = (asset: AssetFile) =>
      /^scene-(?:hook|\d+)\.(?:png|jpe?g|webp)$/i.test(asset.name);
    // Timestamped takes are the real candidates. Canonical scene-N.png is only a
    // CLI compatibility copy of the latest take — hide it when a versioned twin exists
    // so the Images UI does not show two identical stills per scene.
    const hasVersioned = scene.imageCandidates.some((asset) => !isCanonical(asset));
    if (hasVersioned) {
      scene.imageCandidates = scene.imageCandidates.filter((asset) => !isCanonical(asset));
    }
    scene.imageCandidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    scene.clipCandidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (scene.imageCandidates[0]) {
      scene.image = scene.imageCandidates[0].url;
      scene.imagePath = scene.imageCandidates[0].path;
    }
    if (scene.clipCandidates[0]) {
      scene.clip = scene.clipCandidates[0].url;
      if (scene.clipCandidates[0].provider === 'veo') {
        scene.veoClip = scene.clipCandidates[0].url;
      }
    }
  }

  const video = (
    await listFiles(path.join(root, 'video'), (name) => name.includes(episodeId) && name.endsWith('.mp4'))
  ).map(toPublic);
  const externalAbs = await listFiles(path.join(root, 'external', episodeId), (name) =>
    /\.(mp4|mov|webm|m4v)$/i.test(name)
  );
  const external = await Promise.all(
    externalAbs.map((file) => toAssetFile(file, 'external-upload'))
  );
  external.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const veoAbs = await listFiles(path.join(root, 'veo', episodeId), (name) => {
    if (!name.endsWith('.mp4')) return false;
    // Assembled episode short only — never scene-N clips.
    if (/^scene-\d+/i.test(name)) return false;
    return true;
  });
  const veoFiles = await Promise.all(veoAbs.map((file) => toAssetFile(file, 'veo-assembled')));
  const veo = veoFiles.map((f) => f.url);
  const srt = [
    ...(await listFiles(path.join(root, 'final'), (name) => name.includes(episodeId) && name.endsWith('.srt'))),
    ...(await listFiles(path.join(root, 'video'), (name) => name.includes(episodeId) && name.endsWith('.srt'))),
    ...(await walkFiles(path.join(root, 'veo', episodeId), (name) => name.endsWith('.srt')))
  ].map(toPublic);
  const final = (
    await listFiles(path.join(root, 'final'), (name) => name.includes(episodeId) && name.endsWith('.mp4'))
  ).map(toPublic);
  const production = await loadProduction(episodeId);

  const heritageDemos = await loadHeritageDemos(episodeId);

  return {
    audio: audioRanked,
    images: [...byScene.values()].sort((a, b) => a.sceneId - b.sceneId),
    ...(heritageDemos ? { heritageDemos } : {}),
    video,
    external,
    veo,
    srt,
    final,
    production
  };
}

export async function assetFlags(episodeId: string): Promise<{
  hasAudio: boolean;
  hasImages: boolean;
  hasVideo: boolean;
  hasVeo: boolean;
  hasFinal: boolean;
  productionStatus: string | null;
  productionStale: boolean;
  hasPublished: boolean;
}> {
  const assets = await collectAssets(episodeId);
  const currentFinal = assets.production?.finalVideo?.replace(/^\/api\/media\//, '');
  return {
    hasAudio: assets.audio.length > 0,
    hasImages: assets.images.some((scene) => Boolean(scene.image)),
    hasVideo: assets.video.length > 0 || assets.external.length > 0 || assets.final.length > 0,
    hasVeo:
      assets.veo.length > 0 ||
      assets.images.some(
        (scene) =>
          Boolean(scene.veoClip) || scene.clipCandidates.some((c) => c.provider === 'veo')
      ),
    hasFinal:
      assets.video.length > 0 ||
      assets.veo.length > 0 ||
      assets.final.length > 0 ||
      Boolean(assets.production?.finalVideo),
    productionStatus: assets.production?.reviewStatus || null,
    productionStale: Boolean(assets.production?.staleReason),
    hasPublished: Boolean(
      assets.production?.publish?.results.some(
        (item) =>
          (item.status === 'uploaded' || item.status === 'scheduled') &&
          !item.error &&
          (!item.videoPath ||
            Boolean(currentFinal && item.videoPath.replaceAll('\\', '/').endsWith(currentFinal)))
      )
    )
  };
}

/** Refuse content edits after a successful publish/schedule for the current final. */
export async function assertEpisodeNotPublished(
  episodeId: string,
  action = 'edit'
): Promise<void> {
  const flags = await assetFlags(episodeId);
  if (flags.hasPublished) {
    throw new Error(
      `Episode "${episodeId}" is published — ${action} is locked. Create a new draft for changes.`
    );
  }
}

export async function fileExists(absolute: string): Promise<boolean> {
  try {
    const info = await stat(absolute);
    return info.isFile();
  } catch {
    return false;
  }
}
