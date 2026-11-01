import type { TechVisual } from '../schema/techVisual.js';
import { TECH_VISUAL_THEME as T } from './theme.js';
import { viewStateForVisual, type TechViewState } from './state.js';

function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function frame(inner: string, title?: string): string {
  const heading = title
    ? `<text x="540" y="160" text-anchor="middle" fill="${T.text}" font-size="54" font-family="${T.font}" font-weight="700">${esc(title)}</text>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${T.width}" height="${T.height}" viewBox="0 0 ${T.width} ${T.height}">
  <rect width="100%" height="100%" fill="${T.bg}"/>
  ${heading}
  ${inner}
</svg>`;
}

function complexityBadge(state: TechViewState, y = 1680): string {
  if (!state.showComplexity || !state.complexityText) return '';
  return `
  <rect x="300" y="${y}" width="480" height="110" rx="24" fill="${T.panel}" stroke="${T.accent}" stroke-width="4"/>
  <text x="540" y="${y + 72}" text-anchor="middle" fill="${T.accent}" font-size="64" font-family="${T.font}" font-weight="700">${esc(state.complexityText)}</text>`;
}

function arrayRow(
  values: number[],
  state: TechViewState,
  y: number,
  opts?: {
    showIndexes?: boolean;
    /** fill = reveal values one-by-one as traversal progresses; all = classic full array */
    mode?: 'fill' | 'all';
  }
): string {
  const mode = opts?.mode || 'all';
  const cellW = Math.min(160, Math.floor(860 / values.length));
  const gap = 12;
  const total = values.length * cellW + (values.length - 1) * gap;
  const startX = (T.width - total) / 2;
  const cells = values
    .map((value, index) => {
      const x = startX + index * (cellW + gap);
      const filled =
        mode === 'all'
          ? state.showArray
          : state.filledCells > index || state.traversalIndex >= index;
      const active =
        filled &&
        (state.highlightIndex === index ||
          state.pointerIndex === index ||
          state.traversalIndex === index);
      const done = filled && state.traversalIndex > index;
      const fill = !filled ? '#0E1624' : active ? T.cellActive : done ? T.cellDone : T.cell;
      const stroke = active ? T.accent : T.panelBorder;
      const strokeW = active ? 5 : 3;
      const indexLabel = opts?.showIndexes
        ? `<text x="${x + cellW / 2}" y="${y - 28}" text-anchor="middle" fill="${T.muted}" font-size="28" font-family="${T.font}">${index}</text>`
        : '';
      const valueText = filled
        ? `<text x="${x + cellW / 2}" y="${y + 78}" text-anchor="middle" fill="${T.text}" font-size="48" font-family="${T.font}" font-weight="700">${esc(value)}</text>`
        : `<text x="${x + cellW / 2}" y="${y + 78}" text-anchor="middle" fill="${T.muted}" font-size="36" font-family="${T.font}">·</text>`;
      return `${indexLabel}
      <rect x="${x}" y="${y}" width="${cellW}" height="120" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>
      ${valueText}`;
    })
    .join('\n');

  let pointer = '';
  if (state.pointerIndex !== null && state.pointerIndex >= 0 && state.pointerIndex < values.length) {
    const x = startX + state.pointerIndex * (cellW + gap) + cellW / 2;
    pointer = `
    <polygon points="${x - 22},${y + 150} ${x + 22},${y + 150} ${x},${y + 185}" fill="${T.warn}"/>
    <text x="${x}" y="${y + 230}" text-anchor="middle" fill="${T.warn}" font-size="40" font-family="${T.font}" font-weight="700">↑</text>`;
  }
  return `${cells}${pointer}`;
}

