import type { SceneTemplateModule } from './types';
import * as windowArray from './scenes/window.array';
import * as scaleMachine from './scenes/scale.machine';
import * as mobilityMap from './scenes/mobility.map';
import * as sysHotPathCounter from './scenes/sys.hot-path-counter';

/**
 * Remotion scene registry. Scaffold CLI appends imports here.
 * Ids must stay in sync with src/visual/techReelTemplates.ts
 */
export const TEMPLATE_REGISTRY: Record<string, SceneTemplateModule> = {
  [sysHotPathCounter.meta.id]: sysHotPathCounter,
  [windowArray.meta.id]: windowArray,
  [scaleMachine.meta.id]: scaleMachine,
  [mobilityMap.meta.id]: mobilityMap
};

export function getSceneTemplate(id: string): SceneTemplateModule {
  const entry = TEMPLATE_REGISTRY[id];
  if (!entry) {
    throw new Error(
      `Unknown scene template "${id}". Create it first: npm run tech:template:scaffold -- --id ${id}`
    );
  }
  return entry;
}

export function listSceneTemplateIds(): string[] {
  return Object.keys(TEMPLATE_REGISTRY).sort();
}
