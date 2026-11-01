#!/usr/bin/env node
/**
 * Flatten shot-based dialogue masters into EpisodeSchema-ready JSON.
 *
 * Usage:
 *   node --import tsx scripts/convert-shot-dialogue-episode.ts \
 *     --in path/to/raw.json --out path/to/converted.json [--import] [--include-optional]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importEpisodeJson } from '../src/pipeline/importEpisode.js';

const args = process.argv.slice(2);
function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  return undefined;
}

type DialogueLine = { speaker: string; text: string };
type Shot = {
  shotId?: string;
  renderMode?: 'STILL' | 'AI_VIDEO';
  durationSeconds?: number;
  narrationBeat?: string;
  appearingLords?: string[];
  visualPrompt?: string;
  videoPrompt?: string | null;
  videoNegativePrompt?: string | null;
  clipsNeeded?: number;
};
type RawScene = {
  id?: number;
  name?: string;
  optional?: boolean;
  startSecond?: number;
  durationSeconds?: number;
  dialogueLines?: DialogueLine[];
  voiceDirection?: Record<string, unknown>;
  soundCue?: string;
  shots?: Shot[];
  visualPrompt?: string;
  narrationHi?: string;
  camera?: string;
  importance?: number;
  renderMode?: 'STILL' | 'AI_VIDEO';
  appearingLords?: string[];
  videoPrompt?: string;
  videoNegativePrompt?: string;
};

function inferCamera(visualPrompt: string): string {
  const text = visualPrompt.toLowerCase();
  if (text.includes('low-angle') || text.includes('low angle')) return 'low-angle medium';
  if (text.includes('wide')) return 'wide establishing';
  if (text.includes('close')) return 'slow push-in close-up';
  if (text.includes('portrait')) return 'medium close-up portrait';
  return 'slow push in';
}

function clampDuration(seconds: number): number {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return 6;
  // EpisodeSchema targetDurationSeconds is an int — keep whole-second scene windows.
  return Math.min(12, Math.max(1, Math.round(n)));
}

function stripNulls<T extends Record<string, unknown>>(row: T): T {
  for (const key of Object.keys(row)) {
    if (row[key] === null || row[key] === undefined) delete row[key];
  }
  return row;
}

async function main(): Promise<void> {
  const inPath = valueFor('--in');
  const outPath = valueFor('--out');
  if (!inPath || !outPath) {
    throw new Error(
      'Usage: node --import tsx scripts/convert-shot-dialogue-episode.ts --in raw.json --out converted.json [--import]'
    );
  }

  const raw = JSON.parse(await readFile(inPath, 'utf8')) as Record<string, unknown>;
  const rawScenes = (raw.scenes as RawScene[]) || [];
  if (!rawScenes.length) throw new Error('No scenes in input');

  const includeOptional = args.includes('--include-optional');
  const hookScene =
    rawScenes.find((scene) => scene.id === 0 || scene.name === 'hook') || rawScenes[0]!;
  const bodyScenes = rawScenes.filter(
    (scene) => scene !== hookScene && (includeOptional || scene.optional !== true)
  );

  const hookLines = hookScene.dialogueLines || [];
  const spokenHook = hookLines
    .map((line) => line.text.replace(/^\s*[AB]\s*:\s*/i, '').replace(/\[[^\]]+\]\s*/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const featuredLords = ((raw.featuredLords as Array<Record<string, unknown>>) || []).map(
    (lord) => ({
      ...lord,
      importance:
        lord.importance === 'prop' || lord.importance === 'PROP'
          ? 'minor'
          : lord.importance
    })
  );

  const flattened: Array<Record<string, unknown>> = [];
  for (const scene of bodyScenes) {
    const shots =
      Array.isArray(scene.shots) && scene.shots.length
        ? scene.shots
        : [
            {
              renderMode: scene.renderMode || 'STILL',
              durationSeconds: scene.durationSeconds || 8,
              narrationBeat: scene.narrationHi,
              appearingLords: scene.appearingLords,
              visualPrompt: scene.visualPrompt,
              videoPrompt: scene.videoPrompt,
              videoNegativePrompt: scene.videoNegativePrompt
            } satisfies Shot
          ];

    shots.forEach((shot, shotIndex) => {
      const visualPrompt = String(shot.visualPrompt || scene.visualPrompt || '').trim();
      if (!visualPrompt) {
        throw new Error(`Missing visualPrompt for scene ${scene.id} shot ${shot.shotId || shotIndex}`);
      }
      const isFirst = shotIndex === 0;
      const dialogueLines = isFirst ? scene.dialogueLines : undefined;
      const narrationHi = dialogueLines?.length
        ? undefined
        : String(shot.narrationBeat || scene.narrationHi || visualPrompt.slice(0, 120)).trim();

      const voiceDirection =
        isFirst && scene.voiceDirection
          ? {
              ...scene.voiceDirection,
              emotion: String(scene.voiceDirection.emotion || 'warm').slice(0, 40),
              delivery: String(
                scene.voiceDirection.delivery || 'natural Hindi conversational kathavachak'
              ).slice(0, 120)
            }
          : undefined;

      flattened.push(
        stripNulls({
          id: flattened.length + 1,
          startSecond: 0, // filled below
          durationSeconds: clampDuration(Number(shot.durationSeconds || scene.durationSeconds || 8)),
          ...(dialogueLines?.length ? { dialogueLines } : {}),
          narrationHi: narrationHi || '…',
          ...(voiceDirection ? { voiceDirection } : {}),
          visualPrompt,
          ...(shot.videoPrompt ? { videoPrompt: String(shot.videoPrompt) } : {}),
          ...(shot.videoNegativePrompt
            ? { videoNegativePrompt: String(shot.videoNegativePrompt) }
            : {}),
          camera: inferCamera(visualPrompt),
          importance:
            shot.renderMode === 'AI_VIDEO'
              ? 8
              : scene.name === 'gokarna' || scene.name === 'blessing'
                ? 9
                : 6,
          renderMode: shot.renderMode === 'AI_VIDEO' ? 'AI_VIDEO' : 'STILL',
          soundCue: scene.soundCue || 'cinematic ambience',
          appearingLords: (shot.appearingLords || scene.appearingLords || []).slice(0, 5)
        })
      );
    });
  }

  const hookDur = Math.min(10, clampDuration(Number(hookScene.durationSeconds || 8)));
  let cursor = hookDur;
  for (const scene of flattened) {
    scene.startSecond = Number(cursor.toFixed(1));
    cursor = Number((cursor + Number(scene.durationSeconds)).toFixed(1));
  }

  const teaseScene = bodyScenes.find((scene) => scene.name === 'tease');
  const blessingScene = bodyScenes.find((scene) => scene.name === 'blessing');
  const payoffHi =
    blessingScene?.dialogueLines
      ?.filter((line) => line.speaker.toUpperCase() === 'A')
      .map((line) => line.text.replace(/\[[^\]]+\]\s*/g, '').trim())
      .join(' ')
      .slice(0, 280) ||
    'हर हर महादेव।';
  const nextEpisodeTeaseHi =
    teaseScene?.dialogueLines
      ?.map((line) => line.text.replace(/\[[^\]]+\]\s*/g, '').trim())
      .join(' ')
      .slice(0, 200) || 'वो कथा अगली बार।';

  const scenes = flattened;

  const { scenes: _rawScenes, ...rest } = raw;
  void _rawScenes;

  // Keep main dialogue inputs only (optionalTeaseInputs stay for packaging tease, not TTS).
  const dialogueRequest = raw.elevenLabsDialogueRequest as
    | { note?: string; inputs?: DialogueLine[]; optionalTeaseInputs?: DialogueLine[] }
    | undefined;
  const elevenLabsDialogueRequest = dialogueRequest
    ? {
        ...(dialogueRequest.note ? { note: dialogueRequest.note } : {}),
        inputs: dialogueRequest.inputs || []
      }
    : undefined;

  const converted = {
    ...rest,
    format: raw.format || 'TWO_SPEAKER_DIALOGUE',
    hookHi: String(raw.hookHi || raw.titleHi || '').trim() || String(raw.titleHi),
    spokenHook,
    spokenHookStartSecond: 0,
    spokenHookDurationSeconds: hookDur,
    hookDelivery: 'curious',
    hookDialogueLines: hookLines,
    featuredLords,
    ...(elevenLabsDialogueRequest ? { elevenLabsDialogueRequest } : {}),
    visualStyle: raw.visualStyle || {
      brand: 'EPICASTRA_HERITAGE',
      frameVariant: 'HERITAGE_CLASSIC',
      look: 'CINEMATIC_DEVOTIONAL_3D',
      borderStrategy: 'POST_PROCESS',
      lockThinBorder: true
    },
    targetDurationSeconds: Math.round(Number(cursor.toFixed(1))),
    scenes,
    ending: {
      payoffHi,
      nextEpisodeTeaseHi,
      ...(includeOptional && teaseScene?.dialogueLines?.length
        ? { teaseDialogueLines: teaseScene.dialogueLines }
        : !includeOptional && dialogueRequest?.optionalTeaseInputs?.length
          ? { teaseDialogueLines: dialogueRequest.optionalTeaseInputs }
          : {})
    },
    metadata: {
      descriptionHi: String(
        raw.metadata && typeof raw.metadata === 'object'
          ? (raw.metadata as { descriptionHi?: string }).descriptionHi || ''
          : ''
      ).trim() ||
        `${String(raw.titleHi)} — ${String(raw.topic || '').slice(0, 120)}`,
      keywords: [
        'रावण',
        'आत्मलिंग',
        'गोकर्ण',
        'शिव',
        'गणेश',
        'विष्णु',
        'कैकसी',
        'mythology',
        'Gokarna',
        'Atmalinga'
      ],
      thumbnailTextHi: String(raw.titleHi).slice(0, 60)
    }
  };

  await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(converted, null, 2)}\n`, 'utf8');
  console.log(`Converted ${bodyScenes.length} story beats → ${scenes.length} scenes`);
  console.log(`Hook ${hookDur}s · total ${converted.targetDurationSeconds}s`);
  console.log(`Wrote ${outPath}`);

  if (args.includes('--import')) {
    const result = await importEpisodeJson(converted, { dryRun: false });
    console.log(`Imported: ${result.file} · id=${result.episode.id}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
