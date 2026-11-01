import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-1500) || `${command} exited ${code}`));
    });
  });
}

export type NormalizeOptions = {
  /** Target peak (linear). Default 0.95 */
  peak?: number;
  sampleRate?: number;
  channels?: number;
  /** Max length in seconds (trim + fade). */
  maxSeconds?: number;
};

/**
 * Convert any audio to stereo WAV @ 44.1kHz with peak normalize (no heavy loudnorm).
 * Suitable for SFX library ingest; BGM can skip peak boost via peak=1.
 */
export async function normalizeToWav(
  inputPath: string,
  outputPath: string,
  options: NormalizeOptions = {}
): Promise<string> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const peak = options.peak ?? 0.95;
  const sampleRate = options.sampleRate ?? 44100;
  const channels = options.channels ?? 2;
  const filters: string[] = [];
  if (options.maxSeconds && options.maxSeconds > 0) {
    const fadeStart = Math.max(0, options.maxSeconds - 0.35);
    filters.push(`atrim=0:${options.maxSeconds}`, `afade=t=out:st=${fadeStart}:d=0.35`);
  }
  // Peak-ish normalize without loudnorm (more reliable on short SFX)
  filters.push(`dynaudnorm=f=75:g=15`, `volume=${peak}`);
  await run('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-af',
    filters.join(','),
    '-ac',
    String(channels),
    '-ar',
    String(sampleRate),
    outputPath
  ]);
  return outputPath;
}

/** Light convert without loudnorm (faster; for already-clean Mixkit beds). */
export async function convertToWav(
  inputPath: string,
  outputPath: string,
  options: { sampleRate?: number; channels?: number; maxSeconds?: number } = {}
): Promise<string> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const args = ['-y', '-i', inputPath];
  if (options.maxSeconds) {
    const fadeStart = Math.max(0, options.maxSeconds - 0.35);
    args.push(
      '-t',
      String(options.maxSeconds),
      '-af',
      `afade=t=out:st=${fadeStart}:d=0.35`
    );
  }
  args.push(
    '-ac',
    String(options.channels ?? 2),
    '-ar',
    String(options.sampleRate ?? 44100),
    outputPath
  );
  await run('ffmpeg', args);
  return outputPath;
}
