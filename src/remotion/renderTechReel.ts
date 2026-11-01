import { mkdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EdgeTTS } from 'node-edge-tts';
import { TechReelSchema, TechReelAuthoringSchema } from '../schema/techReel.js';
import { probeAudioDuration } from '../audio/ffprobe.js';
import { beatFrames, reelFrames, motionEvents, REEL_FPS, type CaptionWord, type TechReelProps } from './techReelModel.js';
import { alignedElevenSpeech } from './techReelSpeech.js';
import { resolveTechVoiceProfile, techElevenLabsVoiceId } from '../lib/techVoiceProfile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function run(command: string, args: string[], cwd = ROOT): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
async function exists(file: string) { try { await access(file); return true; } catch { return false; } }

/** Frame-quantize audio windows so caption, diagram, and audio clocks cannot drift. */
export function audioWindow(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid audio duration');
  return Math.ceil((duration + 0.18) * REEL_FPS) / REEL_FPS;
}

/** Original, quiet transition tones; no downloaded music or reference audio. */
function soundBed(frames: number[], sampleRate = 24000): Buffer {
  const length = Math.round(frames.reduce((a, b) => a + b, 0) / REEL_FPS * sampleRate);
  const pcm = Buffer.alloc(length * 2);
  let cursor = 0;
  const starts = frames.map(f => { const start = cursor; cursor += f / REEL_FPS; return start; });
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let value = 0;
    for (const start of starts) {
      const u = t - start;
      if (u >= 0 && u < 0.24) value += Math.sin(2 * Math.PI * (620 * u - 550 * u * u)) * Math.exp(-u * 25) * 0.025;
    }
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function renderTechReel(input: { storyboardPath: string; silent?: boolean; prepareOnly?: boolean; scale?: number; tts?: 'edge' | 'elevenlabs'; legacyTemplate?: boolean }): Promise<string> {
  const reel = (input.legacyTemplate ? TechReelSchema : TechReelAuthoringSchema).parse(JSON.parse(await readFile(input.storyboardPath, 'utf8')));
  const storyboardHash = createHash('sha256').update(JSON.stringify(reel)).digest('hex');
  const scale = input.scale ?? 1;
  if (![0.5, 2 / 3, 1].includes(scale)) throw new Error('Scale must be 0.5, 0.6666666666666666, or 1');
  const directory = path.join(ROOT, 'output', 'tech-reels', reel.id);
  await mkdir(directory, { recursive: true });
  const captions: CaptionWord[] = [];
  const provider = input.tts || 'elevenlabs';
  // Locked profile — reel.voice is a profile id, never an arbitrary ElevenLabs voice.
  const voiceProfile = resolveTechVoiceProfile(reel.voice);
  const voice =
    provider === 'elevenlabs' ? techElevenLabsVoiceId(voiceProfile) : voiceProfile.edge.voice;
  const speechLang = provider === 'elevenlabs' ? voiceProfile.elevenLabs.languageCode : voiceProfile.edge.lang;
  const speechClips: string[] = [];
  let cursor = 0;
  for (const beat of reel.beats) {
    if (!input.silent) {
      const hash = createHash('sha256')
        .update(
          JSON.stringify([
            beat.narration,
            provider,
            voiceProfile.id,
            voice,
            speechLang,
            provider === 'edge' ? '+3%' : voiceProfile.speechCacheTag
          ])
        )
        .digest('hex')
        .slice(0, 16);
      const audio = path.join(directory, `${beat.id}-${hash}.mp3`);
      if (!(await exists(audio)) || !(await exists(`${audio}.json`))) {
        console.log(`Narration: ${reel.id} / ${beat.id} · ${voiceProfile.id}`);
        if (provider === 'elevenlabs') {
          await alignedElevenSpeech(beat.narration, audio, voiceProfile);
        } else {
          const tts = new EdgeTTS({
            voice: voiceProfile.edge.voice,
            lang: voiceProfile.edge.lang,
            rate: '+3%',
            saveSubtitles: true,
            outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
            timeout: 25000
          });
          await tts.ttsPromise(beat.narration, audio);
        }
      }
      beat.durationSeconds = audioWindow(await probeAudioDuration(audio));
      const words = JSON.parse(await readFile(`${audio}.json`, 'utf8')) as Array<{ part: string; start: number; end: number }>;
      if (!words.length || words.some(w => !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end <= w.start)) throw new Error(`Missing or invalid word timing for ${beat.id}`);
      for (const word of words) captions.push({ text: word.part.trim(), start: cursor + word.start / 1000, end: cursor + word.end / 1000 });
      const padded = path.join(directory, `${beat.id}-padded.wav`);
      await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', audio, '-af', `apad,atrim=duration=${beat.durationSeconds}`, '-ar', '24000', '-ac', '1', padded]);
      speechClips.push(padded);
    }
    cursor += Math.round(beat.durationSeconds * REEL_FPS) / REEL_FPS;
  }
  const props: TechReelProps = { reel, captions };
  // Fail before rendering if the spoken words cannot anchor the requested animation.
  const timing = reel.beats.map((beat, index) => ({ beat: beat.id, cues: motionEvents(reel, captions, index).filter(event => event.onPhrase).map(event => ({ phrase: event.onPhrase, localSecond: event.frame / REEL_FPS, transitionSeconds: event.duration / REEL_FPS })) }));
  await writeFile(path.join(directory, 'cue-timings.json'), JSON.stringify(timing, null, 2));
  const propsPath = path.join(directory, 'render-props.json');
  await writeFile(propsPath, JSON.stringify(props, null, 2));
  const speech = path.join(directory, 'narration.wav');
  if (!input.silent) {
    // The concat filter avoids shell quoting and concat-file path escaping.
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...speechClips.flatMap(p => ['-i', p]), '-filter_complex', `${speechClips.map((_, i) => `[${i}:a]`).join('')}concat=n=${speechClips.length}:v=0:a=1[a]`, '-map', '[a]', speech]);
    await writeFile(path.join(directory, 'transitions.wav'), soundBed(beatFrames(reel)));
  }
  if (input.prepareOnly) return propsPath;
  const templated = reel.beats.every((beat) => Boolean(beat.template));
  console.log(
    `Rendering ${reelFrames(reel)} frames (${(reelFrames(reel) / REEL_FPS).toFixed(1)} seconds) via ${
      templated ? `scene templates (${[...new Set(reel.beats.map((b) => b.template))].join(', ')})` : `${reel.style} style`
    }…`
  );
  const silentVideo = path.join(directory, 'visuals.mp4');
  await run(process.execPath, [path.join(ROOT, 'remotion/node_modules/@remotion/cli/remotion-cli.js'), 'render', 'src/index.ts', 'TechReel', silentVideo, '--props', propsPath, '--codec', 'h264', '--crf', '18', '--concurrency', '2', '--scale', String(scale), '--log', 'error'], path.join(ROOT, 'remotion'));
  if (input.silent) return silentVideo;
  const output = path.join(directory, `${reel.id}.mp4`);
  const pendingOutput = path.join(directory, `${reel.id}.rendering.mp4`);
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', silentVideo, '-i', speech, '-i', path.join(directory, 'transitions.wav'), '-filter_complex', '[1:a]loudnorm=I=-16:TP=-1.5:LRA=9[voice];[voice][2:a]amix=inputs=2:duration=first:normalize=0[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(reelFrames(reel) / REEL_FPS), '-movflags', '+faststart', pendingOutput]);
  await rename(pendingOutput, output);
  await writeFile(
    path.join(directory, 'manifest.json'),
    JSON.stringify(
      {
        storyboard: path.resolve(input.storyboardPath),
        storyboardHash,
        frames: reelFrames(reel),
        fps: REEL_FPS,
        width: Math.round(1080 * scale),
        height: Math.round(1920 * scale),
        narration: provider,
        voiceProfile: voiceProfile.id,
        voice,
        language: speechLang,
        captionTiming: 'provider-word-boundaries',
        output
      },
      null,
      2
    )
  );
  return output;
}
