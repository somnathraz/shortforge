import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assembleEpisodeFromClips } from '../src/providers/ffmpegRender.js';
import { mockEpisode } from '../src/providers/mock.js';
import { EpisodeSchema } from '../src/schema/episode.js';
import { createExperimentPlan, hash, type ExperimentPlan } from '../src/experiments/video/plan.js';
import { generationDuration, MODELS, modelNamed } from '../src/experiments/video/models.js';
import { FalVideoProvider, type VideoProvider } from '../src/experiments/video/fal.js';
import { runExperiment, compareExperiments } from '../src/experiments/video/runner.js';

const receipt = { request_id: 'abc', status_url: 'https://queue.fal.run/fal-ai/test/requests/abc/status',
  response_url: 'https://queue.fal.run/fal-ai/test/requests/abc' };
const episode = EpisodeSchema.parse(mockEpisode('Why Hanuman forgot his powers'));
async function fixture(fn: (root: string, plan: ExperimentPlan) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'video-experiment-'));
  try {
    const file = path.join(root, 'image.png'); await writeFile(file, 'test image');
    const plan = await createExperimentPlan({ episode, model: 'kling', images: Object.fromEntries(episode.scenes.map(s => [s.id, file])) });
    // Unit tests inject media validation; no API credentials or real media are needed.
    plan.audioPath = path.join(root, 'audio.wav'); await writeFile(plan.audioPath, 'continuous narration');
    plan.audioHash = hash(await readFile(plan.audioPath));
    await fn(root, plan);
  } finally { await rm(root, { recursive: true, force: true }); }
}
function fakeProvider() {
  const counts = { submit: 0, result: 0, download: 0 };
  const provider: VideoProvider = {
    async submit() { counts.submit++; return receipt; },
    async result() { counts.result++; return 'https://media.example/video.mp4'; },
    async download() { counts.download++; return Buffer.from('video'); }
  };
  return { provider, counts };
}
const media = { validate: async (file: string) => { assert.equal(await readFile(file, 'utf8'), 'video'); },
  assemble: async (input: { outputPath: string }) => { await writeFile(input.outputPath, 'final'); return input.outputPath; },
  probe: async () => 40 };

test('model profiles encode exact duration and audio fields; unsupported models reject', () => {
  assert.equal(generationDuration('kling', 5.1), 10);
  assert.equal(generationDuration('ltx', 6.1), 8);
  assert.equal(MODELS.kling.input('test', 5).duration, '5');
  assert.equal(MODELS.ltx.input('test', 8).duration, 8);
  assert.equal(MODELS.ltx.input('test', 8).generate_audio, false);
  assert.throws(() => generationDuration('kling', 11));
  assert.throws(() => modelNamed('toString'));
});

test('same edit and images compare across models; changed image invalidates identity', async () => fixture(async (root, kling) => {
  const images = Object.fromEntries(episode.scenes.map(s => [s.id, path.join(root, 'image.png')]));
  const before = JSON.stringify(episode);
  const ltx = await createExperimentPlan({ episode, model: 'ltx', images });
  assert.equal(kling.comparisonKey, ltx.comparisonKey);
  assert.notEqual(kling.runId, ltx.runId);
  assert.equal(JSON.stringify(episode), before);
  let cursor = 0;
  for (const shot of kling.shots) {
    assert.ok(Math.abs(shot.startSecond - cursor) < 1e-8);
    assert.ok(shot.generationSeconds >= shot.durationSeconds - 1e-8);
    cursor += shot.durationSeconds;
  }
  assert.ok(Math.abs(cursor - kling.durationSeconds) < 1e-8);
  await writeFile(path.join(root, 'image.png'), 'different image');
  const changed = await createExperimentPlan({ episode, model: 'kling', images });
  assert.notEqual(changed.runId, kling.runId);
}));

test('single-clip trial resumes without duplicate submissions and assembles offline', async () => fixture(async (root, plan) => {
  const { provider, counts } = fakeProvider();
  const partial = await runExperiment(plan, root, { mode: 'run', provider, limit: 1, ...media });
  assert.equal(partial.status, 'partial'); assert.equal(counts.submit, 1);
  const full = await runExperiment(plan, root, { mode: 'run', provider, ...media });
  assert.equal(full.status, 'complete'); assert.equal(counts.submit, plan.shots.length);
  await runExperiment(plan, root, { mode: 'assemble', ...media });
  assert.equal(counts.submit, plan.shots.length);
  assert.ok(!JSON.stringify(full).includes('base64'));
}));

test('lost submission response persists ambiguous state and never automatically resubmits', async () => fixture(async (root, plan) => {
  const { provider, counts } = fakeProvider();
  provider.submit = async () => { counts.submit++; throw new Error('network failure'); };
  await assert.rejects(runExperiment(plan, root, { mode: 'run', provider, ...media }), /network failure/);
  await assert.rejects(runExperiment(plan, root, { mode: 'run', provider, ...media }), /unknown acceptance/);
  assert.equal(counts.submit, 1);
  const report = JSON.parse(await readFile(path.join(root, 'report.json'), 'utf8'));
  assert.equal(report.status, 'failed'); assert.equal(report.shots[0].status, 'submitting');
}));

