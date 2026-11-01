export type AnimationStep = {
  at: number;
  action: string;
  index?: number;
  row?: number;
  value?: string | number;
  label?: string;
};

export type VisualData = {
  title?: string;
  subtitle?: string;
  complexity?: string;
  values?: number[];
  targetIndex?: number;
  result?: number;
  rows?: number;
  columns?: number;
  sequence?: number[];
  ladder?: string[];
  timeLabel?: string;
  spaceLabel?: string;
  inputSizes?: number[];
  operations?: number[];
  /** Fixed sliding-window length k */
  windowSize?: number;
  /** Prefer sliding-window chrome over single-cell fill */
  slidingWindow?: boolean;
  windowMode?: 'fixed' | 'twoPointer';
  codeLines?: string[];
  code?: string;
  language?: 'python' | 'sql' | 'text';
  filename?: string;
  codeVariant?: 'buggy' | 'fixed' | 'neutral';
  badge?: string;
  movieTitle?: string;
  seatId?: string;
  seatStatus?: 'AVAILABLE' | 'BOOKED';
  hallRows?: number;
  hallCols?: number;
  requestALabel?: string;
  requestBLabel?: string;
  teaserLines?: string[];
  showDualBook?: boolean;
  /** SYSTEM_FLOW */
  caption?: string;
  ttlLabel?: string;
  nodeLabels?: Partial<Record<'visitor' | 'owner' | 'cache' | 'db', string>>;
};

export type TechViewState = {
  showArray: boolean;
  pointerIndex: number | null;
  highlightIndex: number | null;
  showResult: boolean;
  showComplexity: boolean;
  complexityText: string | null;
  traversalIndex: number;
  operations: number;
  filledCells: number;
  halvingLevel: number;
  showEquation: boolean;
  revealLadderCount: number;
  growthStep: number;
  windowStart: number;
  leftIndex: number | null;
  rightIndex: number | null;
  formula: string | null;
  sumOverride: number | null;
  actionLabel: string | null;
  showCode: boolean;
  revealCodeLines: number;
  highlightLine: number | null;
  codeVariant: 'buggy' | 'fixed' | 'neutral';
  badgeText: string | null;
  seatStatus: 'AVAILABLE' | 'BOOKED' | null;
  requestAText: string | null;
  requestBText: string | null;
  showDualBook: boolean;
  showHall: boolean;
};

