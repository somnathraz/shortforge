import type { TechReel } from '../../../src/schema/techReel';
import type {
  EpisodeDetail,
  EpisodeReview,
  EpisodeSummary,
  InstagramMediaHosting,
  JobKind,
  JobResult,
  PackagingView,
  PublishConnection
} from './types';

export type PipelineInfo = {
  id: string;
  /** Engine: `story` (narrated cinematic Shorts) or `tech` (Remotion tech reels). */
  kind: 'story' | 'tech';
  label: string;
  blurb: string;
  studioSubtitle: string;
  defaultLanguage: 'hi' | 'en';
  publishProfiles: string[];
  visualBrand: string;
  emptyListCopy: string;
  newEpisodeLabel: string;
  theme: string;
};

// Empty until the Desk picks one; the server then falls back to its default pipeline.
let activePipelineId = '';

/** Called by PipelineProvider whenever the active pipeline changes. */
export function setApiPipelineId(id: string) {
  activePipelineId = id;
}

export function getApiPipelineId(): string {
  return activePipelineId;
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('mf.deskToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** The server says the saved login is no longer valid (e.g. it was issued before a secret change). */
function signOutExpired(): void {
  try {
    localStorage.removeItem('mf.deskToken');
    localStorage.removeItem('mf.deskUser');
  } catch {
    // ignore
  }
  if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('mf.deskToken');
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Pipeline': activePipelineId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    }
  });
  if (response.status === 401) signOutExpired();
  const data = (await response.json()) as T & {
    error?: string;
    ok?: boolean;
    stderr?: string;
    stdout?: string;
    kind?: string;
  };
  if (!response.ok) {
    const jobDetail = [data.stderr, data.stdout]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join('\n')
      .trim();
    const snippet = jobDetail
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-4)
      .join(' · ');
    throw new Error(data.error || snippet || `Request failed (${response.status})`);
  }
  return data;
}

export function listPipelines(): Promise<{
  pipelines: PipelineInfo[];
  active: string;
}> {
  return request('/api/pipelines');
}

export function listEpisodes(): Promise<{ episodes: EpisodeSummary[] }> {
  return request('/api/episodes');
}

export type TechReelSummary = {
  id: string;
  title: string;
  style: string;
  beats: number;
  output: { url: string; duration: number; stale: boolean; modifiedAt: string } | null;
  job: { status: 'running' | 'completed' | 'failed'; log: string; previewUrl?: string } | null;
};

/** Motion-studio storyboards under data/tech-reels (Tech Reels pipeline only). */
export function listTechReels(): Promise<{ reels: TechReelSummary[] }> {
  return request('/api/tech-reels');
}

export type EpisodeScriptFieldGuideItem = {
  field: string;
  required: boolean;
  note: string;
};

export function getEpisodeScriptTemplate(topic?: string): Promise<{
  template: Record<string, unknown>;
  fieldGuide: EpisodeScriptFieldGuideItem[];
  notes: string[];
  llmPrompt?: string;
  brandId?: string;
  downloadStem?: string;
}> {
  const query = `?format=legacy${topic?.trim() ? `&topic=${encodeURIComponent(topic.trim())}` : ''}`;
  return request(`/api/episodes/template${query}`);
}

