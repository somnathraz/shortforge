import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './paths.js';
import { isTechBrand, currentBrandId, getBrand, type BrandId } from '../lib/brands.js';
import type { JobKind } from './types.js';

export type JobResult = {
  ok: boolean;
  kind: JobKind;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

const MAX_OUTPUT = 80_000;

function trimOutput(value: string): string {
  if (value.length <= MAX_OUTPUT) return value;
  return `${value.slice(0, MAX_OUTPUT)}\n…(truncated)`;
}

function episodeArg(episodeFile: string, brandId: BrandId = currentBrandId()): string {
  return path.join(getBrand(brandId).episodesDir, episodeFile);
}

function buildNpmArgs(
  kind: JobKind,
  options: {
    topic?: string;
    episodeFile?: string;
    episodeId?: string;
    provider?: string;
    scene?: string;
    action?: string;
    platforms?: string;
    dryRun?: boolean;
    force?: boolean;
    reuseAi?: boolean;
    focus?: string;
    count?: string;
    imageProvider?: string;
    skipCovers?: boolean;
    videoPath?: string;
    language?: string;
    requirePackaging?: boolean;
    voiceId?: string;
    /** Listener / Voice B for TWO_SPEAKER_DIALOGUE. */
    voiceIdB?: string;
    motion?: string;
    ffmpegEffects?: 'off' | 'atmosphere' | 'water';
    /** Tech A/B: remotion | ffmpeg */
    techEngine?: string;
    audio?: string;
    /** Comma-separated scene ids for partial image regen, e.g. "1,2,3". */
    scenes?: string;
    /** User note describing what to fix when regenerating selected scenes. */
    feedback?: string;
    /** Comma-separated SFX ids for audio:sfx-el. */
    effects?: string;
    /** Opt-in ElevenLabs SFX during mix. */
    elevenlabsSfx?: boolean;
    /** User-selected BGM path for audio:mix. */
    bgm?: string;
    /** EpicAstra Heritage frame family override for images:demo. */
    frameVariant?: string;
    /** Comma-separated Meta formats: reel,story */
    metaFormats?: string;
    /** ISO schedule time for publish. */
    scheduleAt?: string;
  }
): string[] {
  switch (kind) {
    case 'topics': {
      const args = ['run', 'topics', '--'];
      if (options.provider) args.push('--provider', options.provider);
      if (options.count) args.push('--count', options.count);
      if (options.focus?.trim()) args.push('--focus', options.focus.trim());
      return args;
    }
    case 'story': {
      if (!options.topic?.trim()) throw new Error('story job requires topic');
      const args = ['run', 'story', '--'];
      if (options.provider) args.push('--provider', options.provider);
      const brandId = currentBrandId();
      args.push('--brand', brandId);
      if (isTechBrand(brandId)) args.push('--kind', 'tech');
      args.push(options.topic.trim());
      return args;
    }
    case 'tts:free': {
      if (!options.episodeFile) throw new Error('tts job requires episodeFile');
      return ['run', 'tts:free', '--', '--episode', episodeArg(options.episodeFile)];
    }
    case 'tts:elevenlabs': {
      if (!options.episodeFile) throw new Error('tts job requires episodeFile');
      const args = ['run', 'tts:elevenlabs', '--', '--episode', episodeArg(options.episodeFile)];
      if (options.voiceId?.trim()) {
        args.push('--voice', options.voiceId.trim());
        args.push('--voice-a', options.voiceId.trim());
      }
      if (options.voiceIdB?.trim()) args.push('--voice-b', options.voiceIdB.trim());
      return args;
    }
    case 'tts:sarvam': {
      if (!options.episodeFile) throw new Error('tts job requires episodeFile');
      const args = ['run', 'tts:sarvam', '--', '--episode', episodeArg(options.episodeFile)];
      if (options.voiceId?.trim()) {
        args.push('--voice', options.voiceId.trim());
        args.push('--voice-a', options.voiceId.trim());
      }
      if (options.voiceIdB?.trim()) args.push('--voice-b', options.voiceIdB.trim());
      return args;
    }
    case 'audio:plan': {
      if (!options.episodeFile) throw new Error('audio:plan requires episodeFile');
      const args = ['run', 'audio:plan', '--', '--episode', episodeArg(options.episodeFile)];
      if (options.provider) args.push('--provider', options.provider);
      return args;
    }
    case 'audio:mix': {
      if (!options.episodeFile) throw new Error('audio:mix requires episodeFile');
      const args = ['run', 'audio:mix', '--', '--episode', episodeArg(options.episodeFile)];
      if (options.audio?.trim()) {
        const audioArg = options.audio.trim().replace(/^output[/\\]/, '');
        args.push(
          '--audio',
          audioArg.startsWith('/') || /^[A-Za-z]:/.test(audioArg)
            ? audioArg
            : path.join('output', audioArg)
        );
      }
      if (options.provider) args.push('--provider', options.provider);
      if (options.elevenlabsSfx) args.push('--elevenlabs-sfx');
      if (options.bgm?.trim()) args.push('--bgm', options.bgm.trim());
      return args;
    }
    case 'audio:sfx-el': {
      if (!options.effects?.trim()) {
        throw new Error('audio:sfx-el requires effects (comma-separated SFX ids)');
      }
      return [
        'run',
        'audio:gen-sfx',
        '--',
        '--ids',
        options.effects.trim(),
        '--to-custom',
        '--force'
      ];
    }
    case 'images': {
      if (!options.episodeFile) throw new Error('images job requires episodeFile');
      const args = ['run', 'images', '--', '--episode', episodeArg(options.episodeFile)];
      if (options.provider) args.push('--provider', options.provider);
      if (options.scenes?.trim()) args.push('--scenes', options.scenes.trim());
      if (options.feedback?.trim()) args.push('--feedback', options.feedback.trim());
      return args;
    }
    case 'images:demo': {
      if (!options.episodeFile) throw new Error('images:demo requires episodeFile');
      if (isTechBrand(currentBrandId())) {
        throw new Error(
          'Heritage frame demo is for story pipelines only. Tech Reels use TECH_EDITORIAL (no heritage frame).'
        );
      }
      const args = ['run', 'images:demo', '--', '--episode', episodeArg(options.episodeFile)];
      // Always free Pollinations for heritage demos — never inherit Gemini/paid provider.
      args.push('--provider', 'pollinations');
      if (options.frameVariant?.trim()) args.push('--variant', options.frameVariant.trim());
      return args;
    }
    case 'render': {
      if (!options.episodeFile) throw new Error('render job requires episodeFile');
      const args = ['run', 'render', '--', '--episode', episodeArg(options.episodeFile)];
      if (options.motion) args.push('--motion', options.motion);
      if (options.ffmpegEffects) args.push('--ffmpeg-effects', options.ffmpegEffects);
      if (options.audio?.trim()) {
        const audioArg = options.audio.trim().replace(/^output[/\\]/, '');
        args.push('--audio', audioArg.startsWith('/') || /^[A-Za-z]:/.test(audioArg) ? audioArg : path.join('output', audioArg));
      }
      return args;
    }
    case 'animate': {
      if (!options.episodeFile) throw new Error('animate job requires episodeFile');
      const args = ['run', 'animate', '--', '--episode', episodeArg(options.episodeFile)];
      if (options.provider) args.push('--provider', options.provider);
      if (options.scene) args.push('--scene', options.scene);
      if (options.videoPath) args.push('--video', options.videoPath);
      return args;
    }
    case 'remotion': {
      if (!options.episodeFile) throw new Error('remotion job requires episodeFile');
      return [
        'run',
        'remotion:episode',
        '--',
        '--episode',
        episodeArg(options.episodeFile)
      ];
    }
    case 'remotion:chrome': {
      if (!options.videoPath?.trim()) throw new Error('remotion:chrome requires videoPath');
      const videoArg = options.videoPath.trim().replace(/^output[/\\]/, '');
      const videoPath =
        videoArg.startsWith('/') || /^[A-Za-z]:/.test(videoArg)
          ? videoArg
          : path.join('output', videoArg);
      const args = ['run', 'remotion:chrome', '--', '--video', videoPath];
      if (options.episodeId?.trim()) args.push('--episode', options.episodeId.trim());
      if (options.focus?.trim()) args.push('--title', options.focus.trim());
      return args;
    }
    case 'produce': {
      if (!options.episodeFile) throw new Error('produce job requires episodeFile');
      const args = ['run', 'produce', '--', '--episode', episodeArg(options.episodeFile)];
      if (options.provider) args.push('--provider', options.provider);
      if (options.motion) args.push('--motion', options.motion);
      if (options.ffmpegEffects) args.push('--ffmpeg-effects', options.ffmpegEffects);
      if (options.techEngine === 'remotion' || options.techEngine === 'ffmpeg') {
        args.push('--tech-engine', options.techEngine);
      }
      if (options.audio?.trim()) {
        const audioArg = options.audio.trim().replace(/^output[/\\]/, '');
        args.push('--audio', audioArg.startsWith('/') || /^[A-Za-z]:/.test(audioArg) ? audioArg : path.join('output', audioArg));
      }
      if (options.reuseAi) args.push('--reuse-ai');
      return args;
    }
    case 'mux:external': {
      if (!options.episodeFile) throw new Error('mux:external requires episodeFile');
      if (!options.videoPath?.trim()) throw new Error('mux:external requires videoPath');
      if (!options.audio?.trim()) throw new Error('mux:external requires audio (this episode only)');
      const audioArg = options.audio.trim().replace(/^output[/\\]/, '');
      const videoArg = options.videoPath.trim().replace(/^output[/\\]/, '');
      return [
        'run',
        'mux:external',
        '--',
        '--episode',
        episodeArg(options.episodeFile),
        '--video',
        videoArg.startsWith('/') || /^[A-Za-z]:/.test(videoArg) ? videoArg : path.join('output', videoArg),
        '--audio',
        audioArg.startsWith('/') || /^[A-Za-z]:/.test(audioArg) ? audioArg : path.join('output', audioArg)
      ];
    }
    case 'package': {
      if (!options.episodeFile && !options.episodeId) {
        throw new Error('package job requires episodeFile or episodeId');
      }
      const target = options.episodeId || episodeArg(options.episodeFile!);
      const args = ['run', 'package', '--', '--episode', target];
      if (options.provider) args.push('--copy-provider', options.provider);
      if (options.imageProvider) args.push('--image-provider', options.imageProvider);
      if (options.skipCovers) args.push('--skip-covers');
      if (options.language) args.push('--language', options.language);
      return args;
    }
    case 'review': {
      const episodeRef = options.episodeId || options.episodeFile;
      if (!episodeRef) throw new Error('review job requires episodeId');
      if (!options.action) throw new Error('review job requires action');
      const args = ['run', 'review', '--', '--episode', episodeRef, '--action', options.action];
      if (options.scene) args.push('--scene', options.scene);
      if (options.videoPath) args.push('--video', options.videoPath);
      return args;
    }
    case 'publish': {
      const episodeRef = options.episodeId || options.episodeFile;
      if (!episodeRef) throw new Error('publish job requires episodeId');
      const args = ['run', 'publish', '--', '--episode', episodeRef];
      if (options.platforms) args.push('--platforms', options.platforms);
      if (options.dryRun) args.push('--dry-run');
      if (options.force) args.push('--force');
      if (options.language) args.push('--language', options.language);
      if (options.requirePackaging) args.push('--require-packaging');
      if (options.videoPath) args.push('--video', options.videoPath);
      if (options.metaFormats?.trim()) args.push('--meta-formats', options.metaFormats.trim());
      if (options.scheduleAt?.trim()) args.push('--schedule', options.scheduleAt.trim());
      return args;
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported job: ${exhaustive}`);
    }
  }
}

/** Spawn existing npm scripts only — never imports pipeline modules. */
export function runJob(
  kind: JobKind,
  options: {
    topic?: string;
    episodeFile?: string;
    episodeId?: string;
    provider?: string;
    scene?: string;
    action?: string;
    platforms?: string;
    dryRun?: boolean;
    force?: boolean;
    reuseAi?: boolean;
    focus?: string;
    count?: string;
    imageProvider?: string;
    skipCovers?: boolean;
    videoPath?: string;
    language?: string;
    requirePackaging?: boolean;
    voiceId?: string;
    voiceIdB?: string;
    motion?: string;
    ffmpegEffects?: 'off' | 'atmosphere' | 'water';
    techEngine?: string;
    audio?: string;
    scenes?: string;
    feedback?: string;
    effects?: string;
    elevenlabsSfx?: boolean;
    bgm?: string;
    frameVariant?: string;
    metaFormats?: string;
    scheduleAt?: string;
  } = {}
): Promise<JobResult> {
  const npmArgs = buildNpmArgs(kind, options);
  const command = `npm ${npmArgs.join(' ')}`;

  return new Promise((resolve) => {
    const brandId = currentBrandId();
    const brand = getBrand(brandId);
    const child = spawn('npm', npmArgs, {
      cwd: ROOT,
      env: {
        ...process.env,
        ACTIVE_BRAND: brandId,
        EPISODES_DIR: brand.episodesDir
      },
      shell: false
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      resolve({
        ok: false,
        kind,
        command,
        exitCode: null,
        stdout: trimOutput(stdout),
        stderr: trimOutput(`${stderr}\n${error.message}`.trim())
      });
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        kind,
        command,
        exitCode: code,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr)
      });
    });
  });
}
