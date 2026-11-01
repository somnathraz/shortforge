#!/usr/bin/env node
import '../lib/loadEnv.js';
import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { planEpisodeAudio } from '../audio/sound-director.js';
import {
  BGM_MOOD_DIRS,
  SFX_LIBRARY,
  customSfxPath,
  listBgmTracks,
  resolveLibrarySfxPath
} from '../audio/sfx-library.js';
import { nextUniqueEpisodeId } from '../lib/episodeIdentity.js';
import { resolveEpisodeNarrationAudio } from '../lib/selectedAssets.js';
import {
  generateEpisode,
  STORY_PROVIDERS,
  type RequestedStoryKind,
  type StoryProvider
} from '../pipeline/generateEpisode.js';
import { suggestTrendyTopics } from '../pipeline/suggestTopics.js';
import { EpisodeSchema, type Episode } from '../schema/episode.js';
import { slugify } from '../utils/slug.js';
import { registerFactoryTools } from './factoryTools.js';

const StoryProviderSchema = z.enum(STORY_PROVIDERS);
const SoundDirectorProviderSchema = z.enum(['gemini', 'openrouter', 'groq', 'openai']);
const StoryKindSchema = z.enum(['canonical', 'lesser-known', 'fiction', 'auto']);

function textResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
  };
}

function errorResult(error: unknown) {
  return {
    isError: true as const,
    content: [
      {
        type: 'text' as const,
        text: error instanceof Error ? error.message : String(error)
      }
    ]
  };
}

function configuredProvider(raw: string | undefined, fallback: StoryProvider): StoryProvider {
  const parsed = StoryProviderSchema.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

function episodeDirectory(): string {
  return path.resolve(process.env.EPISODES_DIR || 'data/episodes');
}

function isInside(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(parent + path.sep);
}

async function resolveEpisodePath(reference: string): Promise<string> {
  const directory = episodeDirectory();
  const clean = reference.trim();
  if (!clean) throw new Error('episode is required');

  if (clean.endsWith('.json')) {
    const candidate = path.isAbsolute(clean) ? path.resolve(clean) : path.resolve(directory, clean);
    if (!isInside(directory, candidate)) {
      throw new Error('Episode files must be inside data/episodes');
    }
    await access(candidate);
    return candidate;
  }

  const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
  const byName = files.find((file) => file.toLowerCase().includes(clean.toLowerCase()));
  if (byName) return path.join(directory, byName);

  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(path.join(directory, file), 'utf8')) as {
        id?: unknown;
      };
      if (raw.id === clean) return path.join(directory, file);
    } catch {
      // Ignore malformed drafts; the normal episode UI will surface those separately.
    }
  }
  throw new Error(`No episode matching "${clean}" in data/episodes`);
}

async function loadEpisode(reference: string): Promise<{ episode: Episode; episodePath: string }> {
  const episodePath = await resolveEpisodePath(reference);
  const episode = EpisodeSchema.parse(JSON.parse(await readFile(episodePath, 'utf8')) as unknown);
  return { episode, episodePath };
}