export function viewStateAt(
  steps: AnimationStep[],
  data: VisualData,
  t: number
): TechViewState {
  const state: TechViewState = {
    showArray: false,
    pointerIndex: null,
    highlightIndex: null,
    showResult: false,
    showComplexity: false,
    complexityText: data.complexity || null,
    traversalIndex: -1,
    operations: 0,
    filledCells: 0,
    halvingLevel: 0,
    showEquation: false,
    revealLadderCount: 0,
    growthStep: 0,
    windowStart: 0,
    leftIndex: null,
    rightIndex: null,
    formula: null,
    sumOverride: null,
    actionLabel: null,
    showCode: false,
    revealCodeLines: 0,
    highlightLine: null,
    codeVariant: data.codeVariant || 'neutral',
    badgeText: data.badge || null,
    seatStatus: data.seatStatus || null,
    requestAText: null,
    requestBText: null,
    showDualBook: data.showDualBook !== false,
    showHall: false
  };

  const ordered = [...steps].sort((a, b) => a.at - b.at);
  const useSliding = Boolean(data.slidingWindow || data.windowSize);

  for (const step of ordered) {
    if (step.at > t + 1e-9) break;
    switch (step.action) {
      case 'showArray':
      case 'showGrid':
      case 'showBars':
      case 'showSplit':
      case 'showLadder':
      case 'showHook':
        state.showArray = true;
        break;
      case 'showIndexPointer':
        state.pointerIndex = step.index ?? data.targetIndex ?? 0;
        if (useSliding && data.windowMode === 'twoPointer') {
          state.leftIndex = step.index ?? state.leftIndex ?? 0;
        }
        break;
      case 'highlightCell':
        state.highlightIndex = step.index ?? data.targetIndex ?? 0;
        break;
      case 'showResult':
        state.showResult = true;
        if (data.result !== undefined) state.sumOverride = Number(data.result);
        break;
      case 'showComplexity':
        state.showComplexity = true;
        if (step.value !== undefined) state.complexityText = String(step.value);
        break;
      case 'slideWindow': {
        state.showArray = true;
        const next = step.index ?? state.windowStart + 1;
        state.windowStart = next;
        state.pointerIndex = next;
        state.highlightIndex = next;
        state.operations = next + 1;
        const k = data.windowSize || 3;
        state.leftIndex = next;
        state.rightIndex = next + k - 1;
        if (step.label) state.formula = String(step.label);
        if (typeof step.value === 'number') state.sumOverride = step.value;
        break;
      }
      case 'setLeft':
        state.showArray = true;
        state.leftIndex = step.index ?? 0;
        state.pointerIndex = state.leftIndex;
        state.actionLabel = step.label
          ? String(step.label)
          : '← ADVANCE LEFT';
        break;
      case 'setRight':
        state.showArray = true;
        state.rightIndex = step.index ?? 0;
        state.highlightIndex = state.rightIndex;
        state.actionLabel = step.label
          ? String(step.label)
          : 'GROW RIGHT →';
        break;
      case 'showFormula':
        if (step.label) state.formula = String(step.label);
        else if (step.value !== undefined) state.formula = String(step.value);
        break;
      case 'traverseTo':
        state.showArray = true;
        state.traversalIndex = step.index ?? state.traversalIndex + 1;
        state.pointerIndex = state.traversalIndex;
        state.highlightIndex = state.traversalIndex;
        state.operations = state.traversalIndex + 1;
        state.filledCells = Math.max(state.filledCells, state.traversalIndex + 1);
        if (useSliding) {
          state.windowStart = state.traversalIndex;
          const k = data.windowSize || 3;
          if (data.windowMode === 'twoPointer') {
            if (state.leftIndex === null) state.leftIndex = 0;
            state.rightIndex = state.traversalIndex;
          } else {
            state.leftIndex = state.traversalIndex;
            state.rightIndex = state.traversalIndex + k - 1;
          }
        }
        break;
      case 'fillRow': {
        const cols = data.columns || 4;
        const row = step.row ?? 0;
        state.filledCells = Math.max(state.filledCells, (row + 1) * cols);
        state.showArray = true;
        break;
      }
      case 'halveTo':
        state.halvingLevel = Math.max(
          state.halvingLevel,
          typeof step.index === 'number' ? step.index + 1 : state.halvingLevel + 1
        );
        break;
      case 'showEquation':
        state.showEquation = true;
        break;
      case 'revealLadderItem':
        state.revealLadderCount = Math.max(
          state.revealLadderCount,
          (step.index ?? state.revealLadderCount) + 1
        );
        break;
      case 'growthStep':
        state.growthStep = Math.max(
          state.growthStep,
          typeof step.index === 'number' ? step.index + 1 : state.growthStep + 1
        );
        break;
      case 'showHall':
      case 'showBookingHall':
        state.showHall = true;
        state.showDualBook = true;
        break;
      case 'showCode':
      case 'showCodePanel':
        state.showCode = true;
        break;
      case 'revealCodeLine':
        state.showCode = true;
        state.revealCodeLines = Math.max(
          state.revealCodeLines,
          (step.index ?? state.revealCodeLines) + 1
        );
        break;
      case 'highlightLine':
        state.showCode = true;
        state.highlightLine = step.index ?? 0;
        break;
      case 'setCodeVariant':
        if (step.value === 'buggy' || step.value === 'fixed' || step.value === 'neutral') {
          state.codeVariant = step.value;
        }
        break;
      case 'showBadge':
        state.badgeText = step.label || (step.value !== undefined ? String(step.value) : state.badgeText);
        break;
      case 'setSeatStatus':
        if (step.value === 'AVAILABLE' || step.value === 'BOOKED') {
          state.seatStatus = step.value;
        } else if (step.label === 'AVAILABLE' || step.label === 'BOOKED') {
          state.seatStatus = step.label;
        }
        break;
      case 'showRequestA':
        state.requestAText = step.label || (step.value !== undefined ? String(step.value) : 'READ: AVAILABLE');
        break;
      case 'showRequestB':
        state.requestBText = step.label || (step.value !== undefined ? String(step.value) : 'READ: AVAILABLE');
        break;
      default:
        break;
    }
  }
  return state;
}

export function resolveCodeLines(data: VisualData): string[] {
  if (data.codeLines?.length) return data.codeLines;
  if (data.code) {
    return data.code
      .split('\n')
      .map((line) => line.replace(/\s+$/g, ''))
      .filter((line, index, arr) => line.length > 0 || (index > 0 && index < arr.length - 1));
  }
  return [];
}

function lerpKeyframes(
  frames: Array<{ at: number; value: number }>,
  t: number,
  fallback: number
): number {
  if (frames.length === 0) return fallback;
  const sorted = [...frames].sort((a, b) => a.at - b.at);
  if (t <= sorted[0].at) return sorted[0].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t <= b.at || i === sorted.length - 2) {
      if (t >= b.at && i < sorted.length - 2) continue;
      const span = Math.max(1e-6, b.at - a.at);
      const p = Math.min(1, Math.max(0, (t - a.at) / span));
      const eased = p * p * (3 - 2 * p);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return sorted[sorted.length - 1].value;
}

/** Smooth window-start (or L/R) between keyed animation steps. */
export function smoothWindowAt(
  steps: AnimationStep[],
  t: number,
  fallbackStart = 0
): { windowStart: number; leftIndex: number; rightIndex: number } {
  const slides = steps
    .filter((s) => s.action === 'slideWindow' || s.action === 'traverseTo')
    .map((s) => ({ at: s.at, value: s.index ?? 0 }));
  const lefts = steps
    .filter((s) => s.action === 'setLeft')
    .map((s) => ({ at: s.at, value: s.index ?? 0 }));
  const rights = steps
    .filter((s) => s.action === 'setRight')
    .map((s) => ({ at: s.at, value: s.index ?? 0 }));

  const windowStart = lerpKeyframes(slides, t, fallbackStart);
  const leftIndex =
    lefts.length > 0 ? lerpKeyframes(lefts, t, 0) : windowStart;
  const rightIndex =
    rights.length > 0 ? lerpKeyframes(rights, t, leftIndex) : windowStart;

  return { windowStart, leftIndex, rightIndex };
}
