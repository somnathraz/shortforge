import type { Scene } from '../schema/episode.js';

const DEFAULT_NEGATIVE =
  'facial deformation, extra fingers, extra limbs, warped hands, changing identity, morphing faces, changing clothes, frame flicker, floating objects, unnatural body movement, text, subtitles, logo, watermark';

/**
 * Motion prompt for Wan/Veo/Kling.
 * Prefer scene.videoPrompt (movement). Fall back to visualPrompt + camera for older JSON.
 */
export function sceneMotionPrompt(scene: Scene): string {
  const dedicated = scene.videoPrompt?.trim();
  if (dedicated) return dedicated;
  return `${scene.visualPrompt}. Camera: ${scene.camera}. Animate naturally. Preserve faces, clothing and character identity.`;
}

export function sceneMotionNegativePrompt(scene: Scene): string {
  return (
    scene.videoNegativePrompt?.trim() ||
    process.env.WAN_COMFY_NEGATIVE?.trim() ||
    DEFAULT_NEGATIVE
  );
}