test('download failure resumes saved request; corrupt cache is downloaded again', async () => fixture(async (root, plan) => {
  const { provider, counts } = fakeProvider();
  const download = provider.download;
  provider.download = async () => { throw new Error('download failure'); };
  await assert.rejects(runExperiment(plan, root, { mode: 'run', provider, ...media }), /download failure/);
  assert.equal(counts.submit, 1);
  provider.download = download;
  await runExperiment(plan, root, { mode: 'run', provider, ...media });
  const submitted = counts.submit;
  await writeFile(path.join(root, 'shot-001.mp4'), 'corrupt');
  await runExperiment(plan, root, { mode: 'run', provider, ...media });
  assert.equal(counts.submit, submitted);
  assert.equal(counts.download, plan.shots.length + 1);
}));

test('assemble cannot generate; source changes fail before submission; run lock blocks concurrent work', async () => fixture(async (root, plan) => {
  const { provider, counts } = fakeProvider();
  await assert.rejects(runExperiment(plan, root, { mode: 'assemble', ...media }), /Missing valid clip/);
  assert.equal(counts.submit, 0);
  await writeFile(path.join(root, '.lock'), 'active');
  await assert.rejects(runExperiment(plan, root, { mode: 'run', provider, ...media }), /locked/);
  await rm(path.join(root, '.lock'));
  await writeFile(plan.shots[0]!.imagePath, 'edited');
  await assert.rejects(runExperiment(plan, root, { mode: 'run', provider, ...media }), /Image changed/);
  assert.equal(counts.submit, 0);
}));

test('comparison identifies mismatched source edits', async () => fixture(async (root, plan) => {
  const { provider } = fakeProvider();
  await runExperiment(plan, root, { mode: 'run', provider, ...media });
  const file = path.join(root, 'report.json');
  const changed = JSON.parse(await readFile(file, 'utf8')); changed.comparisonKey = 'other';
  const second = path.join(root, 'other.json'); await writeFile(second, JSON.stringify(changed));
  const result = await compareExperiments([file, second]);
  assert.ok(result.every(r => !r.comparable));
}));

test('fal authenticates queue only, accepts documented output and does not leak key to media', async () => {
  const calls: Array<{url: string; init?: RequestInit | undefined}> = [];
  const responses = [receipt, { status: 'IN_PROGRESS' }, { status: 'COMPLETED' }, { video: { url: 'https://media.example/v.mp4' } }];
  const fetcher = (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(calls.length < 5 ? JSON.stringify(responses.shift()) : 'video', { status: 200 });
  }) as typeof fetch;
  const provider = new FalVideoProvider('test-secret', fetcher, async () => {});
  const saved = await provider.submit(MODELS.kling.endpoint, { prompt: 'test' });
  const url = await provider.result(saved);
  assert.equal((await provider.download(url)).toString(), 'video');
  assert.equal(new Headers(calls[0]!.init?.headers).get('Authorization'), 'Key test-secret');
  assert.equal(new Headers(calls.at(-1)!.init?.headers).get('Authorization'), null);
  await assert.rejects(provider.result({ ...receipt, status_url: 'https://other.example/status' }));
  assert.equal(calls.length, 5);
});

test('fal retries transient GET only; failed result and timeout remain recoverable', async () => {
  let reads = 0;
  const fetcher = (async () => {
    reads++;
    if (reads === 1) return new Response('', { status: 503 });
    return new Response(JSON.stringify({ status: 'COMPLETED', error: 'provider failure' }));
  }) as typeof fetch;
  const provider = new FalVideoProvider('key', fetcher, async () => {});
  await assert.rejects(provider.result(receipt), /generation failed/);
  assert.equal(reads, 2);
  reads = 0;
  await assert.rejects(provider.submit(MODELS.kling.endpoint, { prompt: 'test' }), /HTTP 503/);
  assert.equal(reads, 1);
  const waiting = new FalVideoProvider('key', (async () => new Response(JSON.stringify({ status: 'IN_QUEUE' }))) as typeof fetch,
    async () => { await new Promise(r => setTimeout(r, 5)); }, 1);
  await assert.rejects(waiting.result(receipt), /timed out/);
});


test('real FFmpeg experiment assembles generated clips with full audio and captions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fal-render-test-'));
  const exec = promisify(execFile);
  try {
    const imagePath = path.join(root, 'source.png');
    const audioPath = path.join(root, 'audio.wav');
    const clip = path.join(root, 'fixture.mp4');
    await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=90x160:r=30', '-t', '1', '-c:v', 'libx264', clip]);
    await exec('ffmpeg', ['-v', 'error', '-y', '-i', clip, '-frames:v', '1', imagePath]);
    await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', audioPath]);
    const plan = await createExperimentPlan({ episode, model: 'ltx', audioPath,
      images: Object.fromEntries(episode.scenes.map(s => [s.id, imagePath])) });
    const { provider, counts } = fakeProvider();
    provider.download = async () => readFile(clip);
    const result = await runExperiment(plan, path.join(root, 'run'), { mode: 'run', provider, burnSubtitles: false,
      assemble: input => assembleEpisodeFromClips({ ...input, width: 90, height: 160 }) });
    assert.equal(result.status, 'complete');
    assert.ok(Math.abs(result.finalDuration! - 2) < 0.1);
    assert.equal(counts.submit, plan.shots.length);
    assert.match(await readFile(result.finalPath!.replace('.mp4', '.srt'), 'utf8'), /-->/);
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', result.finalPath!]);
    const streams = JSON.parse(stdout).streams;
    assert.ok(streams.some((s: { codec_type: string }) => s.codec_type === 'audio'));
    assert.ok(streams.some((s: { width: number; height: number }) => s.width === 90 && s.height === 160));
  } finally { await rm(root, { recursive: true, force: true }); }
});
