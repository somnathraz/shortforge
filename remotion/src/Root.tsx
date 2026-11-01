import React from 'react';
import { Composition } from 'remotion';
import { BigOEpisode, type BigOEpisodeProps } from './compositions/BigOEpisode';
import {
  chromeTotalFrames,
  EpicAstraChrome,
  type EpicAstraChromeProps
} from './compositions/EpicAstraChrome';
import { loadBigOEpisodeProps, totalDurationInFrames } from './lib/loadBigOProps';
import { TECH } from './theme';
import { GovardhanExplainer } from './compositions/GovardhanExplainer';
import { demoTotalFrames } from './demo/govardhanScript';
import { RavanaExplainer } from './compositions/RavanaExplainer';
import { ravanaTotalFrames } from './demo/ravanaScript';
import { HanumanExplainer } from './compositions/HanumanExplainer';
import { hanumanTotalFrames } from './demo/hanumanScript';
import { TechReel } from './compositions/TechReel';
import { previewReel, reelFrames, REEL_FPS, type TechReelProps } from '../../src/remotion/techReelModel';
import clickCounter from '../../data/tech-reels/url-shortener-day4-click-counter.json';
import type { TechReel as TechReelData } from '../../src/schema/techReel';

// The storyboard is validated by the Node authoring schema; keep Node-only imports out of webpack.
const clickCounterReel = clickCounter as TechReelData;

const defaults = loadBigOEpisodeProps();
const chromeDefaults: EpicAstraChromeProps = {
  videoSrc: 'chrome/source.mp4',
  mainFrames: 30 * 46,
  title: 'EpicAstra',
  subtitle: 'Mythology Shorts',
  brand: 'EpicAstra',
  cta: 'Follow EpicAstra for more mythology Shorts.',
  introFrames: 60,
  outroFrames: 75
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="UrlShortenerDay4"
        component={TechReel}
        durationInFrames={2460}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ reel: clickCounterReel, captions: [] } as TechReelProps}
        calculateMetadata={({ props }: { props: TechReelProps }) => ({ durationInFrames: reelFrames(props.reel) })}
      />
      <Composition
        id="TechReel"
        component={TechReel}
        durationInFrames={reelFrames(previewReel)}
        fps={REEL_FPS}
        width={1080}
        height={1920}
        defaultProps={{ reel: previewReel, captions: [] } as TechReelProps}
        calculateMetadata={({ props }: { props: TechReelProps }) => ({ durationInFrames: reelFrames(props.reel) })}
      />
      <Composition
        id="GovardhanExplainer"
        component={GovardhanExplainer}
        durationInFrames={demoTotalFrames()}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="RavanaExplainer"
        component={RavanaExplainer}
        durationInFrames={ravanaTotalFrames()}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="HanumanExplainer"
        component={HanumanExplainer}
        durationInFrames={hanumanTotalFrames()}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="BigOEpisode"
        component={BigOEpisode}
        durationInFrames={totalDurationInFrames(defaults, TECH.fps)}
        fps={TECH.fps}
        width={TECH.width}
        height={TECH.height}
        defaultProps={defaults}
        calculateMetadata={async ({ props }: { props: BigOEpisodeProps }) => ({
          durationInFrames: totalDurationInFrames(props, TECH.fps),
          props
        })}
      />
      <Composition
        id="EpicAstraChrome"
        component={EpicAstraChrome}
        durationInFrames={chromeTotalFrames(chromeDefaults.mainFrames)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={chromeDefaults}
        calculateMetadata={({ props }: { props: EpicAstraChromeProps }) => ({
          durationInFrames: chromeTotalFrames(
            props.mainFrames,
            props.introFrames ?? 60,
            props.outroFrames ?? 75
          )
        })}
      />
    </>
  );
};
