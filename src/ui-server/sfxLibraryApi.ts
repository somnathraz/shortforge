import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { convertToWav } from '../audio/normalize-audio.js';
import { writeAssetMeta } from '../audio/asset-meta.js';
import { probeAudio } from '../audio/ffprobe.js';
import {
  SFX_EFFECT_IDS,
  customSfxDir,
  customSfxPath,
  type SfxEffectId
} from '../audio/sfx-library.js';
import { listMissingSfxEffects } from '../audio/sfx-mixer.js';

export type SfxCueAvailability = {
  effect: SfxEffectId;
  present: boolean;
  customPath: string;
};

export async function sfxAvailabilityForEffects(
  effects: readonly string[],
  cwd = process.cwd()
): Promise<{
  effects: SfxCueAvailability[];
  missing: SfxEffectId[];
}> {
  const allowed = new Set<string>(SFX_EFFECT_IDS);
  const unique: SfxEffectId[] = [];
  const seen = new Set<string>();
  for (const raw of effects) {
    const id = String(raw || '').trim();
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push(id as SfxEffectId);
  }
  const missing = await listMissingSfxEffects(unique, cwd);
  const missingSet = new Set(missing);
  return {
    effects: unique.map((effect) => ({
      effect,
      present: !missingSet.has(effect),
      customPath: `assets/audio/sfx/custom/${effect}.wav`
    })),
    missing
  };
}

/**
 * Save an uploaded audio file as custom/{effect}.wav (library override).
 * Optional — mix skips missing cues without this.
 */
export async function uploadCustomSfx(options: {
  effect: string;
  body: Buffer;
  originalName?: string;
  cwd?: string;
}): Promise<{ effect: SfxEffectId; path: string; durationSeconds: number }> {
  const cwd = options.cwd || process.cwd();
  const effect = options.effect.trim();
  if (!(SFX_EFFECT_IDS as readonly string[]).includes(effect)) {
    throw new Error(
      `Unknown SFX id "${effect}". Use one of: ${SFX_EFFECT_IDS.join(', ')}`
    );
  }
  const effectId = effect as SfxEffectId;
  if (!options.body.length) throw new Error('Empty SFX upload');

  const dir = customSfxDir(cwd);
  await mkdir(dir, { recursive: true });
  const dest = customSfxPath(effectId, cwd);
  const ext = path.extname(options.originalName || '').toLowerCase() || '.wav';
  const tmp = path.join(tmpdir(), `sfx-upload-${randomUUID()}${ext}`);
  try {
    await writeFile(tmp, options.body);
    await convertToWav(tmp, dest, { maxSeconds: 12 });
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }

  const probe = await probeAudio(dest);
  await writeAssetMeta(dest, {
    id: effectId,
    file: `custom/${effectId}.wav`,
    category: 'custom',
    source: 'upload',
    sourceUrl: options.originalName || 'desk-upload',
    downloadedAt: new Date().toISOString().slice(0, 10),
    commercialUse: true,
    contentId: false,
    durationSeconds: Number(probe.durationSeconds.toFixed(3)),
    note: 'Optional Desk upload — overrides library when present'
  });

  return {
    effect: effectId,
    path: path.relative(cwd, dest).split(path.sep).join('/'),
    durationSeconds: probe.durationSeconds
  };
}