function layoutHook(visual: TechVisual, state: TechViewState): string {
  const title = visual.visualData.title || 'Big O';
  const subtitle = visual.visualData.subtitle || 'how work grows with n';
  return frame(
    `
    <rect x="140" y="640" width="800" height="420" rx="36" fill="${T.panel}" stroke="${T.panelBorder}" stroke-width="4"/>
    <text x="540" y="820" text-anchor="middle" fill="${T.text}" font-size="120" font-family="${T.font}" font-weight="700">n ↑</text>
    <text x="540" y="940" text-anchor="middle" fill="${T.muted}" font-size="40" font-family="${T.font}">${esc(subtitle)}</text>
    ${state.showComplexity ? complexityBadge(state, 1200) : ''}`,
    title
  );
}

function layoutGrowth(visual: TechVisual, state: TechViewState): string {
  const sizes = visual.visualData.inputSizes || [10, 100, 1000];
  const ops = visual.visualData.operations || sizes;
  const visible =
    state.growthStep > 0
      ? Math.min(sizes.length, state.growthStep)
      : state.showArray
        ? 1
        : 0;
  const bars = sizes.slice(0, visible).map((size, index) => {
    const x = 180 + index * 260;
    const h = 120 + index * 160;
    const y = 1200 - h;
    return `
      <rect x="${x}" y="${y}" width="180" height="${h}" rx="18" fill="${T.cellActive}"/>
      <text x="${x + 90}" y="${y - 30}" text-anchor="middle" fill="${T.text}" font-size="40" font-family="${T.font}">n=${esc(size)}</text>
      <text x="${x + 90}" y="1280" text-anchor="middle" fill="${T.muted}" font-size="34" font-family="${T.font}">ops≈${esc(ops[index] ?? size)}</text>`;
  });
  return frame(`${bars.join('\n')}${complexityBadge(state)}`, visual.visualData.title || 'Work grows with n');
}

function layoutLookup(visual: TechVisual, state: TechViewState): string {
  const values = visual.visualData.values || [10, 20, 30, 40, 50];
  const idx = visual.visualData.targetIndex ?? 2;
  const result = visual.visualData.result ?? values[idx];
  // Fill mode until values are revealed (filledCells >= length or highlight started).
  const filledAll =
    state.filledCells >= values.length ||
    state.highlightIndex !== null ||
    state.showResult;
  const label = state.showArray
    ? `
    <text x="540" y="420" text-anchor="middle" fill="${T.muted}" font-size="36" font-family="${T.font}">index</text>
    ${arrayRow(values, { ...state, filledCells: filledAll ? values.length : state.filledCells }, 520, {
      showIndexes: true,
      mode: filledAll ? 'all' : 'fill'
    })}
    ${
      state.pointerIndex !== null || state.highlightIndex !== null
        ? `<text x="540" y="860" text-anchor="middle" fill="${T.text}" font-size="44" font-family="${T.font}">arr[${esc(idx)}]</text>`
        : ''
    }
    ${
      state.showResult
        ? `<text x="540" y="980" text-anchor="middle" fill="${T.accent}" font-size="72" font-family="${T.font}" font-weight="700">${esc(result ?? '')}</text>`
        : ''
    }`
    : '';
  return frame(`${label}${complexityBadge(state)}`, visual.visualData.title || 'Direct lookup');
}

function layoutTraversal(visual: TechVisual, state: TechViewState): string {
  const values = visual.visualData.values || [2, 4, 6, 8, 10];
  // Always show the slot row once the scene starts; values fill as we speak.
  const showRow = state.showArray || state.traversalIndex >= 0 || state.filledCells > 0;
  return frame(
    `
    ${showRow ? arrayRow(values, state, 620, { showIndexes: true, mode: 'fill' }) : ''}
    <text x="540" y="980" text-anchor="middle" fill="${T.muted}" font-size="44" font-family="${T.font}">operation = ${esc(Math.max(0, state.operations))}</text>
    <text x="540" y="1080" text-anchor="middle" fill="${T.text}" font-size="40" font-family="${T.font}">${esc(Math.max(0, state.operations))} / ${esc(values.length)} visited</text>
    ${complexityBadge(state)}`,
    visual.visualData.title || 'Visit every element'
  );
}

