import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  ArrayCard,
  BookingHallCard,
  CodePanelCard,
  ComplexityBadge,
  DatabaseCard,
  GrowthBarsCard,
  GridCard,
  HalvingCard,
  HookCard,
  LadderCard,
  SlidingWindowCard,
  SystemFlowCard,
  TechBackground,
  TitleBlock,
  Watermark
} from '../cards';
import {
  resolveCodeLines,
  smoothWindowAt,
  viewStateAt,
  type AnimationStep,
  type VisualData
} from '../lib/viewState';
import { TECH } from '../theme';

export type TechSceneProps = {
  visualType: string;
  visualData: VisualData;
  animationSteps: AnimationStep[];
  /** legacy = dark tech cards; none = diagram only (Algo Lab / sample chrome wraps it). */
  chrome?: 'legacy' | 'none';
};

function wantsSlidingWindow(visualType: string, data: VisualData): boolean {
  if (data.slidingWindow || data.windowSize) return true;
  const title = (data.title || '').toLowerCase();
  if (
    title.includes('sliding') ||
    title.includes('window') ||
    title.includes('slide') ||
    title.includes('pointer')
  ) {
    return visualType === 'ARRAY_TRAVERSAL' || visualType === 'ARRAY_LOOKUP' || visualType === 'TIME_VS_SPACE';
  }
  return false;
}

