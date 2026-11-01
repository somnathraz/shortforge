import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { fitVisualTimings, requiredImageIds } from '../src/lib/sceneVisualPlan.js';
import { SceneVisualsSchema } from '../src/schema/sceneVisuals.js';
import { mockEpisode } from '../src/providers/mock.js';
import { EpisodeSchema } from '../src/schema/episode.js';
import { assembleEpisodeFromClips, type VisualInput } from '../src/providers/ffmpegRender.js';

test('10 second opening and ending reserve time; middle fills narration without changing order', () => {
  const rows = [{ id: 0, startSecond: 0, durationSeconds: 5 }, { id: 1, startSecond: 5, durationSeconds: 40 }, { id: -1, startSecond: 45, durationSeconds: 5 }];
  const plan = { 0: { source: 'upload' as const, durationSeconds: 10 }, '-1': { source: 'upload' as const, durationSeconds: 10 } };
  assert.deepEqual(fitVisualTimings(rows, plan).map((slot) => [slot.id, slot.startSecond, slot.durationSeconds]), [[0, 0, 10], [1, 10, 30], [-1, 40, 10]]);
  assert.throws(() => fitVisualTimings(rows, { 0: { source: 'upload', durationSeconds: 50 } }), /must fit/);
  assert.deepEqual(SceneVisualsSchema.parse(plan), plan);
  assert.equal(SceneVisualsSchema.safeParse({ 1: { source: 'upload', trimStartSeconds: -1 } }).success, false);
});

test('image generation skips uploads and locked AI clips; ending reuses an image scene only', () => {
  const scenes = [{ id: 1, renderMode: 'STILL' }, { id: 2, renderMode: 'AI_VIDEO' }];
  // All sections video → no stills to generate (ending must also be video, or produce will ask for artwork).
  assert.deepEqual(requiredImageIds(scenes, true, true, { 0: { source: 'upload' }, 1: { source: 'upload' }, 2: { source: 'upload' } }), []);
  assert.deepEqual(requiredImageIds(scenes, true, true, { 0: { source: 'upload' }, 1: { source: 'upload' }, 2: { source: 'upload' }, '-1': { source: 'upload' } }), []);
  // Middle image scene still generated; upload scenes never forced just for ending.
  assert.deepEqual(requiredImageIds(scenes, true, true, { 0: { source: 'upload' }, 1: { source: 'image' }, 2: { source: 'upload' } }), [1]);
  // AI with a selected clip skips image gen; AI without clip still needs a still.
  assert.deepEqual(requiredImageIds(scenes, false, false, { 2: { source: 'ai' } }, { '2': 'video/clips/scene-2.mp4' }), [1]);
  assert.deepEqual(requiredImageIds(scenes, false, false, { 2: { source: 'ai' } }), [1, 2]);
});

const full = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg';
const ffmpeg = process.env.FFMPEG_BIN || (existsSync(full) ? full : 'ffmpeg');
const command = (args: string[]) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 10_000_000 });
let available = true;
try { command(['-version']); } catch { available = false; }

test('real hybrid render uses upload / still / ending in order, one narration track and burned captions', { skip: !available }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mythos-visual-test-'));
  try {
    const episode = EpisodeSchema.parse(mockEpisode('hybrid test'));
    const video = path.join(dir, 'avatar.mp4');
    const audio = path.join(dir, 'voice.wav');
    const still = path.join(dir, 'scene.png');
    command(['-f', 'lavfi', '-i', 'color=c=red:s=160x284:r=25:d=1', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video]);
    command(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', audio]);
    command(['-f', 'lavfi', '-i', 'color=c=blue:s=160x284', '-frames:v', '1', still]);
    const sources: Record<number, VisualInput> = Object.fromEntries(episode.scenes.map((scene) => [scene.id, { imagePath: still }]));
    sources[0] = { clipPath: video, trimStartSeconds: 0.2, shortClip: 'freeze' };
    sources[-1] = { clipPath: video, shortClip: 'loop' };
    sources[4] = { clipPath: video }; // Even a script STILL scene accepts an uploaded clip.
    const output = path.join(dir, 'final.mp4');
    const input = { episode, audioPath: audio, outputPath: output, visualSources: sources,
      sceneVisuals: { 0: { source: 'upload' as const, durationSeconds: 1.5 }, '-1': { source: 'upload' as const, durationSeconds: 1.5 } },
      width: 160, height: 284, fps: 25, burnSubtitles: false };
    await assembleEpisodeFromClips(input);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], { encoding: 'utf8' }));
    assert.equal(probe.streams.filter((stream: { codec_type: string }) => stream.codec_type === 'audio').length, 1);
    assert.ok(Math.abs(Number(probe.format.duration) - 6) < 0.1, 'matches actual MP3/WAV, not longer planned script');
    const pixel = (second: string) => command(['-ss', second, '-i', output, '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
    assert.ok(pixel('0.5')[0]! > 150, 'opening is uploaded red video');
    assert.ok(pixel('1.7')[2]! > 150, 'middle is blue artwork');
    assert.ok(pixel('5.5')[0]! > 150, 'ending is uploaded red video');
    const pcm = command(['-i', output, '-vn', '-ar', '8000', '-ac', '1', '-f', 'f32le', 'pipe:1']);
    const energy = (frequency: number) => {
      let sin = 0; let cos = 0;
      for (let i = 0; i < 4000; i++) { const sample = pcm.readFloatLE(i * 4); sin += sample * Math.sin(2 * Math.PI * frequency * i / 8000); cos += sample * Math.cos(2 * Math.PI * frequency * i / 8000); }
      return sin * sin + cos * cos;
    };
    assert.ok(energy(440) > energy(880) * 100, 'master voice is used; source clip speech is muted');
    const srt = await readFile(output.replace('.mp4', '.srt'), 'utf8');
    assert.ok(srt.includes(episode.ending.payoffHi));
    assert.ok(srt.includes('00:00:06,000'));
    const filters = execFileSync(ffmpeg, ['-hide_banner', '-filters'], { encoding: 'utf8' });
    if (filters.includes(' subtitles ')) {
      await assembleEpisodeFromClips({ ...input, outputPath: path.join(dir, 'captioned.mp4'), burnSubtitles: true });
      const frame = (file: string) => command(['-ss', '0.5', '-i', file, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
      assert.notDeepEqual(frame(output), frame(path.join(dir, 'captioned.mp4')), 'captions alter rendered pixels');
    } else {
      await assert.rejects(assembleEpisodeFromClips({ ...input, burnSubtitles: true }), /Could not burn subtitles/);
    }
    await assert.rejects(assembleEpisodeFromClips({ ...input, visualSources: { ...sources, 0: { clipPath: video, trimStartSeconds: 2 } } }), /trim starts after/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