function layoutGrid(visual: TechVisual, state: TechViewState): string {
  const rows = visual.visualData.rows || 4;
  const cols = visual.visualData.columns || 4;
  const size = 120;
  const gap = 14;
  const totalW = cols * size + (cols - 1) * gap;
  const totalH = rows * size + (rows - 1) * gap;
  const startX = (T.width - totalW) / 2;
  const startY = 480;
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const filled = i < state.filledCells;
      const x = startX + c * (size + gap);
      const y = startY + r * (size + gap);
      cells.push(
        `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="14" fill="${filled ? T.cellActive : T.cell}" stroke="${T.panelBorder}" stroke-width="3"/>
         <text x="${x + size / 2}" y="${y + size / 2 + 14}" text-anchor="middle" fill="${T.text}" font-size="36" font-family="${T.font}">${filled ? '✓' : ''}</text>`
      );
    }
  }
  const ops = state.filledCells;
  const equation = state.showEquation
    ? `<text x="540" y="1280" text-anchor="middle" fill="${T.text}" font-size="44" font-family="${T.font}">${esc(rows)} × ${esc(cols)} = ${esc(rows * cols)} operations</text>
       <text x="540" y="1360" text-anchor="middle" fill="${T.muted}" font-size="40" font-family="${T.font}">n × n = n²</text>`
    : `<text x="540" y="1280" text-anchor="middle" fill="${T.muted}" font-size="40" font-family="${T.font}">${esc(ops)} / ${esc(rows * cols)} checks</text>`;
  return frame(
    `${cells.join('\n')}${equation}${complexityBadge(state)}`,
    visual.visualData.title || 'Nested loops'
  );
}

function layoutHalving(visual: TechVisual, state: TechViewState): string {
  const sequence = visual.visualData.sequence || [32, 16, 8, 4, 2, 1];
  const visible = Math.max(0, Math.min(sequence.length, state.halvingLevel || sequence.length));
  const rows = sequence.slice(0, visible).map((value, index) => {
    const width = Math.max(80, Math.round(820 * (value / sequence[0]!)));
    const x = (T.width - width) / 2;
    const y = 420 + index * 160;
    return `
      <text x="120" y="${y + 55}" fill="${T.muted}" font-size="36" font-family="${T.font}">${index === 0 ? '' : '÷2'}</text>
      <rect x="${x}" y="${y}" width="${width}" height="90" rx="18" fill="${T.cellActive}"/>
      <text x="540" y="${y + 60}" text-anchor="middle" fill="${T.text}" font-size="44" font-family="${T.font}" font-weight="700">${esc(value)}</text>`;
  });
  const summary =
    visible >= sequence.length
      ? `<text x="540" y="1500" text-anchor="middle" fill="${T.muted}" font-size="40" font-family="${T.font}">${esc(sequence[0] ?? 0)} → ${esc(sequence.length - 1)} reductions</text>`
      : '';
  return frame(`${rows.join('\n')}${summary}${complexityBadge(state)}`, visual.visualData.title || 'Cut in half');
}

function layoutTimeVsSpace(visual: TechVisual, state: TechViewState): string {
  const values = visual.visualData.values || [2, 4, 6, 8, 10];
  return frame(
    `
    <text x="300" y="420" text-anchor="middle" fill="${T.text}" font-size="44" font-family="${T.font}">Time</text>
    <text x="780" y="420" text-anchor="middle" fill="${T.text}" font-size="44" font-family="${T.font}">Space</text>
    ${state.showArray ? arrayRow(values, { ...state, pointerIndex: state.traversalIndex >= 0 ? state.traversalIndex : values.length - 1, highlightIndex: state.traversalIndex >= 0 ? state.traversalIndex : null }, 520) : ''}
    <rect x="690" y="700" width="180" height="120" rx="16" fill="${T.cell}" stroke="${T.accent}" stroke-width="4"/>
    <text x="780" y="775" text-anchor="middle" fill="${T.accent}" font-size="40" font-family="${T.font}">1 box</text>
    <text x="300" y="1100" text-anchor="middle" fill="${T.warn}" font-size="48" font-family="${T.font}">${esc(visual.visualData.timeLabel || 'O(n)')}</text>
    <text x="780" y="1100" text-anchor="middle" fill="${T.accent}" font-size="48" font-family="${T.font}">${esc(visual.visualData.spaceLabel || 'O(1)')}</text>
    ${complexityBadge(state)}`,
    visual.visualData.title || 'Time vs space'
  );
}

