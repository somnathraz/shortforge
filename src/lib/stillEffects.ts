/** Opt-in local-only atmosphere. Uploaded/AI video clips bypass this still filter. */
export type StillEffects = 'off' | 'atmosphere' | 'water';
export function parseStillEffects(value = 'off'): StillEffects {
  if (value !== 'off' && value !== 'atmosphere' && value !== 'water') throw new Error('FFmpeg effects must be off, atmosphere or water');
  return value;
}
export function stillFilterArgs(cameraFilter: string, width: number, height: number, fps: number, duration: number, preset = process.env.FFMPEG_STILL_EFFECTS || 'off'): string[] {
  const mode = parseStillEffects(preset);
  if (mode === 'off') return ['-vf', cameraFilter];
  const parts = [`[0:v]${cameraFilter}[base]`];
  let base = 'base';
  if (mode === 'water') {
    const mask = 'max(0,min(1,(Y/H-0.87)/0.08))';
    parts.push(`nullsrc=s=${width}x${height}:r=${fps}:d=${duration},geq=lum='128+1.5*${mask}*sin(Y/11+T*2.2)':cb=128:cr=128[xmap]`,
      `nullsrc=s=${width}x${height}:r=${fps}:d=${duration},geq=lum='128+${mask}*sin(X/24+T*1.8)':cb=128:cr=128[ymap]`,
      '[base][xmap][ymap]displace=edge=smear[water]');
    base = 'water';
  }
  const mist = '18*exp(-pow((Y-535)/48,2)-pow((X-(65+18*T))/155,2))+12*exp(-pow((Y-440)/30,2)-pow((X-(300-9*T))/150,2))';
  // Ambient upper-frame light, not a halo that pretends to locate a character.
  const glow = '(8+3*sin(T*1.4))*exp(-pow((X-180)/100,2)-pow((Y-120)/90,2))';
  const particles = Array.from({ length: 12 }, (_, i) => `${48 + i % 3 * 12}*exp(-(pow(X-(${18 + i * 79 % 325}+6*sin(T*0.6+${i})),2)+pow(Y-(${50 + i * 137 % 530}-${3 + i % 4}*T),2))/7)`).join('+');
  for (const [label, alpha, rgb] of [['mist', mist, 'r=245:g=248:b=255'], ['glow', glow, 'r=255:g=222:b=142'], ['particles', particles, 'r=255:g=228:b=165']]) {
    parts.push(`nullsrc=s=360x640:r=${fps}:d=${duration},format=rgba,geq=${rgb}:a='${alpha}',scale=${width}:${height}[${label}]`);
  }
  parts.push(`[${base}][glow]overlay=shortest=1[lit]`, '[lit][mist]overlay=shortest=1[depth]', '[depth][particles]overlay=shortest=1,format=yuv420p[effects]');
  return ['-filter_complex_threads', '2', '-filter_complex', parts.join(';'), '-map', '[effects]'];
}
