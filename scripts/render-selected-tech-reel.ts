/** Render a linked storyboard using the voice already selected in Desk. Never calls TTS. */
import '../src/lib/loadEnv.js';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EpisodeSchema } from '../src/schema/episode.js';
import { TechReelSchema } from '../src/schema/techReel.js';
import { buildNarrationTimeline } from '../src/audio/narration-timeline.js';
import { probeAudioDuration } from '../src/audio/ffprobe.js';
import { loadReview, saveReview } from '../src/ui-server/episodes.js';
import { attachTechReelToEpisode } from '../src/ui-server/techReels.js';
import { runWithBrandAsync } from '../src/lib/brands.js';
import { resolveOutputPath } from '../src/lib/selectedAssets.js';

const run = (cmd: string, args: string[], cwd = process.cwd()) => new Promise<void>((resolve, reject) => {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
});
const episodePath = path.resolve(process.argv[2] || '');
const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')));
const episodeFile = path.basename(episodePath);
await runWithBrandAsync(episode.brandId || 'tech-instagram', async () => {
  const review = await loadReview(episodeFile);
  const audio = review?.selected.audio && resolveOutputPath(review.selected.audio);
  if (!audio || !review) throw new Error('Select the existing voice in Desk before rendering.');
  const reelPath = path.resolve('data/tech-reels', `${episode.id}.json`);
  const original = TechReelSchema.parse(JSON.parse(await readFile(reelPath, 'utf8')));
  const reel = structuredClone(original);
  const timeline = await buildNarrationTimeline(episode, audio);
  if (timeline.method !== 'narration-aligned') throw new Error('Cannot probe selected voice.');
  const duration = await probeAudioDuration(audio);
  // These scene boundaries use Desk’s word-weighted narration clock, not forced alignment.
  // No estimated word captions are presented as real speech timestamps.
  const boundaries = reel.beats.map(beat => {
    const slot = beat.templateProps?.narrationSlot as {kind: string; sceneId?: number; startFraction: number} | undefined;
    if (!slot) throw new Error(`Missing narrationSlot for ${beat.id}`);
    const scene = timeline.scenes.find(s => s.kind === slot.kind && (slot.kind !== 'scene' || s.id === slot.sceneId));
    if (!scene) throw new Error(`Missing narration segment for ${beat.id}`);
    return Math.round((scene.startSecond + scene.durationSeconds * slot.startFraction) * 30);
  });
  const frames = Math.ceil(duration * 30);
  for (let i = 0; i < reel.beats.length; i++) {
    const beat = reel.beats[i]!;
    const end = boundaries[i + 1] ?? frames;
    if (end <= boundaries[i]!) throw new Error('Narration boundaries must increase.');
    beat.durationSeconds = (end - boundaries[i]!) / 30;
  }
  const directory = path.resolve('output/tech-reels', reel.id);
  await mkdir(directory, { recursive: true });
  const propsPath = path.join(directory, 'render-props.json');
  await writeFile(propsPath, JSON.stringify({ reel, captions: [] }, null, 2));
  const visuals = path.join(directory, 'visuals.mp4');
  console.log(`Reusing selected voice: ${review.selected.audio} (${duration}s); rendering ${frames} frames.`);
  await run(process.execPath, [path.resolve('remotion/node_modules/@remotion/cli/remotion-cli.js'), 'render', 'src/index.ts', 'TechReel', visuals, '--props', propsPath, '--codec', 'h264', '--crf', '18', '--concurrency', '2', '--log', 'error'], path.resolve('remotion'));
  const output = path.join(directory, `${reel.id}.mp4`);
  const pending = path.join(directory, `${reel.id}.rendering.mp4`);
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', visuals, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-af', 'apad', '-t', String(frames / 30), '-movflags', '+faststart', pending]);
  await rename(pending, output);
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({storyboard:reelPath,storyboardHash:createHash('sha256').update(JSON.stringify(original)).digest('hex'),frames,fps:30,width:1080,height:1920,narration:'selected-existing-audio',audio:review.selected.audio,audioSha256:createHash('sha256').update(await readFile(audio)).digest('hex'),captionTiming:'none',sceneTiming:'word-weighted-narration',output},null,2));
  if (process.argv.includes('--no-attach')) return;
  const attached = await attachTechReelToEpisode(reel.id, episode.id);
  // Reload so a user's concurrent selections or notes are preserved.
  const current = await loadReview(episodeFile);
  if (!current || current.selected.audio !== review.selected.audio) throw new Error('Voice selection changed during render; final was rendered but not selected.');
  await saveReview({...current,selected:{...current.selected,final:attached.path}});
  console.log('Attached and selected final:', attached.path);
});
