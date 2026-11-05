import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  DEFAULT_BRAND_ID,
  brandPublicView,
  isBrandId,
  listBrands,
  runWithBrandAsync,
  type BrandId
} from '../lib/brands.js';
import { createPipeline } from '../lib/pipelineScaffold.js';
import { buildScriptBundle } from '../lib/episodeScriptTemplate.js';
import { formatImportIssues, importEpisodeJson } from '../pipeline/importEpisode.js';
import { PUBLISH_PLATFORMS } from '../pipeline/publish.js';
import { fetchFactoryPublishes, fetchMultiPlatformOverview } from '../providers/multiPlatformAnalytics.js';
import { testPublishConnections } from '../ui-server/connections.js';
import { getEpisodeDetail, listEpisodes } from '../ui-server/episodes.js';
import { buildImagePromptsForEpisode, saveVisualPrompts } from '../ui-server/imagePrompts.js';
import { assertJobAllowed } from '../ui-server/jobGate.js';
import { runJob } from '../ui-server/jobs.js';
import type { JobKind } from '../ui-server/types.js';

const BrandSchema = z
  .string()
  .default(() => DEFAULT_BRAND_ID)
  .refine(isBrandId, {
    message: 'Unknown pipeline. Call list_brands to see configured ids, or create_pipeline to add one.'
  })
  .describe('Pipeline/account id (call list_brands for the configured ids; defaults to the default pipeline).');
const EpisodeFileSchema = z
  .string()
  .min(1)
  .max(200)
  .describe('Episode JSON basename from list_episodes, e.g. 1712345678-hanuman-sanjeevani.json');

/** Jobs Claude may run. Publishing has its own tool because it posts to real accounts. */
const PRODUCTION_JOBS = [
  'tts:free',
  'tts:elevenlabs',
  'tts:sarvam',
  'audio:plan',
  'audio:mix',
  'images',
  'images:demo',
  'render',
  'produce',
  'package',
  'animate'
] as const;

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }]
  };
}

/** Wrap a handler so thrown errors become MCP tool errors and the brand context is applied. */
function brandTool<T extends { brand: BrandId }>(handler: (args: T) => Promise<unknown>) {
  return async (args: T) => {
    try {
      return textResult(await runWithBrandAsync(args.brand, () => handler(args)));
    } catch (error) {
      return errorResult(error);
    }
  };
}