async function saveGeneratedEpisode(episode: Episode): Promise<{ episode: Episode; file: string }> {
  const directory = episodeDirectory();
  await mkdir(directory, { recursive: true });
  const uniqueId = await nextUniqueEpisodeId(episode.id, directory);
  const savedEpisode = uniqueId === episode.id ? episode : { ...episode, id: uniqueId };
  const filename = `${Date.now()}-${slugify(savedEpisode.topic)}.json`;
  const output = path.join(directory, filename);
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(savedEpisode, null, 2)}\n`, 'utf8');
  await rename(temporary, output);
  return { episode: savedEpisode, file: path.relative(process.cwd(), output) };
}

function providerStatus() {
  return [
    {
      id: 'gemini',
      configured: Boolean((process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY)?.trim()),
      model: process.env.GOOGLE_TEXT_MODEL || 'gemini-3.8-flash',
      keyEnv: 'GOOGLE_AI_API_KEY or GEMINI_API_KEY'
    },
    {
      id: 'openrouter',
      configured: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      model: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free',
      keyEnv: 'OPENROUTER_API_KEY'
    },
    {
      id: 'groq',
      configured: Boolean(process.env.GROQ_API_KEY?.trim()),
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      keyEnv: 'GROQ_API_KEY'
    },
    {
      id: 'nvidia',
      configured: Boolean(process.env.NVIDIA_API_KEY?.trim()),
      model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
      keyEnv: 'NVIDIA_API_KEY'
    },
    {
      id: 'openai',
      configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      model: process.env.OPENAI_STORY_MODEL || 'gpt-5.6-sol',
      keyEnv: 'OPENAI_API_KEY'
    },
    {
      id: 'ollama',
      configured: true,
      model: process.env.OLLAMA_MODEL || 'qwen3:4b',
      endpoint: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
      note: 'Local provider; availability still depends on ollama serve and the model being pulled.'
    }
  ];
}

async function sfxCatalog() {
  const effects = await Promise.all(
    SFX_LIBRARY.map(async (entry) => {
      let source: 'custom' | 'library' | 'missing' = 'missing';
      try {
        await access(customSfxPath(entry.id));
        source = 'custom';
      } catch {
        try {
          await access(resolveLibrarySfxPath(entry.id));
          source = 'library';
        } catch {
          source = 'missing';
        }
      }
      return { ...entry, source };
    })
  );
  const music = await Promise.all(
    Object.entries(BGM_MOOD_DIRS).map(async ([mood]) => ({
      mood,
      tracks: (await listBgmTracks(mood as keyof typeof BGM_MOOD_DIRS)).map((track) =>
        path.relative(process.cwd(), track)
      )
    }))
  );
  return { effects, music };
}

export function createMythologyFactoryMcpServer(): McpServer {
  const server = new McpServer({ name: 'mythology-factory', version: '0.1.0' });

  server.registerTool(
    'list_llm_providers',
    {
      title: 'List factory LLM providers',
      description:
        'Shows Gemini, OpenRouter, Groq, NVIDIA, OpenAI and Ollama configuration status without returning API keys.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => textResult({ defaultProvider: process.env.STORY_PROVIDER || 'openrouter', providers: providerStatus() })
  );

  server.registerTool(
    'suggest_mythology_topics',
    {
      title: 'Suggest mythology Shorts topics',
      description:
        'Creates a structured, season-aware batch of mythology Short ideas. Scores are AI estimates, not live platform rankings.',
      inputSchema: z.object({
        provider: StoryProviderSchema.optional(),
        count: z.number().int().min(5).max(12).default(8),
        focus: z.string().max(200).optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ provider, count, focus }) => {
      try {
        const selected = provider || configuredProvider(process.env.STORY_PROVIDER, 'openrouter');
        const batch = await suggestTrendyTopics({
          provider: selected,
          count,
          ...(focus ? { focus } : {})
        });
        return textResult(batch);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'generate_story_draft',
    {
      title: 'Generate a mythology story draft',
      description:
        'Generates an episode using the selected LLM and the factory editorial/budget gates. Preview-only by default; set save=true to add a new uniquely named draft.',
      inputSchema: z.object({
        topic: z.string().min(3).max(240),
        provider: StoryProviderSchema.optional(),
        storyKind: StoryKindSchema.default('canonical'),
        save: z.boolean().default(false)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ topic, provider, storyKind, save }) => {
      try {
        const selected = provider || configuredProvider(process.env.STORY_PROVIDER, 'openrouter');
        const generated = await generateEpisode(
          topic,
          undefined,
          selected,
          storyKind as RequestedStoryKind
        );
        if (!save) return textResult({ saved: false, episode: generated });
        const saved = await saveGeneratedEpisode(generated);
        return textResult({ saved: true, file: saved.file, episode: saved.episode });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'get_sfx_catalog',
    {
      title: 'Inspect the SFX and music library',
      description:
        'Lists every whitelisted sound effect, whether a library/custom file exists, and all BGM tracks grouped by Sound Director mood.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => {
      try {
        return textResult(await sfxCatalog());
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'plan_episode_sfx',
    {
      title: 'Plan episode SFX and BGM',
      description:
        'Runs the existing tone-safe Sound Director for an episode and writes its audio-plan sidecar. It uses the selected narration when available.',
      inputSchema: z.object({
        episode: z.string().min(1).max(300),
        provider: SoundDirectorProviderSchema.optional(),
        persistOnEpisode: z.boolean().default(false)
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ episode: reference, provider, persistOnEpisode }) => {
      try {
        const { episode, episodePath } = await loadEpisode(reference);
        let narrationPath: string | undefined;
        try {
          narrationPath = await resolveEpisodeNarrationAudio({
            episodeId: episode.id,
            episodeFile: path.basename(episodePath)
          });
        } catch {
          narrationPath = undefined;
        }
        const result = await planEpisodeAudio({
          episode,
          episodePath,
          provider:
            provider ||
            process.env.SOUND_DIRECTOR_PROVIDER ||
            configuredProvider(process.env.STORY_PROVIDER, 'openrouter'),
          persistOnEpisode,
          ...(narrationPath ? { narrationPath } : {})
        });
        return textResult({
          episodeId: episode.id,
          planPath: path.relative(process.cwd(), result.planPath),
          timing: result.timeline,
          plan: result.plan,
          persistedOnEpisode: persistOnEpisode
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  registerFactoryTools(server);

  return server;
}

// stdout belongs exclusively to the MCP wire protocol. Existing pipeline
// progress messages are redirected to stderr when tools call shared code.
console.log = (...args: unknown[]) => console.error(...args);

serveStdio(() => createMythologyFactoryMcpServer(), {
  onerror: (error) => console.error(`[mythology-factory MCP] ${error.message}`)
});
