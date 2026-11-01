import type { JobKind } from './types.js';
import { assertEpisodeNotPublished } from './assets.js';
import { getEpisodeDetail, loadReview } from './episodes.js';

/** Approval / published-lock gate shared by the Desk (`POST /api/jobs`) and the MCP server. */
export async function assertJobAllowed(
  kind: JobKind,
  options: { episodeFile?: string; episodeId?: string }
): Promise<void> {
  if (kind === 'topics' || kind === 'story') return;
  if (!options.episodeFile && !options.episodeId) {
    throw new Error('episodeFile or episodeId is required for this job');
  }

  // After one platform succeeds, content edits stay locked — but packaging + publish
  // remain open so the same Short can still go to remaining destinations.
  if (kind !== 'publish' && kind !== 'package') {
    let episodeId = options.episodeId?.trim();
    if (!episodeId && options.episodeFile) {
      const detail = await getEpisodeDetail(options.episodeFile);
      episodeId = detail.episode.id;
    }
    if (episodeId) {
      await assertEpisodeNotPublished(episodeId, `${kind}`);
    }
  }

  if (kind === 'review' || kind === 'publish' || kind === 'package') {
    return;
  }

  if (!options.episodeFile) throw new Error('episodeFile is required for this job');
  const review = await loadReview(options.episodeFile);
  const approvals = review?.approvals || { script: false, tts: false, images: false };

  if (
    (kind === 'tts:free' ||
      kind === 'tts:elevenlabs' ||
      kind === 'tts:sarvam' ||
      kind === 'audio:plan' ||
      kind === 'audio:mix' ||
      kind === 'audio:sfx-el' ||
      kind === 'images' ||
      kind === 'images:demo') &&
    !approvals.script
  ) {
    throw new Error('Approve the script first before generating voice, sound, or images');
  }
  if (
    (kind === 'render' || kind === 'produce') &&
    !(approvals.script && approvals.tts && approvals.images)
  ) {
    throw new Error('Approve script, voice, and images before produce / combine');
  }
  if (kind === 'remotion' && !approvals.script) {
    throw new Error('Approve the script before rendering Remotion tech visuals');
  }
  if (kind === 'remotion:chrome' && !approvals.script) {
    throw new Error('Approve the script before wrapping with Remotion chrome');
  }
  // Wan/Veo I2V only needs an approved script (stills can be locked without final image approval).
  if (kind === 'animate' && !approvals.script) {
    throw new Error('Approve the script before generating AI video clips');
  }
  if (kind === 'mux:external' && !(approvals.script && approvals.tts)) {
    throw new Error('Approve script and voice before muxing an uploaded video');
  }
}
