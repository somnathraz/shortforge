import type { Budget } from '../config/budget.js';
import type { Episode } from '../schema/episode.js';
import { isTechBrand } from '../lib/brands.js';
import { spokenHookText } from '../schema/voiceCast.js';

export type BudgetReport = {
  sceneCount: number;
  paidMotionScenes: number;
  paidMotionSeconds: number;
  estimatedCostInr: number;
};

function normalizeSpoken(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Strict spoken-script gate: title is never voice; spokenHook is first audio;
 * scene 1 must not repeat the hook; duration fields must match the timeline.
 */
export function assertSpokenHookPolicy(episode: Episode): void {
  const hook = spokenHookText(episode.spokenHook);
  if (!hook) {
    throw new Error(
      'Editorial gate failed: spokenHook is required (titleHi is packaging only and must not be spoken)'
    );
  }
  const duration =
    typeof episode.spokenHookDurationSeconds === 'number' &&
    Number.isFinite(episode.spokenHookDurationSeconds) &&
    episode.spokenHookDurationSeconds > 0
      ? episode.spokenHookDurationSeconds
      : episode.spokenHook &&
          typeof episode.spokenHook === 'object' &&
          typeof episode.spokenHook.estimatedDurationSeconds === 'number'
        ? episode.spokenHook.estimatedDurationSeconds
        : undefined;
  if (!duration || !(duration > 0)) {
    throw new Error('Editorial gate failed: spokenHookDurationSeconds is required with spokenHook');
  }
  const deliveryFromObject =
    episode.spokenHook && typeof episode.spokenHook === 'object'
      ? episode.spokenHook.delivery
      : undefined;
  if (!episode.hookDelivery && !deliveryFromObject) {
    throw new Error('Editorial gate failed: hookDelivery is required with spokenHook');
  }

  const hookNorm = normalizeSpoken(hook);
  if (hookNorm === normalizeSpoken(episode.titleHi) || hookNorm === normalizeSpoken(episode.titleEn)) {
    throw new Error('Editorial gate failed: spokenHook must not copy titleHi/titleEn');
  }

  const scene1 = episode.scenes[0]?.narrationHi?.trim() || '';
  const sceneNorm = normalizeSpoken(scene1);
  if (!scene1) {
    throw new Error('Editorial gate failed: scene 1 narration is required after spokenHook');
  }
  if (sceneNorm === hookNorm || sceneNorm.startsWith(hookNorm) || hookNorm.startsWith(sceneNorm)) {
    throw new Error('Editorial gate failed: scene 1 must not repeat spokenHook');
  }
  const hookLead = hookNorm.slice(0, Math.min(48, Math.floor(hookNorm.length * 0.7)));
  if (hookLead.length >= 24 && sceneNorm.includes(hookLead)) {
    throw new Error('Editorial gate failed: scene 1 must not reuse the spokenHook opening line');
  }
}

/** Script must name visual subjects so image generation does not invent the wrong figure. */
export function assertFeaturedLordsPolicy(episode: Episode): void {
  const lords = episode.featuredLords || [];
  if (!lords.length) {
    throw new Error(
      episode.storyKind === 'TECH_EDUCATION'
        ? 'Editorial gate failed: featuredLords is required (name diagram/UI subjects for image locks)'
        : 'Editorial gate failed: featuredLords is required (story AI must name each lord for image generation)'
    );
  }
  if (!lords.some((lord) => lord.importance === 'primary')) {
    throw new Error('Editorial gate failed: featuredLords needs at least one primary lord');
  }
  for (const lord of lords) {
    if (!lord.visualIdentity.trim() || !lord.doNotConfuseWith.trim()) {
      throw new Error(`Editorial gate failed: featuredLord "${lord.nameEn}" needs visualIdentity and doNotConfuseWith`);
    }
  }
}

export function assertEditorialPolicy(episode: Episode): void {
  const isFiction = episode.storyKind === 'ORIGINAL_MYTH_FICTION';
  const isTech = episode.storyKind === 'TECH_EDUCATION';

  if (isFiction) {
    if (episode.sourceReview.status !== 'FICTION' || !episode.fictionDisclosureRequired) {
      throw new Error('Editorial gate failed: original fiction must be marked FICTION and require disclosure');
    }
    assertSpokenHookPolicy(episode);
    assertFeaturedLordsPolicy(episode);
    return;
  }

  if (episode.sourceReview.status !== 'NEEDS_REVIEW') {
    throw new Error(
      isTech
        ? 'Editorial gate failed: tech education must be marked NEEDS_REVIEW'
        : 'Editorial gate failed: mythology must be marked NEEDS_REVIEW'
    );
  }
  if (episode.fictionDisclosureRequired) {
    throw new Error(
      isTech
        ? 'Editorial gate failed: tech education cannot be labelled as original fiction'
        : 'Editorial gate failed: mythology cannot be labelled as original fiction'
    );
  }
  if (episode.sourceReview.claimsToVerify.length === 0) {
    throw new Error(
      isTech
        ? 'Editorial gate failed: tech education must list accuracy claims to verify'
        : 'Editorial gate failed: mythology must list claims to verify'
    );
  }
  if (isTech && episode.brandId && !isTechBrand(episode.brandId)) {
    throw new Error('Editorial gate failed: TECH_EDUCATION requires a tech-kind pipeline');
  }
  assertSpokenHookPolicy(episode);
  assertFeaturedLordsPolicy(episode);
}

/** Long connected katha masters (import) exceed Short scene/duration caps but still pay-wall AI_VIDEO. */
export function isLongFormEpisode(episode: Episode, budget: Budget): boolean {
  return (
    episode.scenes.length > budget.maxScenes ||
    episode.targetDurationSeconds > Math.max(60, budget.targetDurationSeconds)
  );
}

export function assertBudgetPolicy(episode: Episode, budget: Budget): BudgetReport {
  const paid = episode.scenes.filter((scene) => scene.renderMode === 'AI_VIDEO');
  const report: BudgetReport = {
    sceneCount: episode.scenes.length,
    paidMotionScenes: paid.length,
    paidMotionSeconds: paid.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    estimatedCostInr: 0
  };
  report.estimatedCostInr = report.paidMotionSeconds * budget.paidMotionCostPerSecondInr;

  const failures: string[] = [];
  const longForm = isLongFormEpisode(episode, budget);
  // Long-form masters may have many STILL/AI-tagged beats; still enforce paid-motion budget.
  if (!longForm && report.sceneCount > budget.maxScenes) {
    failures.push(`${report.sceneCount} scenes exceeds ${budget.maxScenes}`);
  }
  if (report.paidMotionScenes > budget.maxPaidMotionScenes) failures.push(`${report.paidMotionScenes} paid scenes exceeds ${budget.maxPaidMotionScenes}`);
  if (report.paidMotionSeconds > budget.maxPaidMotionSeconds) failures.push(`${report.paidMotionSeconds}s paid motion exceeds ${budget.maxPaidMotionSeconds}s`);
  if (report.estimatedCostInr > budget.maxCostPerShortInr) failures.push(`₹${report.estimatedCostInr} estimated cost exceeds ₹${budget.maxCostPerShortInr}`);
  if (failures.length) throw new Error(`Budget guard failed: ${failures.join('; ')}`);

  return report;
}

export function routeWithinBudget(episode: Episode, budget: Budget): Episode {
  const routed = structuredClone(episode);
  const lowestPriorityFirst = routed.scenes
    .filter((scene) => scene.renderMode === 'AI_VIDEO')
    .sort((left, right) => left.importance - right.importance || right.durationSeconds - left.durationSeconds);

  while (lowestPriorityFirst.length > 0) {
    try {
      assertBudgetPolicy(routed, budget);
      return routed;
    } catch {
      const scene = lowestPriorityFirst.shift();
      if (scene) scene.renderMode = 'STILL';
    }
  }

  assertBudgetPolicy(routed, budget);
  return routed;
}