function triggerBrowserDownload(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Sample episode JSON writers / LLMs should fill (same shape as import). */
export async function downloadEpisodeScriptSampleJson(topic?: string): Promise<void> {
  const payload = await getEpisodeScriptTemplate(topic);
  const stem = payload.downloadStem || 'epicastra-episode-script';
  triggerBrowserDownload(
    `${stem}-sample.json`,
    `${JSON.stringify(payload.template, null, 2)}\n`,
    'application/json'
  );
}

async function clipboardWrite(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

/** Copy sample episode JSON to clipboard (paste into LLM or Import). */
export async function copyEpisodeScriptSampleJson(topic?: string): Promise<void> {
  const payload = await getEpisodeScriptTemplate(topic);
  await clipboardWrite(`${JSON.stringify(payload.template, null, 2)}\n`);
}

/** Copy full LLM prompt (rules + embedded sample JSON) for pasting into ChatGPT/Claude. */
export async function copyEpisodeScriptLlmBrief(topic?: string): Promise<void> {
  const payload = await getEpisodeScriptTemplate(topic);
  const text =
    payload.llmPrompt?.trim() ||
    [
      'Paste this whole message into your LLM. Reply with STRICT JSON only.',
      '',
      'SAMPLE JSON:',
      JSON.stringify(payload.template, null, 2)
    ].join('\n');
  await clipboardWrite(`${text}\n`);
}

/** Ready-to-paste brief for ChatGPT/Claude: rules + sample JSON. */
export async function downloadEpisodeScriptLlmBrief(topic?: string): Promise<void> {
  const payload = await getEpisodeScriptTemplate(topic);
  const text =
    payload.llmPrompt?.trim() ||
    [
      'Paste this whole message into your LLM. Reply with STRICT JSON only.',
      '',
      ...(payload.notes || []),
      '',
      'Field guide:',
      ...(payload.fieldGuide || []).map(
        (item) => `- ${item.field}${item.required ? ' (required)' : ''}: ${item.note}`
      ),
      '',
      'SAMPLE JSON:',
      JSON.stringify(payload.template, null, 2)
    ].join('\n');
  triggerBrowserDownload(
    `${payload.downloadStem || 'epicastra-episode-script'}-llm-brief.txt`,
    `${text}\n`,
    'text/plain'
  );
}

export type ImportEpisodeIssue = { path: string; message: string };

export type ImportEpisodeResult = {
  ok: boolean;
  file?: string;
  episode?: EpisodeDetail['episode'];
  budget?: {
    sceneCount: number;
    paidMotionScenes: number;
    paidMotionSeconds: number;
    estimatedCostInr: number;
  };
  dryRun?: boolean;
  /** Set when import auto-suffixed the id (e.g. story → story-v2). */
  idRenamedFrom?: string;
  error?: string;
  issues?: ImportEpisodeIssue[];
};

export async function importEpisodeScript(body: {
  episode: unknown;
  dryRun?: boolean;
}): Promise<ImportEpisodeResult> {
  const response = await fetch('/api/episodes/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Pipeline': activePipelineId, ...authHeader() },
    body: JSON.stringify(body)
  });
  if (response.status === 401) signOutExpired();
  const data = (await response.json()) as ImportEpisodeResult;
  if (!response.ok) {
    return {
      ok: false,
      error: data.error || `Import failed (${response.status})`,
      issues: data.issues || []
    };
  }
  return data;
}

export function getEpisode(file: string, language?: 'hi' | 'en'): Promise<EpisodeDetail> {
  const query = language ? `?language=${language}` : '';
  return request(`/api/episodes/${encodeURIComponent(file)}${query}`);
}

export function deleteEpisode(
  file: string,
  options: { keepAssets?: boolean } = {}
): Promise<{
  ok: true;
  file: string;
  episodeId: string;
  keptAssets: boolean;
  removedAssets: string[];
}> {
  return request(`/api/episodes/${encodeURIComponent(file)}`, {
    method: 'DELETE',
    body: JSON.stringify({ keepAssets: options.keepAssets === true })
  });
}

export function getPackaging(
  file: string,
  language: 'hi' | 'en'
): Promise<{ packaging: PackagingView }> {
  return request(
    `/api/episodes/${encodeURIComponent(file)}/packaging?language=${language}`
  );
}

