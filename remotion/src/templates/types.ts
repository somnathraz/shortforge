import type React from 'react';
import type { TechReelProps } from '../../../src/remotion/techReelModel';
import type { TechReel } from '../../../src/schema/techReel';

export type SceneBeat = TechReel['beats'][number];

export type SceneContext = {
  reel: TechReel;
  beat: SceneBeat;
  previous: SceneBeat;
  beatIndex: number;
  /** Frame within the current beat */
  localFrame: number;
  durationInFrames: number;
  globalFrame: number;
  captions: TechReelProps['captions'];
};

export type TemplateMeta = {
  id: string;
  title: string;
  pack: string;
  llm: string;
  status: 'ready' | 'draft';
};

export type SceneTemplateModule = {
  meta: TemplateMeta;
  Scene: React.FC<{ context: SceneContext }>;
};
