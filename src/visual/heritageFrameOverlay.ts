/**
 * Post-process EpicAstra heritage chrome: thin antique-gold border + top wordmark.
 * Used when visualStyle.look = CINEMATIC_DEVOTIONAL_3D (borderless model output).
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export type HeritageOverlayOptions = {
  /** Output path; defaults to overwriting input. */
  outputPath?: string;
  /** Border thickness as fraction of the short side (default ~1.8%). */
  borderRatio?: number;
  wordmark?: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBorderSvg(width: number, height: number, borderPx: number, wordmark: string): Buffer {
  const inset = Math.max(2, Math.round(borderPx * 0.35));
  const outer = Math.max(4, borderPx);
  const fontSize = Math.max(18, Math.round(width * 0.028));
  const topBand = Math.max(outer + 8, Math.round(height * 0.028));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c9a46a"/>
      <stop offset="45%" stop-color="#e8d5a3"/>
      <stop offset="100%" stop-color="#8a6a34"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="none"
    stroke="url(#gold)" stroke-width="${outer}"/>
  <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" fill="none"
    stroke="#5c4220" stroke-opacity="0.55" stroke-width="1.5"/>
  <rect x="${Math.round(outer * 0.55)}" y="${Math.round(outer * 0.55)}"
    width="${width - Math.round(outer * 1.1)}" height="${height - Math.round(outer * 1.1)}"
    fill="none" stroke="#d4b87a" stroke-opacity="0.35" stroke-width="1"/>
  <text x="50%" y="${topBand}" text-anchor="middle" dominant-baseline="middle"
    font-family="Palatino, 'Times New Roman', Georgia, serif"
    font-size="${fontSize}" fill="#e8d5a3"
    style="letter-spacing:0.12em">${escapeXml(wordmark)}</text>
</svg>`;
  return Buffer.from(svg);
}

/**
 * Composite a thin heritage border + EpicAstra wordmark onto a borderless still.
 * Returns the written path.
 */
export async function applyHeritageFrameOverlay(
  inputPath: string,
  options: HeritageOverlayOptions = {}
): Promise<string> {
  const destination = path.resolve(options.outputPath || inputPath);
  const wordmark = (options.wordmark || 'EpicAstra').trim() || 'EpicAstra';
  const borderRatio = options.borderRatio ?? 0.018;

  const bytes = await readFile(inputPath);
  const meta = await sharp(bytes).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    throw new Error(`Cannot read image dimensions for overlay: ${inputPath}`);
  }

  const borderPx = Math.max(8, Math.round(Math.min(width, height) * borderRatio));
  const overlay = buildBorderSvg(width, height, borderPx, wordmark);
  const pipeline = sharp(bytes).composite([{ input: overlay, top: 0, left: 0 }]);

  const composed = /\.jpe?g$/i.test(destination)
    ? await pipeline.jpeg({ quality: 92 }).toBuffer()
    : await pipeline.png().toBuffer();

  await writeFile(destination, composed);
  return destination;
}
