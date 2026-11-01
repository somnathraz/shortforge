import { spawn } from 'node:child_process';

function runCapture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim().slice(-1500) || `${command} exited ${code}`));
    });
  });
}

export type AudioProbe = {
  durationSeconds: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  bitRate?: number;
  format?: string;
};

/** Probe duration + basic format via ffprobe JSON. */
export async function probeAudio(filePath: string): Promise<AudioProbe> {
  const raw = await runCapture('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration,bit_rate,format_name:stream=codec_name,sample_rate,channels',
    '-of',
    'json',
    filePath
  ]);
  const parsed = JSON.parse(raw) as {
    format?: { duration?: string; bit_rate?: string; format_name?: string };
    streams?: Array<{ codec_name?: string; sample_rate?: string; channels?: number }>;
  };
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe could not read duration: ${filePath}`);
  }
  const stream = parsed.streams?.[0];
  return {
    durationSeconds: duration,
    ...(stream?.sample_rate ? { sampleRate: Number(stream.sample_rate) } : {}),
    ...(stream?.channels !== undefined ? { channels: stream.channels } : {}),
    ...(stream?.codec_name ? { codec: stream.codec_name } : {}),
    ...(parsed.format?.bit_rate ? { bitRate: Number(parsed.format.bit_rate) } : {}),
    ...(parsed.format?.format_name ? { format: parsed.format.format_name } : {})
  };
}

export async function probeAudioDuration(filePath: string): Promise<number> {
  return (await probeAudio(filePath)).durationSeconds;
}