function layoutLadder(visual: TechVisual, state: TechViewState): string {
  const ladder = visual.visualData.ladder || ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)'];
  const visible = Math.max(0, Math.min(ladder.length, state.revealLadderCount || ladder.length));
  const cards = ladder.slice(0, visible).map((label, index) => {
    const y = 420 + index * 160;
    return `
      <rect x="220" y="${y}" width="640" height="120" rx="22" fill="${T.panel}" stroke="${T.panelBorder}" stroke-width="3"/>
      <text x="540" y="${y + 75}" text-anchor="middle" fill="${T.text}" font-size="48" font-family="${T.font}" font-weight="700">${esc(label)}</text>`;
  });
  return frame(
    `${cards.join('\n')}
    <text x="540" y="1500" text-anchor="middle" fill="${T.muted}" font-size="36" font-family="${T.font}">When n grows, what grows?</text>
    ${complexityBadge(state)}`,
    visual.visualData.title || 'Remember the idea'
  );
}

function codeLinesOf(visual: TechVisual): string[] {
  const data = visual.visualData as Record<string, unknown>;
  if (Array.isArray(data.codeLines) && data.codeLines.length) {
    return data.codeLines.map(String);
  }
  if (typeof data.code === 'string' && data.code.trim()) {
    return data.code.split('\n').map((line) => line.replace(/\s+$/g, ''));
  }
  return [];
}

function layoutBookingHall(visual: TechVisual, state: TechViewState): string {
  const data = visual.visualData as Record<string, unknown>;
  const seatId = String(data.seatId || 'A12');
  const seatStatus = String(
    (state as TechViewState & { seatStatus?: string }).seatStatus || data.seatStatus || 'AVAILABLE'
  );
  const movieTitle = String(data.movieTitle || 'FRIDAY NIGHT · SCREEN 3');
  const teaser = codeLinesOf(visual).slice(0, 4);
  const teaserSvg = teaser
    .map(
      (line, index) =>
        `<text x="100" y="${1480 + index * 42}" fill="${T.text}" font-size="28" font-family="${T.font}">${esc(line)}</text>`
    )
    .join('\n');
  return frame(
    `
    <rect x="120" y="360" width="840" height="70" rx="12" fill="${T.panel}" stroke="${T.panelBorder}" stroke-width="2"/>
    <text x="540" y="406" text-anchor="middle" fill="${T.muted}" font-size="28" font-family="${T.font}">${esc(movieTitle)}</text>
    <rect x="200" y="520" width="680" height="420" rx="24" fill="${T.panel}" stroke="${T.accent}" stroke-width="3"/>
    <text x="540" y="700" text-anchor="middle" fill="${T.accent}" font-size="64" font-family="${T.font}" font-weight="700">${esc(seatId)}</text>
    <text x="540" y="780" text-anchor="middle" fill="${T.text}" font-size="40" font-family="${T.font}">${esc(seatStatus)}</text>
    <rect x="160" y="1000" width="340" height="140" rx="18" fill="#152238" stroke="${T.glow}" stroke-width="3"/>
    <text x="330" y="1060" text-anchor="middle" fill="${T.muted}" font-size="26" font-family="${T.font}">Request A</text>
    <text x="330" y="1115" text-anchor="middle" fill="${T.text}" font-size="36" font-family="${T.font}" font-weight="700">BOOK</text>
    <rect x="580" y="1000" width="340" height="140" rx="18" fill="#2A1C10" stroke="${T.warn}" stroke-width="3"/>
    <text x="750" y="1060" text-anchor="middle" fill="${T.muted}" font-size="26" font-family="${T.font}">Request B</text>
    <text x="750" y="1115" text-anchor="middle" fill="${T.text}" font-size="36" font-family="${T.font}" font-weight="700">BOOK</text>
    <rect x="80" y="1400" width="920" height="220" rx="18" fill="${T.panel}" stroke="${T.warn}" stroke-width="2"/>
    <text x="100" y="1445" fill="${T.warn}" font-size="22" font-family="${T.font}" font-weight="700">YOUR INTERVIEW CODE</text>
    ${teaserSvg}`,
    visual.visualData.title || 'BOOKING MANAGER'
  );
}

