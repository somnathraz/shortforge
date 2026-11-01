import type { TechAnimationStep, TechVisual, TechVisualData } from '../schema/techVisual.js';

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
  showTitle: boolean;
  growthStep: number;
  showCode: boolean;
  revealCodeLines: number;
  highlightLine: number | null;
  codeVariant: 'buggy' | 'fixed' | 'neutral';
  badgeText: string | null;
  seatStatus: 'AVAILABLE' | 'BOOKED' | null;
};

export function initialTechViewState(data: TechVisualData): TechViewState {
  return {
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
    showTitle: true,
    growthStep: 0,
    showCode: false,
    revealCodeLines: 0,
    highlightLine: null,
    codeVariant: (data.codeVariant as 'buggy' | 'fixed' | 'neutral' | undefined) || 'neutral',
    badgeText: data.badge || null,
    seatStatus: (data.seatStatus as 'AVAILABLE' | 'BOOKED' | undefined) || null
  };
}

export function applyTechAnimationSteps(
  steps: TechAnimationStep[],
  data: TechVisualData,
  t: number
): TechViewState {
  const state = initialTechViewState(data);
  const ordered = [...steps].sort((a, b) => a.at - b.at);
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
        break;
      case 'highlightCell':
        state.highlightIndex = step.index ?? data.targetIndex ?? 0;
        break;
      case 'showResult':
        state.showResult = true;
        break;
      case 'showComplexity':
        state.showComplexity = true;
        if (step.value !== undefined) state.complexityText = String(step.value);
        break;
      case 'traverseTo':
        state.showArray = true;
        state.traversalIndex = step.index ?? state.traversalIndex + 1;
        state.pointerIndex = state.traversalIndex;
        state.highlightIndex = state.traversalIndex;
        state.operations = state.traversalIndex + 1;
        // Fill array left→right as the pointer visits each cell.
        state.filledCells = Math.max(state.filledCells, state.traversalIndex + 1);
        break;
      case 'setOperations':
        state.operations = Number(step.value ?? state.operations);
        break;
      case 'fillCell':
        state.filledCells = Math.max(state.filledCells, (step.index ?? state.filledCells) + 1);
        break;
      case 'fillRow': {
        const cols = data.columns || 4;
        const row = step.row ?? 0;
        state.filledCells = Math.max(state.filledCells, (row + 1) * cols);
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
        if (step.value === 'AVAILABLE' || step.value === 'BOOKED') state.seatStatus = step.value;
        break;
      case 'showHall':
      case 'showBookingHall':
      case 'showRequestA':
      case 'showRequestB':
        break;
      default:
        break;
    }
  }
  return state;
}

export function viewStateForVisual(visual: TechVisual, t: number): TechViewState {
  const clamped = Math.min(1, Math.max(0, t));
  if (!visual.animationSteps.length) {
    // No steps → show the complete teaching diagram.
    const full = initialTechViewState(visual.visualData);
    full.showArray = true;
    full.showResult = true;
    full.showComplexity = true;
    full.showEquation = true;
    full.pointerIndex = visual.visualData.targetIndex ?? null;
    full.highlightIndex = visual.visualData.targetIndex ?? null;
    const values = visual.visualData.values || [];
    full.traversalIndex = Math.max(0, values.length - 1);
    full.operations = values.length;
    const rows = visual.visualData.rows || 0;
    const cols = visual.visualData.columns || 0;
    full.filledCells = rows * cols;
    full.halvingLevel = (visual.visualData.sequence || []).length;
    full.revealLadderCount = (visual.visualData.ladder || []).length;
    full.growthStep = (visual.visualData.inputSizes || []).length;
    const codeLines =
      (visual.visualData.codeLines as string[] | undefined) ||
      (typeof visual.visualData.code === 'string'
        ? visual.visualData.code.split('\n')
        : []);
    full.showCode = true;
    full.revealCodeLines = codeLines.length;
    return full;
  }
  return applyTechAnimationSteps(visual.animationSteps, visual.visualData, clamped);
}
