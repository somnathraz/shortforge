/**
 * Pre-generation validation for image prompts.
 * Heritage: requires EpicAstra top-border wordmark; rejects story titles / bad locks.
 * Tech editorial: no channel wordmark (Remotion owns labels).
 */

import { paintsBorderInModel, type EpicAstraLook } from '../visual/epicastra-style.js';
import { TECH_EDITORIAL_BRAND } from '../visual/tech-editorial-style.js';

export type ImagePromptValidationIssue = {
  code: string;
  message: string;
};

export type ValidateImagePromptInput = {
  label: string;
  finalPrompt: string;
  visualPrompt: string;
  /** Defaults to EPICASTRA_HERITAGE wordmark rules when omitted. */
  brand?: 'EPICASTRA_HERITAGE' | typeof TECH_EDITORIAL_BRAND | undefined;
  /** When CINEMATIC_DEVOTIONAL_3D, in-model wordmark is not required (post-process). */
  look?: EpicAstraLook | undefined;
  appearingLords?: string[] | undefined;
  characterStates?: Record<string, string> | undefined;
  featuredLords?:
    | Array<{
        nameEn: string;
        visualIdentity: string;
        states?: Record<string, string> | undefined;
      }>
    | undefined;
  /** Names that must NOT appear in CHARACTER LOCK for this frame. */
  forbiddenLockNames?: string[] | undefined;
};

const CHILD_SCENE_RE =
  /\b(child|childhood|young girl|infant|6–8|6-8|years old|बाल|बचपन|युवती नहीं)\b/i;
const ADULT_WARRIOR_RE =
  /\b(battle armor|kurukshetra-era|warrior in armor|adult warrior|bow drawn)\b/i;
const BRAND_TEXT_RE =
  /\b(write (the )?title|paint the words of the (story|narration)|render (a |the )?caption|5 to 10 pixels)\b/i;
const STYLE_TYPO_RE = /\[STYL\](?!E)|\[STLYE\]|\[STLYE\]/i;

function extractBlock(prompt: string, name: string): string {
  const re = new RegExp(`\\[${name}\\]\\s*([\\s\\S]*?)(?=\\[[A-Z ]+\\]|$)`, 'i');
  const match = prompt.match(re);
  return match?.[1]?.trim() || '';
}

/** Names that head CHARACTER LOCK entries (ignore doNotConfuseWith tails). */
function lockEntryNames(lock: string): string[] {
  if (!lock.trim()) return [];
  return lock
    .split('|')
    .map((part) => {
      const withoutConfuse = part.replace(/Do not confuse with:[\s\S]*/i, '').trim();
      const match = withoutConfuse.match(/^(.+?)(?:\s*\[state:[^\]]+\])?\s*:/i);
      return (match?.[1] || withoutConfuse.split(':')[0] || '').trim();
    })
    .filter(Boolean);
}

/** Identity text only (no confuse tails) — for age/state checks. */
function lockIdentityText(lock: string): string {
  return lock
    .split('|')
    .map((part) => part.replace(/Do not confuse with:[\s\S]*/i, '').trim())
    .join(' | ');
}