function layoutCodePanel(visual: TechVisual, state: TechViewState): string {
  const data = visual.visualData as Record<string, unknown>;
  const lines = codeLinesOf(visual);
  const extended = state as TechViewState & {
    revealCodeLines?: number;
    highlightLine?: number | null;
    badgeText?: string | null;
    codeVariant?: string;
  };
  const reveal =
    visual.animationSteps.length === 0
      ? lines.length
      : Math.max(0, extended.revealCodeLines || 0);
  const variant = String(extended.codeVariant || data.codeVariant || 'neutral');
  const accent = variant === 'fixed' ? T.accent : variant === 'buggy' ? T.warn : T.glow;
  const filename = String(data.filename || (data.language === 'sql' ? 'booking.sql' : 'booking.py'));
  const visible = lines.slice(0, reveal);
  const lineSvg = visible
    .map((line, index) => {
      const y = 560 + index * 70;
      const active = extended.highlightLine === index;
      return `
      <rect x="70" y="${y - 40}" width="940" height="60" rx="10" fill="${active ? '#243018' : 'transparent'}"/>
      <text x="100" y="${y}" fill="${T.muted}" font-size="24" font-family="${T.font}">${index + 1}</text>
      <text x="160" y="${y}" fill="${T.text}" font-size="30" font-family="${T.font}">${esc(line)}</text>`;
    })
    .join('\n');
  const badge = extended.badgeText
    ? `<rect x="160" y="1500" width="760" height="90" rx="16" fill="${T.panel}" stroke="${accent}" stroke-width="3"/>
       <text x="540" y="1560" text-anchor="middle" fill="${accent}" font-size="34" font-family="${T.font}" font-weight="700">${esc(extended.badgeText)}</text>`
    : '';
  return frame(
    `
    <rect x="60" y="400" width="960" height="${Math.min(1000, 140 + visible.length * 70)}" rx="22" fill="${T.panel}" stroke="${accent}" stroke-width="3"/>
    <text x="100" y="460" fill="${T.muted}" font-size="26" font-family="${T.font}">${esc(filename)}</text>
    <text x="900" y="460" text-anchor="end" fill="${accent}" font-size="24" font-family="${T.font}" font-weight="700">${esc(variant.toUpperCase())}</text>
    ${lineSvg}
    ${badge}`,
    visual.visualData.title || 'Code'
  );
}

export function renderTechVisualSvg(visual: TechVisual, t: number): string {
  const state = viewStateForVisual(visual, t);
  switch (visual.visualType) {
    case 'TECH_HOOK':
      return layoutHook(visual, state);
    case 'GROWTH_BARS':
      return layoutGrowth(visual, state);
    case 'ARRAY_LOOKUP':
      return layoutLookup(visual, state);
    case 'ARRAY_TRAVERSAL':
      return layoutTraversal(visual, state);
    case 'NESTED_LOOP_GRID':
      return layoutGrid(visual, state);
    case 'HALVING':
      return layoutHalving(visual, state);
    case 'TIME_VS_SPACE':
      return layoutTimeVsSpace(visual, state);
    case 'COMPLEXITY_LADDER':
      return layoutLadder(visual, state);
    case 'BOOKING_HALL':
      return layoutBookingHall(visual, state);
    case 'CODE_PANEL':
      return layoutCodePanel(visual, state);
    default:
      return frame(`<text x="540" y="960" text-anchor="middle" fill="${T.text}" font-size="48">Unknown visual</text>`);
  }
}
