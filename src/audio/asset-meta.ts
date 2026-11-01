import { readFile, writeFile } from 'node:fs/promises';

export type AssetMeta = {
  id: string;
  file: string;
  category: string;
  source: string;
  sourceUrl?: string;
  downloadedAt: string;
  commercialUse: boolean;
  /** YouTube Content ID risk — prefer false for library beds. */
  contentId: boolean;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  normalized?: boolean;
  mixkitId?: string;
  mixkitTitle?: string;
  prompt?: string;
  note?: string;
};

export function metaPathFor(audioPath: string): string {
  return `${audioPath}.meta.json`;
}

export async function writeAssetMeta(audioPath: string, meta: AssetMeta): Promise<string> {
  const out = metaPathFor(audioPath);
  await writeFile(out, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return out;
}

export async function readAssetMeta(audioPath: string): Promise<AssetMeta | undefined> {
  try {
    return JSON.parse(await readFile(metaPathFor(audioPath), 'utf8')) as AssetMeta;
  } catch {
    return undefined;
  }
}