/** One teaching beat using predefined cards + shared background/watermark. */
export const TechScene: React.FC<TechSceneProps> = ({
  visualType,
  visualData,
  animationSteps,
  chrome = 'legacy'
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = durationInFrames <= 1 ? 1 : frame / (durationInFrames - 1);
  const state = viewStateAt(animationSteps, visualData, t);
  const title = visualData.title || '';
  const sliding = wantsSlidingWindow(visualType, visualData);
  const windowSize = visualData.windowSize || 3;
  const windowMode =
    visualData.windowMode ||
    (title.toLowerCase().includes('pointer') ? 'twoPointer' : 'fixed');
  const smooth = sliding
    ? smoothWindowAt(animationSteps, t, state.windowStart)
    : null;
  const bare = chrome === 'none';

  return (
    <AbsoluteFill style={bare ? { background: 'transparent' } : undefined}>
      {!bare ? <TechBackground /> : null}
      {!bare && visualType !== 'TECH_HOOK' && title ? <TitleBlock title={title} /> : null}

      {visualType === 'TECH_HOOK' ? (
        <HookCard
          title={visualData.title || 'Big O'}
          subtitle={visualData.subtitle || 'How does your code scale?'}
          showComplexity={state.showComplexity}
          complexityText={state.complexityText || 'n ↑'}
          variant={
            (visualData.title || '').toLowerCase().includes('sliding')
              ? 'slidingWindow'
              : 'default'
          }
        />
      ) : null}

      {visualType === 'GROWTH_BARS' ? (
        <GrowthBarsCard
          inputSizes={visualData.inputSizes || [10, 100, 1000]}
          operations={visualData.operations || [10, 100, 1000]}
          growthStep={state.growthStep}
          t={t}
          animationSteps={animationSteps}
        />
      ) : null}

      {sliding &&
      (visualType === 'ARRAY_LOOKUP' ||
        visualType === 'ARRAY_TRAVERSAL' ||
        visualType === 'TIME_VS_SPACE') ? (
        <SlidingWindowCard
          values={visualData.values || [2, 1, 5, 1, 3, 2]}
          windowSize={windowSize}
          windowStart={smooth?.windowStart ?? state.windowStart}
          mode={windowMode}
          leftIndex={
            windowMode === 'twoPointer'
              ? (smooth?.leftIndex ?? state.leftIndex ?? 0)
              : null
          }
          rightIndex={
            windowMode === 'twoPointer'
              ? (smooth?.rightIndex ?? state.rightIndex ?? windowSize - 1)
              : null
          }
          showSum={visualType !== 'TIME_VS_SPACE' || state.showComplexity}
          sumOverride={state.sumOverride}
          formula={state.formula}
          actionLabel={windowMode === 'twoPointer' ? state.actionLabel : null}
          visible={state.showArray || visualType === 'ARRAY_LOOKUP'}
          y={visualType === 'TIME_VS_SPACE' ? 700 : 780}
        />
      ) : null}

      {!sliding && (visualType === 'ARRAY_LOOKUP' || visualType === 'ARRAY_TRAVERSAL') ? (
        <>
          <ArrayCard
            values={visualData.values || [10, 20, 30, 40, 50]}
            pointerIndex={state.pointerIndex}
            highlightIndex={state.highlightIndex}
            filledCells={
              visualType === 'ARRAY_TRAVERSAL'
                ? Math.max(state.filledCells, 0)
                : (visualData.values || []).length
            }
            mode={visualType === 'ARRAY_TRAVERSAL' ? 'fill' : 'all'}
            visible={state.showArray || visualType === 'ARRAY_LOOKUP'}
            y={820}
            t={t}
            animationSteps={animationSteps}
            particles={visualType === 'ARRAY_TRAVERSAL' || visualType === 'ARRAY_LOOKUP'}
          />
          {state.showResult && visualData.result !== undefined ? (
            <div
              style={{
                position: 'absolute',
                top: 1100,
                left: 0,
                right: 0,
                textAlign: 'center',
                color: TECH.warn,
                fontFamily: TECH.font,
                fontSize: 44,
                fontWeight: 700
              }}
            >
              arr[{visualData.targetIndex ?? 0}] = {visualData.result}
            </div>
          ) : null}
        </>
      ) : null}

      {visualType === 'NESTED_LOOP_GRID' ? (
        <GridCard
          rows={visualData.rows || 4}
          columns={visualData.columns || 4}
          filledCells={state.filledCells}
          showEquation={state.showEquation}
        />
      ) : null}

      {visualType === 'HALVING' ? (
        <HalvingCard
          sequence={visualData.sequence || [32, 16, 8, 4, 2, 1]}
          halvingLevel={state.halvingLevel}
        />
      ) : null}

      {!sliding && visualType === 'TIME_VS_SPACE' ? (
        <>
          <ArrayCard
            values={visualData.values || [2, 4, 6, 8, 10]}
            pointerIndex={state.pointerIndex}
            highlightIndex={state.highlightIndex}
            mode="fill"
            filledCells={Math.max(state.filledCells, 0)}
            visible={state.showArray}
            y={700}
            t={t}
            animationSteps={animationSteps}
            particles
          />
          <div
            style={{
              position: 'absolute',
              top: 980,
              left: 80,
              right: 80,
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: TECH.font,
              color: TECH.muted,
              fontSize: 32
            }}
          >
            <span>Time {visualData.timeLabel || 'O(n)'}</span>
            <span>Extra space {visualData.spaceLabel || 'O(1)'}</span>
          </div>
          <DatabaseCard label="1 var" active={state.showComplexity} cy={1280} />
        </>
      ) : null}

      {sliding && visualType === 'TIME_VS_SPACE' ? (
        <div
          style={{
            position: 'absolute',
            top: 1180,
            left: 80,
            right: 80,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: TECH.font,
            color: TECH.muted,
            fontSize: 32
          }}
        >
          <span>Time {visualData.timeLabel || 'O(n)'}</span>
          <span>{visualData.spaceLabel || 'O(1)'}</span>
        </div>
      ) : null}

      {visualType === 'COMPLEXITY_LADDER' ? (
        <LadderCard
          ladder={visualData.ladder || ['O(1)', 'O(log n)', 'O(n)', 'O(n²)']}
          revealCount={state.revealLadderCount}
        />
      ) : null}

      {visualType === 'BOOKING_HALL' ? (
        <BookingHallCard
          title={visualData.title || 'BOOKING MANAGER'}
          subtitle={visualData.subtitle || 'Interview scenario · one seat left'}
          movieTitle={visualData.movieTitle || 'FRIDAY NIGHT · SCREEN 3'}
          seatId={visualData.seatId || 'A12'}
          seatStatus={state.seatStatus || visualData.seatStatus || 'AVAILABLE'}
          rows={visualData.hallRows || 5}
          cols={visualData.hallCols || 8}
          showDualBook={state.showDualBook || state.showHall || visualData.showDualBook !== false}
          teaserLines={
            visualData.teaserLines ||
            resolveCodeLines(visualData).slice(0, 4)
          }
        />
      ) : null}

      {visualType === 'CODE_PANEL' ? (
        <CodePanelCard
          title={visualData.title}
          subtitle={visualData.subtitle}
          filename={visualData.filename || (visualData.language === 'sql' ? 'booking.sql' : 'booking.py')}
          language={visualData.language || 'python'}
          lines={resolveCodeLines(visualData)}
          revealCount={
            animationSteps.length === 0
              ? resolveCodeLines(visualData).length
              : Math.max(state.revealCodeLines, state.showCode ? 1 : 0)
          }
          highlightIndex={state.highlightLine}
          variant={state.codeVariant || visualData.codeVariant || 'neutral'}
          badge={state.badgeText}
          requestA={state.requestAText}
          requestB={state.requestBText}
          seatId={visualData.seatId || 'A12'}
          seatStatus={state.seatStatus || visualData.seatStatus || null}
          chipsBelow={bare}
        />
      ) : null}

      {visualType === 'SYSTEM_FLOW' ? (
        <SystemFlowCard
          t={t}
          steps={animationSteps}
          nodeLabels={visualData.nodeLabels}
          ttlLabel={visualData.ttlLabel}
          caption={visualData.caption}
          captionVariant={state.codeVariant || visualData.codeVariant || 'neutral'}
          badge={state.badgeText}
        />
      ) : null}

      {!bare && visualType !== 'TECH_HOOK' && visualType !== 'BOOKING_HALL' && visualType !== 'CODE_PANEL' && visualType !== 'SYSTEM_FLOW' ? (
        <ComplexityBadge
          text={state.complexityText || visualData.complexity || ''}
          visible={state.showComplexity && Boolean(state.complexityText || visualData.complexity)}
        />
      ) : null}

      {!bare ? <Watermark /> : null}
    </AbsoluteFill>
  );
};