export function validateImagePrompt(input: ValidateImagePromptInput): ImagePromptValidationIssue[] {
  const issues: ImagePromptValidationIssue[] = [];
  const prompt = input.finalPrompt || '';
  const action = extractBlock(prompt, 'SCENE ACTION') || input.visualPrompt || '';
  const lock = extractBlock(prompt, 'CHARACTER LOCK');
  const style = extractBlock(prompt, 'STYLE');
  const lockNames = lockEntryNames(lock).map((name) => name.toLowerCase());
  const lockIdentity = lockIdentityText(lock);
  const tech = input.brand === TECH_EDITORIAL_BRAND;
  // Omit look → legacy in-model frame rules (gloss/painterly tests). Pass look for 3D.
  const inModelBorder = !tech && (input.look ? paintsBorderInModel(input.look) : true);

  if (!/\[STYLE\]/i.test(prompt)) {
    issues.push({ code: 'missing_style', message: `${input.label}: missing [STYLE] block` });
  }
  if (!/\[SCENE ACTION\]/i.test(prompt)) {
    issues.push({
      code: 'missing_scene_action',
      message: `${input.label}: missing [SCENE ACTION] block`
    });
  }
  if (STYLE_TYPO_RE.test(prompt)) {
    issues.push({ code: 'style_typo', message: `${input.label}: malformed style tag` });
  }
  if (BRAND_TEXT_RE.test(prompt)) {
    issues.push({
      code: 'brand_text',
      message: tech
        ? `${input.label}: must not ask for titles/captions/story text (exact labels prefer Remotion overlays)`
        : inModelBorder
          ? `${input.label}: must not ask for titles/captions/story text (EpicAstra top-border wordmark is allowed)`
          : `${input.label}: must not ask for titles/captions/story text (brand chrome is post-processed)`
    });
  }
  if (tech) {
    if (
      /CHANNEL WORDMARK ONLY[\s\S]*EpicAstra/i.test(prompt) ||
      /\bEpicAstra\b/i.test(style)
    ) {
      issues.push({
        code: 'unexpected_epicastra_wordmark',
        message: `${input.label}: TECH_EDITORIAL must not include EpicAstra channel wordmark`
      });
    }
  } else if (inModelBorder) {
    if (!/CHANNEL WORDMARK ONLY[\s\S]*EpicAstra/i.test(prompt) && /\[STYLE\]/i.test(prompt)) {
      issues.push({
        code: 'missing_epicastra_wordmark',
        message: `${input.label}: [STYLE] must keep the EpicAstra channel wordmark in the top border`
      });
    }
  } else if (/CHANNEL WORDMARK ONLY[\s\S]*EpicAstra/i.test(prompt)) {
    issues.push({
      code: 'unexpected_epicastra_wordmark',
      message: `${input.label}: CINEMATIC_DEVOTIONAL_3D must not paint EpicAstra wordmark in-model (post-process overlay)`
    });
  }
  if (/\bsacred Indian architecture\b/i.test(style)) {
    issues.push({
      code: 'global_architecture',
      message: `${input.label}: architecture must not live in global [STYLE]`
    });
  }

  const appearing = (input.appearingLords || []).map((n) => n.trim().toLowerCase());
  const featured = input.featuredLords || [];

  if (input.appearingLords !== undefined && lock) {
    for (const name of lockNames) {
      if (!appearing.includes(name)) {
        issues.push({
          code: 'irrelevant_character_lock',
          message: `${input.label}: CHARACTER LOCK includes "${name}" but they are not in appearingLords`
        });
      }
    }
  }

  for (const forbidden of input.forbiddenLockNames || []) {
    if (lockNames.includes(forbidden.trim().toLowerCase())) {
      issues.push({
        code: 'forbidden_lock',
        message: `${input.label}: CHARACTER LOCK must not include "${forbidden}"`
      });
    }
  }

  if (CHILD_SCENE_RE.test(action) && ADULT_WARRIOR_RE.test(lockIdentity)) {
    issues.push({
      code: 'age_state_mismatch',
      message: `${input.label}: childhood scene action with adult warrior character lock`
    });
  }

  const subjectMatch = prompt.match(
    /Show\s+([^.]+?)\s+as the clear (?:dominant )?visual subject/i
  );
  if (subjectMatch?.[1]) {
    const subject = subjectMatch[1].trim().toLowerCase();
    for (const lord of featured) {
      const name = lord.nameEn.toLowerCase();
      if (!subject.includes(name) && new RegExp(`^[^.]{0,80}\\b${name}\\b`, 'i').test(action)) {
        const subjectIsOther = featured.some(
          (other) =>
            other.nameEn.toLowerCase() !== name && subject.includes(other.nameEn.toLowerCase())
        );
        if (subjectIsOther) {
          issues.push({
            code: 'subject_action_conflict',
            message: `${input.label}: subject is "${subjectMatch[1].trim()}" but SCENE ACTION leads with "${lord.nameEn}"`
          });
        }
      }
    }
  }

  if (featured.length && /\byaksha\b|यक्ष/i.test(action)) {
    const hasYaksha = featured.some((lord) => /yaksha/i.test(lord.nameEn));
    if (!hasYaksha) {
      issues.push({
        code: 'missing_supernatural_definition',
        message: `${input.label}: Yaksha appears in the scene but has no featuredLords visual identity`
      });
    }
  }

  if (/\bSTRONG heritage frame\b/i.test(prompt) && /\bTHIN heritage frame\b/i.test(prompt)) {
    issues.push({
      code: 'multiple_frame_families',
      message: `${input.label}: both THIN and STRONG frame weights present`
    });
  }

  return issues;
}

export function assertValidImagePrompt(input: ValidateImagePromptInput): void {
  const issues = validateImagePrompt(input);
  if (!issues.length) return;
  throw new Error(
    `Invalid image prompt (${input.label}):\n` +
      issues.map((issue) => `- [${issue.code}] ${issue.message}`).join('\n')
  );
}
