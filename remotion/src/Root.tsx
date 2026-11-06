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
import { TechReel } from './compositions/TechReel';
import { previewReel, reelFrames, REEL_FPS, type TechReelProps } from '../../src/remotion/techReelModel';
import counterRace from '../../data/tech-reels/rate-limiter-day2-counter-race-v2.json';


const defaults = loadBigOEpisodeProps();
const chromeDefaults: EpicAstraChromeProps = {
  videoSrc: 'chrome/source.mp4',
  mainFrames: 30 * 46,
  title: 'Your Channel',
  subtitle: 'Short stories',
  brand: 'Your Channel',
  cta: 'Follow for more.',
  introFrames: 60,
  outroFrames: 75
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="RateLimiterDay2"
        component={TechReel}
        durationInFrames={2100}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ reel: counterRace as TechReelData, captions: [] } as TechReelProps}
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