export function savePlatformPack(
  file: string,
  body: {
    language: 'hi' | 'en';
    platform: 'youtube' | 'instagram' | 'facebook';
    title: string;
    description: string;
    tags: string[];
    hashtags: string[];
    cta: string;
  }
): Promise<{ packaging: PackagingView }> {
  return request(`/api/episodes/${encodeURIComponent(file)}/packaging`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export function applyJsonTitles(file: string, language: 'hi' | 'en', target: 'all' | 'youtube' | 'instagram' | 'facebook', sharedOnly = false): Promise<{ packaging: PackagingView }> {
  return request(`/api/episodes/${encodeURIComponent(file)}/packaging/titles`, {
    method: 'POST', body: JSON.stringify({ language, target, sharedOnly })
  });
}

export function getPublishConnections(
  test = false,
  platforms?: Array<'youtube' | 'instagram' | 'facebook'>
): Promise<{ connections: PublishConnection[] }> {
  return request(test ? '/api/publish/connections/test' : '/api/publish/connections', {
    method: test ? 'POST' : 'GET',
    ...(test ? { body: JSON.stringify({ platforms }) } : {})
  });
}

export function getInstagramMediaHosting(
  episodeId?: string
): Promise<{ hosting: InstagramMediaHosting }> {
  const query = episodeId ? `?episodeId=${encodeURIComponent(episodeId)}` : '';
  return request(`/api/publish/instagram-media${query}`);
}

export function saveReview(
  file: string,
  body: Omit<EpisodeReview, 'episodeFile' | 'updatedAt' | 'approvedForProduction'>
): Promise<{ review: EpisodeReview }> {
  return request(`/api/episodes/${encodeURIComponent(file)}/review`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

/**
 * Fetch forbids non–ISO-8859-1 header values. Hindi / emoji filenames blow up
 * `X-Filename` — strip to the same ASCII shape the server sanitizes to.
 */
function headerSafeFilename(name: string, fallback: string): string {
  const base = name.split(/[/\\]/).pop() || fallback;
  const ascii = base.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '');
  if (ascii && /\.[A-Za-z0-9]+$/.test(ascii)) return ascii;
  const ext = (base.match(/\.[A-Za-z0-9]+$/) || [])[0] || '';
  return `${ascii || fallback.replace(/\.[A-Za-z0-9]+$/, '')}${ext || ''}`.replace(/^\.+/, '') || fallback;
}

function headerSafeContentType(type: string | undefined, fallback: string): string {
  if (type && /^[\x00-\x7F]+$/.test(type)) return type;
  return fallback;
}

/** Upload an externally generated video bound to this episode only (output/external/<id>/). */
export async function uploadEpisodeAudio(episodeFile: string, episodeId: string, file: File): Promise<{ path: string }> {
  const response = await fetch(`/api/episodes/${encodeURIComponent(episodeFile)}/media/audio`, {
    method: 'POST',
    headers: {
      'Content-Type': headerSafeContentType(file.type, 'audio/mpeg'),
      'X-Filename': headerSafeFilename(file.name, 'voice.mp3'),
      'X-Episode-Id': episodeId,
      'X-Pipeline': activePipelineId,
      ...authHeader()
    },
    body: file
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Voice upload failed');
  return data;
}

export async function uploadEpisodeVideo(
  episodeFile: string,
  episodeId: string,
  file: File
): Promise<{ ok: boolean; path: string; url: string; name: string; episodeId: string }> {
  const response = await fetch(`/api/episodes/${encodeURIComponent(episodeFile)}/media/video`, {
    method: 'POST',
    headers: {
      'Content-Type': headerSafeContentType(file.type, 'video/mp4'),
      'X-Filename': headerSafeFilename(file.name, 'upload.mp4'),
      'X-Episode-Id': episodeId,
      'X-Pipeline': activePipelineId,
      ...authHeader()
    },
    body: file
  });
  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    path?: string;
    url?: string;
    name?: string;
    episodeId?: string;
  };
  if (!response.ok || !data.path || !data.url) {
    throw new Error(data.error || `Video upload failed (${response.status})`);
  }
  return {
    ok: true,
    path: data.path,
    url: data.url,
    name: data.name || file.name,
    episodeId: data.episodeId || episodeId
  };
}

/** Upload a per-scene AI clip from elsewhere (output/ai-video/<id>/clips/upload/). */
export async function uploadEpisodeSceneClip(
  episodeFile: string,
  episodeId: string,
  sceneId: number,
  file: File
): Promise<{
  ok: boolean;
  path: string;
  url: string;
  name: string;
  episodeId: string;
  sceneId: number;
}> {
  const response = await fetch(`/api/episodes/${encodeURIComponent(episodeFile)}/media/clip`, {
    method: 'POST',
    headers: {
      'Content-Type': headerSafeContentType(file.type, 'video/mp4'),
      'X-Filename': headerSafeFilename(file.name, 'scene-clip.mp4'),
      'X-Episode-Id': episodeId,
      'X-Scene-Id': String(sceneId),
      'X-Pipeline': activePipelineId,
      ...authHeader()
    },
    body: file
  });
  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    path?: string;
    url?: string;
    name?: string;
    episodeId?: string;
    sceneId?: number;
  };
  if (!response.ok || !data.path || !data.url) {
    throw new Error(data.error || `Scene clip upload failed (${response.status})`);
  }
  return {
    ok: true,
    path: data.path,
    url: data.url,
    name: data.name || file.name,
    episodeId: data.episodeId || episodeId,
    sceneId: data.sceneId ?? sceneId
  };
}

/** Upload a custom still for a scene slot (output/images/<id>/scene-*-upload-*). */
export async function uploadEpisodeSceneStill(
  episodeFile: string,
  episodeId: string,
  sceneId: number,
  file: File
): Promise<{
  ok: boolean;
  path: string;
  url: string;
  name: string;
  episodeId: string;
  sceneId: number;
}> {
  const response = await fetch(`/api/episodes/${encodeURIComponent(episodeFile)}/media/still`, {
    method: 'POST',
    headers: {
      'Content-Type': headerSafeContentType(file.type, 'image/png'),
      'X-Filename': headerSafeFilename(file.name, 'scene-still.png'),
      'X-Episode-Id': episodeId,
      'X-Scene-Id': String(sceneId),
      'X-Pipeline': activePipelineId,
      ...authHeader()
    },
    body: file
  });
  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    path?: string;
    url?: string;
    name?: string;
    episodeId?: string;
    sceneId?: number;
  };
  if (!response.ok || !data.path || !data.url) {
    throw new Error(data.error || `Scene still upload failed (${response.status})`);
  }
  return {
    ok: true,
    path: data.path,
    url: data.url,
    name: data.name || file.name,
    episodeId: data.episodeId || episodeId,
    sceneId: data.sceneId ?? sceneId
  };
}

export function runJob(body: {
  kind: JobKind;
  topic?: string;
  episodeFile?: string;
  episodeId?: string;
  provider?: string;
  scene?: string;
  /** Comma-separated scene ids for partial image regen, e.g. "1,2,3". */
  scenes?: string;
  /** What is wrong / how to fix when regenerating scene images. */
  feedback?: string;
  action?: string;
  platforms?: string;
  dryRun?: boolean;
  force?: boolean;
  reuseAi?: boolean;
  focus?: string;
  count?: string;
  imageProvider?: string;
  skipCovers?: boolean;
  videoPath?: string;
  language?: 'hi' | 'en';
  requirePackaging?: boolean;
  voiceId?: string;
  /** Listener / Voice B for TWO_SPEAKER_DIALOGUE. */
  voiceIdB?: string;
  motion?: string;
    ffmpegEffects?: 'off' | 'atmosphere' | 'water';
  /** Tech A/B: remotion | ffmpeg */
  techEngine?: 'remotion' | 'ffmpeg';
  audio?: string;
  /** Comma-separated SFX effect ids for ElevenLabs generate-to-custom. */
  effects?: string;
  /** Opt-in: mix may generate missing SFX via ElevenLabs. */
  elevenlabsSfx?: boolean;
  /** User-selected BGM (relative to assets/audio/bgm/ or assets/… path). */
  bgm?: string;
  /** Heritage frame family for images:demo. */
  frameVariant?: 'HERITAGE_LIGHT' | 'HERITAGE_CLASSIC' | 'HERITAGE_DRAMATIC';
  /** Meta formats for FB/IG: "reel,story". */
  metaFormats?: string;
  /** ISO datetime to schedule publish. */
  scheduleAt?: string;
}): Promise<JobResult> {
  return request('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export type PublishScheduleRecord = {
  id: string;
  episodeId: string;
  episodeFile: string;
  platforms: Array<'youtube' | 'instagram' | 'facebook'>;
  scheduledAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  note?: string;
  error?: string;
};

export function listPublishSchedules(episodeId?: string): Promise<{
  schedules: PublishScheduleRecord[];
}> {
  const query = episodeId ? `?episodeId=${encodeURIComponent(episodeId)}` : '';
  return request(`/api/schedules${query}`);
}

export function cancelPublishSchedule(
  id: string
): Promise<{ schedule: PublishScheduleRecord }> {
  return request(`/api/schedules/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: '{}'
  });
}

export type BgmTrackView = {
  id: string;
  group: string;
  label: string;
  relativePath: string;
  url: string;
  durationSeconds?: number;
  sizeBytes: number;
};

export type BgmLibraryResponse = {
  groups: Array<{
    id: string;
    label: string;
    tracks: BgmTrackView[];
  }>;
  total: number;
};

export function listBgm(): Promise<BgmLibraryResponse> {
  return request('/api/bgm');
}

export type SfxStatusResponse = {
  effects: Array<{ effect: string; present: boolean; customPath: string }>;
  missing: string[];
};

export function getSfxStatus(effects: string[]): Promise<SfxStatusResponse> {
  const q = encodeURIComponent([...new Set(effects.filter(Boolean))].join(','));
  return request(`/api/sfx/status?effects=${q}`);
}

/** Optional: upload WAV/MP3 into assets/audio/sfx/custom/<effect>.wav. Mix skips missing without this. */
export async function uploadCustomSfx(
  effect: string,
  file: File
): Promise<{ effect: string; path: string; durationSeconds: number }> {
  const response = await fetch('/api/sfx/upload', {
    method: 'POST',
    headers: {
      'Content-Type': headerSafeContentType(file.type, 'audio/wav'),
      'X-Filename': headerSafeFilename(file.name, 'sfx.wav'),
      'X-Sfx-Effect': effect,
      'X-Pipeline': activePipelineId,
      ...authHeader()
    },
    body: file
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'SFX upload failed');
  return data;
}

export type ImagePromptItem = {
  id: 'hook' | number;
  label: string;
  kind: 'hook' | 'scene';
  visualPrompt: string;
  videoPrompt?: string;
  videoNegativePrompt?: string;
  renderMode?: 'STILL' | 'AI_VIDEO';
  finalPrompt: string;
  frameWeight: 'strong' | 'thin' | 'none';
  camera: string;
  appearingLords: string[];
};

export type ImagePromptsResponse = {
  episodeId: string;
  frameVariant: string;
  brand?: string;
  items: ImagePromptItem[];
};

export function getImagePrompts(file: string): Promise<ImagePromptsResponse> {
  return request(`/api/episodes/${encodeURIComponent(file)}/image-prompts`);
}

export type WanHealth = {
  ok: boolean;
  /** `runway` = hosted video (no GPU); absent = self-hosted Wan/ComfyUI. */
  provider?: string;
  model?: string;
  message?: string;
  creditBalance?: number;
  usdPerSecond?: number;
  backend?: string;
  url?: string;
  comfyUrl?: string;
  localPort?: string;
  remotePort?: string;
  /** SSH local forward is accepting connections on localPort. */
  tunnelOpen?: boolean;
  /** ComfyUI /system_stats answered successfully. */
  comfyOk?: boolean;
  workflow?: string;
  workflowOk?: boolean;
  workflowKind?: 'video' | 'unknown';
  workflowFamily?: 'wan2.2' | 'wan2.1' | 'unknown';
  workflowModels?: string[];
  width?: number;
  height?: number;
  fps?: number;
  maxFrames?: number;
  frames?: number;
  qualityMode?: WanQualityMode;
  qualityModeLabel?: string;
  qualityModeHint?: string;
  /** True when Wan durations follow selected TTS audio (not JSON plan alone). */
  matchTtsDuration?: boolean;
  sshHost?: string | null;
  sshPort?: string | null;
  tunnelCommand?: string;
  error?: string;
  hint?: string;
};

export type WanQualityMode = 'quality' | 'fast';

/**
 * Health often returns HTTP 503 when Comfy is offline — that body still has
 * workflowOk / tunnelOpen / hint. Do not use `request()` (throws on !ok).
 */
export async function getWanHealth(): Promise<WanHealth> {
  const response = await fetch('/api/wan/health', {
    headers: {
      'Content-Type': 'application/json',
      'X-Pipeline': activePipelineId,
      ...authHeader()
    }
  });
  let data: WanHealth;
  try {
    data = (await response.json()) as WanHealth;
  } catch {
    throw new Error(`Wan health returned non-JSON (${response.status})`);
  }
  if (typeof data.ok !== 'boolean') {
    throw new Error(data.error || `Wan health check failed (${response.status})`);
  }
  return data;
}

export type SceneVideoStatus =
  | 'not_generated'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'stale';

export type SceneVideoRecord = {
  sceneId: number;
  status: SceneVideoStatus;
  imagePath?: string;
  imageMtimeMs?: number;
  videoPath?: string;
  videoRelative?: string;
  promptId?: string;
  clientId?: string;
  error?: string;
  startedAt?: string;
  queuedAt?: string;
  finishedAt?: string;
  elapsedMs?: number;
  progressPercent?: number;
  progressLabel?: string;
  qualityMode?: WanQualityMode;
  narrationSeconds?: number;
  wanDurationSeconds?: number;
};

export type EpisodeVideoState = {
  episodeId: string;
  updatedAt: string;
  batch?: {
    mode: 'all' | 'retry' | 'one';
    total: number;
    completed: number;
    failed: number;
    currentSceneId?: number;
    running: boolean;
    progressPercent?: number;
  };
  scenes: Record<string, SceneVideoRecord>;
};

export function getWanEpisodeStatus(file: string): Promise<EpisodeVideoState> {
  return request(`/api/episodes/${encodeURIComponent(file)}/wan/status`);
}

export function startWanGenerate(
  file: string,
  body: {
    mode: 'one' | 'all' | 'retry';
    sceneId?: number;
    /** Any scene ids — not limited to AI_VIDEO. Includes 0=hook, -1=ending. */
    sceneIds?: number[];
    force?: boolean;
    videoPrompt?: string;
    videoNegativePrompt?: string;
    /** quality = 20-step baseline; fast = LightX2V 4-step LoRA. */
    qualityMode?: WanQualityMode;
  }
): Promise<EpisodeVideoState> {
  return request(`/api/episodes/${encodeURIComponent(file)}/wan/generate`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function cancelWanGenerate(file: string): Promise<EpisodeVideoState> {
  return request(`/api/episodes/${encodeURIComponent(file)}/wan/cancel`, {
    method: 'POST',
    body: '{}'
  });
}

export type ComfyJobExplain = {
  promptId: string;
  found: boolean;
  status?: string | null;
  completed?: boolean;
  reason: string;
  messages?: unknown[];
  historyUrl?: string;
};

export function explainComfyJob(promptId: string): Promise<ComfyJobExplain> {
  return request(`/api/wan/comfy-job/${encodeURIComponent(promptId)}`);
}

export function saveVisualPrompts(
  file: string,
  body: {
    hookVisualPrompt?: string;
    scenes: Array<{
      id: number;
      visualPrompt: string;
      videoPrompt?: string;
      videoNegativePrompt?: string;
    }>;
  }
): Promise<ImagePromptsResponse> {
  return request(`/api/episodes/${encodeURIComponent(file)}/image-prompts`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export type TtsVoiceOption = {
  id: string;
  label: string;
  description?: string;
  source: 'config' | 'account' | 'env' | 'shared';
  /** Free sample URL from ElevenLabs (also available via ttsVoicePreviewUrl). */
  previewUrl?: string;
  publicOwnerId?: string;
  clonedByCount?: number;
};

/** Proxied free demo sample — no TTS character cost. */
export function ttsVoicePreviewUrl(voiceId: string): string {
  return `/api/tts/voices/${encodeURIComponent(voiceId)}/preview`;
}

export function listTtsVoices(
  includeAccount = true,
  provider: 'elevenlabs' | 'sarvam' = 'elevenlabs',
  forBrand?: 'tech' | 'mythology' | 'all'
): Promise<{
  defaultVoiceId?: string;
  voices: TtsVoiceOption[];
  accountError?: string;
}> {
  const params = new URLSearchParams();
  params.set('provider', provider);
  if (!includeAccount) params.set('account', '0');
  if (forBrand) params.set('for', forBrand);
  return request(`/api/tts/voices?${params.toString()}`);
}

export type TechReelDetail = { reel: TechReel; output: TechReelSummary['output']; job: TechReelSummary['job'] };
export type TechSceneTemplateMeta = {
  id: string;
  title: string;
  pack: string;
  llm: string;
  requires: string[];
  status: 'ready' | 'draft';
};
export type TechScenePublishResult = {
  id: string;
  relativePath: string;
  formattedSource: string;
  templates: TechSceneTemplateMeta[];
  created: boolean;
};
export function getTechReel(id: string): Promise<TechReelDetail> { return request(`/api/tech-reels/${encodeURIComponent(id)}`); }
export function getTechReelTemplate(topic = ''): Promise<{ template: TechReel; llmPrompt: string }> { return request(`/api/tech-reels/template?topic=${encodeURIComponent(topic)}`); }
export function listTechSceneTemplates(): Promise<{ templates: TechSceneTemplateMeta[] }> {
  return request('/api/tech-reels/scenes');
}
export function getTechSceneTemplateSource(id: string): Promise<{ id: string; source: string; relativePath: string }> {
  return request(`/api/tech-reels/scenes?id=${encodeURIComponent(id)}`);
}
export function formatTechSceneTsx(source: string): Promise<{ source: string }> {
  return request('/api/tech-reels/scenes/format', { method: 'POST', body: JSON.stringify({ source }) });
}
export function scaffoldTechSceneTemplate(id: string): Promise<TechScenePublishResult> {
  return request('/api/tech-reels/scenes/scaffold', { method: 'POST', body: JSON.stringify({ id }) });
}
export function publishTechSceneTemplate(input: {
  id: string;
  source: string;
  title?: string;
  llm?: string;
  overwrite?: boolean;
}): Promise<TechScenePublishResult> {
  return request('/api/tech-reels/scenes', { method: 'POST', body: JSON.stringify(input) });
}
export function previewTechSceneStill(input: {
  id: string;
  headline?: string;
  subhead?: string;
  chapter?: string;
  scale?: number;
  force?: boolean;
}): Promise<{ id: string; url: string; frame: number; cached: boolean }> {
  return request('/api/tech-reels/scenes/preview', { method: 'POST', body: JSON.stringify(input) });
}
export function saveTechReel(reel: TechReel, create: boolean): Promise<{ reel: TechReel }> {
  return request(create ? '/api/tech-reels' : `/api/tech-reels/${encodeURIComponent(reel.id)}`, { method: create ? 'POST' : 'PUT', body: JSON.stringify(create ? { id: reel.id, reel } : reel) });
}
export function renderTechReel(id: string, silent: boolean, episodeId?: string): Promise<{ job: NonNullable<TechReelDetail['job']> }> {
  return request(`/api/tech-reels/${encodeURIComponent(id)}/render`, { method: 'POST', body: JSON.stringify({ provider: 'elevenlabs', silent, episodeId }) });
}
export function attachTechReelFinal(
  reelId: string,
  episodeId: string
): Promise<{ path: string; url: string; duration: number }> {
  return request(`/api/tech-reels/${encodeURIComponent(reelId)}/attach`, {
    method: 'POST',
    body: JSON.stringify({ episodeId })
  });
}

export type TechSeriesDay = {
  day: number;
  title: string;
  topic?: string;
  reelId?: string;
  templateId?: string;
};
export type TechSeries = {
  version: 1;
  id: string;
  title: string;
  pitch: string;
  days: TechSeriesDay[];
  updatedAt: string;
};
export type TechSeriesSummary = Pick<TechSeries, 'id' | 'title' | 'pitch' | 'updatedAt'> & { days: number };

export function listTechSeries(): Promise<{ series: TechSeriesSummary[] }> {
  return request('/api/tech-series');
}
export function getTechSeries(id: string): Promise<{ series: TechSeries }> {
  return request(`/api/tech-series/${encodeURIComponent(id)}`);
}
export function createTechSeries(id: string, title?: string): Promise<{ series: TechSeries }> {
  return request('/api/tech-series', { method: 'POST', body: JSON.stringify({ id, title }) });
}
export function saveTechSeries(series: TechSeries): Promise<{ series: TechSeries }> {
  return request(`/api/tech-series/${encodeURIComponent(series.id)}`, { method: 'PUT', body: JSON.stringify(series) });
}

export type McpClientSetup = {
  id: 'claude-code' | 'claude-desktop' | 'cursor' | 'other';
  label: string;
  location: string;
  kind: 'command' | 'json';
  text: string;
  steps: string[];
};

export type McpConnectInfo = {
  serverName: string;
  clients: McpClientSetup[];
  providers: Array<{ id: string; label: string; powers: string; configured: boolean }>;
  examples: string[];
};

export type McpTestResult = {
  ok: boolean;
  tools: Array<{ name: string; title?: string; description?: string }>;
  error?: string;
  ms: number;
};

export function getMcpConnectInfo(): Promise<McpConnectInfo> {
  return request('/api/mcp/connect');
}

export function testMcpConnection(): Promise<McpTestResult> {
  return request('/api/mcp/test', { method: 'POST', body: '{}' });
}
