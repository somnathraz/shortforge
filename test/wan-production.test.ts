import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { EpisodeSchema } from '../src/schema/episode.js';
import { buildNarrationTimeline } from '../src/audio/narration-timeline.js';
import { directShots } from '../src/lib/shotDirector.js';
import { patchWorkflow } from '../src/providers/wan-comfy.js';
import { assembleEpisodeFromClips } from '../src/providers/ffmpegRender.js';
import { validateWanClip } from '../src/pipeline/produceWan.js';
// Local-only fixture (data/episodes is gitignored): these tests skip on a fresh clone.
const SAMPLE_EPISODE = 'data/episodes/1790169775562-why-lord-vamana-asked-king-bali-for-only-three-steps-of-land.json';
const episode = await readFile(SAMPLE_EPISODE, 'utf8')
  .then((raw) => EpisodeSchema.parse(JSON.parse(raw)))
  .catch(() => undefined);
const needsEpisode = { skip: episode ? false : `missing ${SAMPLE_EPISODE}` };

test('latest episode coverage includes hook and ending without altering the story', needsEpisode, async () => {
  if (!episode) return;
  const before = JSON.stringify(episode);
  const timeline = await buildNarrationTimeline(episode);
  const plan = directShots(episode, timeline);
  assert.equal(JSON.stringify(episode), before);
  assert.ok(plan.shots.length >= 16 && plan.shots.length <= 24);
  let end = 0;
  for (const shot of plan.shots) {
    assert.ok(Math.abs(shot.startSecond - end) < 1e-8);
    assert.ok(shot.durationSeconds > 0);
    end += shot.durationSeconds;
  }
  assert.ok(Math.abs(end - timeline.narrationDurationSeconds) < 1e-8);
  assert.equal(plan.shots[0]!.kind, 'spokenHook');
  assert.equal(plan.shots.at(-1)!.kind, 'ending');
});

test('Wan patches I2V latent rather than model loader and preserves batch size', () => {
  const graph = {
    '1': { class_type: 'UNETLoader', _meta: { title: 'Wan model' }, inputs: {} },
    '2': { class_type: 'LoadImage', inputs: { image: '' } },
    '3': { class_type: 'WanImageToVideo', inputs: { width: 1, height: 1, length: 1, batch_size: 1 } },
    '4': { class_type: 'CLIPTextEncode', _meta: { title: 'Positive' }, inputs: { text: '' } },
    '5': { class_type: 'CreateVideo', inputs: { fps: 30 } }
  };
  patchWorkflow(graph, { imageName: 'frame.png', prompt: 'motion', negativePrompt: 'flicker', width: 480, height: 832, frames: 49, seed: 1 });
  assert.equal(graph['3'].inputs.length, 49);
  assert.equal(graph['3'].inputs.batch_size, 1);
  assert.equal(graph['5'].inputs.fps, 16);
});

test('EpicAstra Wan2.2 API export patches exact node IDs and keeps derived length', async () => {
  const raw = JSON.parse(await readFile('workflows/wan/wan22-i2v-a14b-api.json', 'utf8')) as Record<string, { inputs: Record<string, unknown> }>;
  assert.ok(raw['97'], 'expected real API export (not placeholder)');
  const beforeLength = raw['129:98']!.inputs.length;
  patchWorkflow(raw, {
    imageName: 'scene-4.png',
    prompt: 'thread flies into fire',
    negativePrompt: 'extra fingers',
    width: 704,
    height: 1280,
    durationSeconds: 6,
    fps: 16,
    seed: 42,
    filenamePrefix: 'epicastra/test/scene-4'
  });
  assert.equal(raw['97']!.inputs.image, 'scene-4.png');
  assert.equal(raw['129:93']!.inputs.text, 'thread flies into fire');
  assert.equal(raw['129:89']!.inputs.text, 'extra fingers');
  assert.equal(raw['129:98']!.inputs.width, 704);
  assert.equal(raw['129:98']!.inputs.height, 1280);
  assert.deepEqual(raw['129:98']!.inputs.length, beforeLength);
  assert.equal(raw['129:86']!.inputs.noise_seed, 42);
  assert.equal(raw['129:161']!.inputs.value, 6);
  assert.equal(raw['129:162']!.inputs.value, 16);
  assert.equal(raw['108']!.inputs.filename_prefix, 'epicastra/test/scene-4');
  assert.equal(raw['129:131']!.inputs.value, false);
});

test('LightX2V fast mode enables 4-step LoRA boolean', async () => {
  const raw = JSON.parse(await readFile('workflows/wan/wan22-i2v-a14b-api.json', 'utf8')) as Record<
    string,
    { inputs: Record<string, unknown> }
  >;
  patchWorkflow(raw, {
    imageName: 'scene-1.png',
    prompt: 'motion',
    negativePrompt: 'flicker',
    width: 704,
    height: 1280,
    durationSeconds: 5,
    fps: 16,
    seed: 1,
    qualityMode: 'fast'
  });
  assert.equal(raw['129:131']!.inputs.value, true);
});

test('multi-shot assembly preserves complete continuous audio and writes captions', needsEpisode, async () => {
  if (!episode) return;
  const dir = await mkdtemp(path.join(tmpdir(), 'wan-test-'));
  const exec = promisify(execFile);
  try {
    const clip = path.join(dir, 'clip.mp4'), audio = path.join(dir, 'voice.wav'), final = path.join(dir, 'final.mp4');
    await exec('ffmpeg', ['-v','error','-y','-f','lavfi','-i','color=c=blue:s=90x160:r=16','-t','1','-c:v','libx264',clip]);
    await exec('ffmpeg', ['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','pcm_s16le',audio]);
    await validateWanClip(clip, 1);
    await assert.rejects(validateWanClip(clip, 3));
    await assembleEpisodeFromClips({ episode, audioPath: audio, outputPath: final,
      productionShots: [0,1].map(() => ({ clipPath: clip, durationSeconds: 1, camera: 'locked' })),
      width: 90, height: 160, fps: 16, burnSubtitles: false });
    const { stdout } = await exec('ffprobe', ['-v','error','-show_entries','stream=codec_type:format=duration','-of','json',final]);
    const data = JSON.parse(stdout);
    assert.ok(Math.abs(Number(data.format.duration) - 2) < 0.1);
    assert.ok(data.streams.some((s: {codec_type: string}) => s.codec_type === 'audio'));
    assert.match(await readFile(final.replace('.mp4','.srt'),'utf8'), /-->/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
