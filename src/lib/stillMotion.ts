/** Duration-normalized camera motion for stills. Medium glide matches the approved demo. */
export type MotionKind = 'glide' | 'zoom_in' | 'zoom_out' | 'pan_right' | 'pan_left' | 'rise' | 'fall';

export function pickMotion(camera: string, _index = 0): MotionKind {
  const text = camera.toLowerCase().replace(/-/g, ' ');
  // Shot framing (wide, close-up, low angle) is not a camera movement command.
  if (/\b(zoom out|pull back|pull out)\b/.test(text)) return 'zoom_out';
  if (/\b(zoom in|push in|dolly forward)\b/.test(text)) return 'zoom_in';
  if (/\b(pan|track)\b/.test(text)) return /\bleft\b/.test(text) ? 'pan_left' : 'pan_right';
  if (/\b(tilt up|rise|rising)\b/.test(text)) return 'rise';
  if (/\b(tilt down|fall|descending)\b/.test(text)) return 'fall';
  return 'glide';
}

export function zoompanFilter(
  durationSeconds: number, fps: number, width: number, height: number,
  motion: MotionKind, level: 'low' | 'medium' | 'high'
): string {
  const frames = Math.max(1, Math.round(durationSeconds * fps));
  const p = `(min(on,${frames - 1})/${Math.max(1, frames - 1)})`;
  const ease = `(${p}*${p}*(3-2*${p}))`;
  const max = level === 'low' ? 1.05 : level === 'high' ? 1.14 : 1.09;
  const delta = (max - 1.025).toFixed(3);
  let z = `1.025+${delta}*${ease}`;
  let x = '(iw-iw/zoom)*0.5';
  let y = '(ih-ih/zoom)*0.5';
  if (motion === 'glide') {
    x = `(iw-iw/zoom)*(0.30+0.25*${ease})`;
    y = `(ih-ih/zoom)*(0.30+0.30*${ease})`;
  } else if (motion === 'zoom_out') {
    z = `${max}-${delta}*${ease}`;
  } else if (motion === 'pan_right' || motion === 'pan_left') {
    z = String(max);
    x = `(iw-iw/zoom)*${motion === 'pan_left' ? `(1-${ease})` : ease}`;
  } else if (motion === 'rise' || motion === 'fall') {
    z = String(max);
    y = `(ih-ih/zoom)*${motion === 'rise' ? `(1-${ease})` : ease}`;
  }
  return [
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
    `crop=${width * 2}:${height * 2}`,
    `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${width}x${height}:fps=${fps}`,
    'setsar=1', `trim=duration=${durationSeconds}`, 'setpts=PTS-STARTPTS'
  ].join(',');
}