export function registerFactoryTools(server: McpServer): void {
  server.registerTool(
    'list_brands',
    {
      title: 'List pipelines / accounts',
      description:
        'Lists the configured pipelines (one per channel/account) with their engine kind, publish targets and default language. Empty on a fresh install: use create_pipeline.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => textResult(listBrands().map((brand) => brandPublicView(brand)))
  );

  server.registerTool(
    'create_pipeline',
    {
      title: 'Create a pipeline',
      description:
        'Creates a new pipeline (a channel with its own episodes and publish accounts). kind "story" = narrated cinematic Shorts; "tech" = Remotion tech reels. Writes config/brands/<id>.json; connect accounts afterwards in the Desk.',
      inputSchema: z.object({
        id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/, 'lowercase letters, digits, dashes; start with a letter'),
        kind: z.enum(['story', 'tech']),
        label: z.string().max(60).optional(),
        language: z.enum(['hi', 'en']).optional(),
        cta: z.string().max(200).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async (input) => {
      try {
        return textResult({ created: brandPublicView(await createPipeline(input)) });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'list_episodes',
    {
      title: 'List episodes',
      description: 'Lists episode drafts for a pipeline with their production/approval/publish state.',
      inputSchema: z.object({ brand: BrandSchema }),
      annotations: { readOnlyHint: true }
    },
    brandTool(async () => listEpisodes())
  );

  server.registerTool(
    'get_episode',
    {
      title: 'Read an episode',
      description:
        'Returns the full episode script JSON plus assets on disk and review/approval state. Use before editing or producing.',
      inputSchema: z.object({ brand: BrandSchema, file: EpisodeFileSchema }),
      annotations: { readOnlyHint: true }
    },
    brandTool(async ({ file }: { brand: BrandId; file: string }) => getEpisodeDetail(file))
  );

  server.registerTool(
    'get_script_template',
    {
      title: 'Get the episode script format',
      description:
        'Returns the empty episode JSON template, field guide and editorial rules for a pipeline. Call this BEFORE writing a script so the JSON you author passes validation.',
      inputSchema: z.object({
        brand: BrandSchema,
        topic: z.string().max(240).optional(),
        format: z.enum(['default', 'legacy']).default('default')
      }),
      annotations: { readOnlyHint: true }
    },
    brandTool(async ({ brand, topic, format }: { brand: BrandId; topic?: string | undefined; format: 'default' | 'legacy' }) => {
      const bundle = buildScriptBundle(brand, topic || '{{TOPIC}}', format);
      return {
        brandId: bundle.brandId,
        template: bundle.template,
        fieldGuide: bundle.fieldGuide,
        llmPrompt: bundle.llmPrompt,
        notes: bundle.notes
      };
    })
  );

  server.registerTool(
    'import_episode_script',
    {
      title: 'Save a script written by Claude',
      description:
        'Validates an episode script JSON authored by Claude with the same schema, editorial and budget gates as the Desk import, and (when dryRun=false) saves it as a new draft. Defaults to dryRun=true: fix the returned issues, then call again with dryRun=false.',
      inputSchema: z.object({
        brand: BrandSchema,
        script: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('Episode JSON object (or JSON string).'),
        dryRun: z.boolean().default(true)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ brand, script, dryRun }) => {
      try {
        const raw = typeof script === 'string' ? (JSON.parse(script) as unknown) : script;
        const result = await importEpisodeJson(raw, { dryRun, brandId: brand });
        return textResult({
          saved: !result.dryRun,
          file: result.file,
          episodeId: result.episode.id,
          idRenamedFrom: result.idRenamedFrom,
          budget: result.budget,
          nextStep: result.dryRun
            ? 'Valid. Call again with dryRun=false to save the draft.'
            : 'Saved. Review/approve the script in the Desk (claims need a Supported verdict), then run images/voice.'
        });
      } catch (error) {
        return {
          isError: true as const,
          content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, issues: formatImportIssues(error) }, null, 2) }]
        };
      }
    }
  );

  server.registerTool(
    'get_image_prompts',
    {
      title: 'Get scene image prompts',
      description: 'Returns the hook + per-scene image prompts exactly as they will be sent to the image model (style suffix, character lock, frame weight included).',
      inputSchema: z.object({ brand: BrandSchema, file: EpisodeFileSchema }),
      annotations: { readOnlyHint: true }
    },
    brandTool(async ({ file }: { brand: BrandId; file: string }) => buildImagePromptsForEpisode(file))
  );

  server.registerTool(
    'save_image_prompts',
    {
      title: 'Edit scene image prompts',
      description: 'Rewrites the hook and/or scene visual prompts (and Wan video prompts) in the episode file. Blocked once the episode has been published.',
      inputSchema: z.object({
        brand: BrandSchema,
        file: EpisodeFileSchema,
        hookVisualPrompt: z.string().max(4000).optional(),
        scenes: z
          .array(
            z.object({
              id: z.number().int().positive(),
              visualPrompt: z.string().min(8).max(4000),
              videoPrompt: z.string().max(4000).optional(),
              videoNegativePrompt: z.string().max(4000).optional()
            })
          )
          .max(8)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    brandTool(async ({ file, hookVisualPrompt, scenes }: {
      brand: BrandId;
      file: string;
      hookVisualPrompt?: string | undefined;
      scenes: unknown[];
    }) => {
      const detail = await getEpisodeDetail(file);
      const { assertEpisodeNotPublished } = await import('../ui-server/assets.js');
      await assertEpisodeNotPublished(detail.episode.id, 'image prompt edits');
      return saveVisualPrompts(file, { ...(hookVisualPrompt ? { hookVisualPrompt } : {}), scenes });
    })
  );

  server.registerTool(
    'run_production_step',
    {
      title: 'Run a production step',
      description:
        'Runs an existing pipeline step as a subprocess: "images" (Gemini/Pollinations stills), "animate" (scene stills → video clips; videoProvider=runway needs no GPU), tts:* (voice), audio:plan/mix, render/produce (final MP4), package (titles/captions/covers). Respects the Desk approval gates — script must be approved first (and script+voice+images before produce). Long-running; output is returned when finished.',
      inputSchema: z.object({
        brand: BrandSchema,
        kind: z.enum(PRODUCTION_JOBS),
        file: EpisodeFileSchema,
        imageProvider: z.enum(['gemini', 'pollinations']).optional().describe('For kind=images. Gemini is the paid/default quality route.'),
        scenes: z.string().max(60).optional().describe('For kind=images: e.g. "hook,1,3" to regenerate only those stills.'),
        feedback: z.string().max(1000).optional().describe('For kind=images: revision note appended to the prompt.'),
        videoProvider: z
          .enum(['runway', 'wan', 'veo'])
          .optional()
          .describe('For kind=animate (scene stills → video clips). runway = hosted, no GPU, billed in Runway credits (gen4_turbo ≈ $0.05/sec); wan = self-hosted ComfyUI; veo = Google.'),
        language: z.enum(['hi', 'en']).optional(),
        voiceId: z.string().max(100).optional(),
        force: z.boolean().optional().describe('Regenerate even if output already exists.')
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
    },
    brandTool(async ({ kind, file, imageProvider, scenes, feedback, videoProvider, language, voiceId, force }: {
      brand: BrandId;
      kind: (typeof PRODUCTION_JOBS)[number];
      file: string;
      imageProvider?: 'gemini' | 'pollinations' | undefined;
      scenes?: string | undefined;
      feedback?: string | undefined;
      videoProvider?: 'runway' | 'wan' | 'veo' | undefined;
      language?: 'hi' | 'en' | undefined;
      voiceId?: string | undefined;
      force?: boolean | undefined;
    }) => {
      await assertJobAllowed(kind as JobKind, { episodeFile: file });
      return runJob(kind as JobKind, {
        episodeFile: file,
        ...(imageProvider ? { imageProvider } : {}),
        ...(scenes ? { scenes } : {}),
        ...(feedback ? { feedback } : {}),
        ...(videoProvider ? { provider: videoProvider } : {}),
        ...(language ? { language } : {}),
        ...(voiceId ? { voiceId } : {}),
        ...(force !== undefined ? { force } : {})
      });
    })
  );

  server.registerTool(
    'check_connections',
    {
      title: 'Check Instagram / Facebook / YouTube connections',
      description: 'Tests the connected publishing accounts for a pipeline and reports connected / setup_required / error. Never returns tokens.',
      inputSchema: z.object({
        brand: BrandSchema,
        platforms: z.array(z.enum(PUBLISH_PLATFORMS)).optional()
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    brandTool(async ({ brand, platforms }: { brand: BrandId; platforms?: (typeof PUBLISH_PLATFORMS)[number][] | undefined }) =>
      testPublishConnections(platforms, brand)
    )
  );

  server.registerTool(
    'publish_episode',
    {
      title: 'Publish (or dry-run) an episode',
      description:
        'Publishes a produced Short to YouTube / Instagram / Facebook. This posts to real public accounts, so it defaults to dryRun=true; a real publish requires dryRun=false AND confirm=true, and should only be done after the user explicitly approves the episode, platforms and time.',
      inputSchema: z.object({
        brand: BrandSchema,
        file: EpisodeFileSchema,
        platforms: z.array(z.enum(PUBLISH_PLATFORMS)).min(1),
        dryRun: z.boolean().default(true),
        confirm: z.boolean().default(false).describe('Must be true for a real (non-dry-run) publish.'),
        scheduleAt: z.string().max(40).optional().describe('ISO datetime to schedule go-live.'),
        language: z.enum(['hi', 'en']).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
    },
    brandTool(async ({ file, platforms, dryRun, confirm, scheduleAt, language }: {
      brand: BrandId;
      file: string;
      platforms: (typeof PUBLISH_PLATFORMS)[number][];
      dryRun: boolean;
      confirm: boolean;
      scheduleAt?: string | undefined;
      language?: 'hi' | 'en' | undefined;
    }) => {
      if (!dryRun && !confirm) {
        throw new Error('Real publish needs confirm=true. Ask the user to approve the episode, platforms and schedule first, or use dryRun=true.');
      }
      await assertJobAllowed('publish', { episodeFile: file });
      return runJob('publish', {
        episodeFile: file,
        platforms: platforms.join(','),
        dryRun,
        ...(scheduleAt ? { scheduleAt } : {}),
        ...(language ? { language } : {})
      });
    })
  );

  server.registerTool(
    'get_analytics',
    {
      title: 'Performance analytics',
      description:
        'Views/likes/comments across YouTube, Instagram and Facebook for episodes this factory published, plus totals per platform. Optionally filter to one episode for the per-post rows.',
      inputSchema: z.object({
        brand: BrandSchema,
        platform: z.enum(['all', 'youtube', 'instagram', 'facebook']).default('all'),
        episodeId: z.string().max(200).optional().describe('If set, returns per-post rows for that episode instead of the overview.')
      }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    brandTool(async ({ platform, episodeId }: {
      brand: BrandId;
      platform: 'all' | 'youtube' | 'instagram' | 'facebook';
      episodeId?: string | undefined;
    }) =>
      episodeId
        ? fetchFactoryPublishes({ episodeId, platform, withStats: true })
        : fetchMultiPlatformOverview(platform)
    )
  );
}
