/** Isolated integration check. --preview keeps its fixture server open for browser verification. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mockEpisode } from '../src/providers/mock.js';
import { EpisodeSchema } from '../src/schema/episode.js';
const root = process.cwd();
const dir = await mkdtemp(path.join(tmpdir(), 'mythos-workflow-'));
const loader = path.join(root, 'node_modules/tsx/dist/loader.mjs');
const episode = EpisodeSchema.parse({ ...mockEpisode('Manual avatar workflow') as object, id: 'workflow-check' });
const port = '8790';
await mkdir(path.join(dir, 'data/episodes'), { recursive: true });
await writeFile(path.join(dir, 'data/episodes/check.json'), JSON.stringify(episode));
await symlink(path.join(root, 'ui'), path.join(dir, 'ui'));
const child = spawn(process.execPath, ['--import', loader, path.join(root, 'src/ui-server/server.ts')], {
  cwd: dir, env: { PATH: process.env.PATH, UI_PORT: port, PUBLISH_SCHEDULE_POLL_MS: '0', VIDEO_WIDTH: '160', VIDEO_HEIGHT: '284', VIDEO_FPS: '25' }, stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
child.stdout.on('data', (chunk) => { log += chunk.toString(); });
child.stderr.on('data', (chunk) => { log += chunk.toString(); });
const base = `http://127.0.0.1:${port}`;
const api = async (url: string, options?: RequestInit) => {
  const response = await fetch(base + url, options);
  const body = await response.json();
  assert.ok(response.ok, JSON.stringify(body)); return body;
};
try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(log || 'Server startup timeout')), 15000);
    child.stdout.on('data', () => { if (log.includes('review UI')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error(log)); });
  });
  const media = path.join(dir, 'source.mov');
  const voice = path.join(dir, 'voice.wav');
  const image = path.join(dir, 'art.png');
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  ff(['-f', 'lavfi', '-i', 'color=c=0x85513b:s=160x284:r=25:d=2', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', media]);
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', voice]);
  ff(['-f', 'lavfi', '-i', 'color=c=0x23647e:s=160x284', '-frames:v', '1', image]);
  const clips: Record<string, string> = {};
  for (const id of [0, 4, -1]) {
    const upload = await api('/api/episodes/check.json/media/clip', { method: 'POST', headers: { 'X-Episode-Id': episode.id, 'X-Scene-Id': String(id), 'X-Filename': 'presenter.mov' }, body: await readFile(media) });
    clips[id] = upload.path;
  }
  const uploadedVoice = await api('/api/episodes/check.json/media/audio', { method: 'POST', headers: { 'X-Episode-Id': episode.id, 'X-Filename': 'narration.wav' }, body: await readFile(voice) });
  const images: Record<string, string> = {};
  for (const scene of episode.scenes.filter((scene) => scene.id !== 4)) {
    const relative = `images/${episode.id}/scene-${scene.id}.png`;
    await mkdir(path.dirname(path.join(dir, 'output', relative)), { recursive: true });
    await writeFile(path.join(dir, 'output', relative), await readFile(image)); images[scene.id] = relative;
  }
  const sceneVisuals = Object.fromEntries([0, ...episode.scenes.map((scene) => scene.id), -1].map((id) => [id, {
    source: clips[id] ? 'upload' : 'image', ...([0, -1].includes(id) ? { durationSeconds: 2 } : {})
  }]));
  const review = { episodeId: episode.id, claimVerdicts: { 0: 'supported', 1: 'supported' },
    approvals: { script: true, tts: true, images: true }, selected: { clips, images, audio: uploadedVoice.path, sceneVisuals, burnSubtitles: true }, reviewerNotes: 'Temporary verification fixture' };
  await api('/api/episodes/check.json/review', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review) });
  const detail = await api('/api/episodes/check.json');
  assert.equal(detail.review.selected.sceneVisuals['-1'].source, 'upload');
  assert.equal(detail.assets.images.find((asset: { sceneId: number }) => asset.sceneId === -1).clipCandidates.length, 1);
  assert.equal(detail.visualTimeline.length, 10);
  const prompts = await api('/api/episodes/check.json/image-prompts');
  assert.deepEqual(prompts.items.map((item: { id: number }) => item.id), [1, 2, 3, 5, 6, 7, 8]);
  execFileSync(process.execPath, ['--import', loader, path.join(root, 'src/cli/produce.ts'), '--episode', 'data/episodes/check.json', '--audio', path.join(dir, 'output', uploadedVoice.path), '--reuse-ai'], {
    cwd: dir, env: { PATH: process.env.PATH, VIDEO_WIDTH: '160', VIDEO_HEIGHT: '284', VIDEO_FPS: '25' }, maxBuffer: 4_000_000
  });
  let report = JSON.parse(await readFile(path.join(dir, 'output/final/workflow-check.production.json'), 'utf8'));
  assert.equal(report.totals.costUsd, 0);
  assert.equal(report.scenes.find((scene: { sceneId: number }) => scene.sceneId === 4).provider, 'upload');
  review.selected.sceneVisuals[4] = { source: 'upload', durationSeconds: 2 };
  await api('/api/episodes/check.json/review', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review) });
  report = JSON.parse(await readFile(path.join(dir, 'output/final/workflow-check.production.json'), 'utf8'));
  assert.match(report.staleReason, /Visual plan/);
  const stale = await api('/api/episodes/check.json');
  assert.equal(stale.assets.srt.length, 1);
  console.log(`PASS: upload MOV at hook, STILL scene and ending; upload voice; save/reload plan; skip upload image prompts; render with subtitles; invalidate stale final. Fixture: ${dir}`);
  if (process.argv.includes('--preview')) {
    console.log(`Browser verification: ${base}`);
    await new Promise<void>((resolve) => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  }
} finally {
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => { if (child.exitCode !== null) resolve(); else child.once('exit', () => resolve()); });
  await rm(dir, { recursive: true, force: true });
}
