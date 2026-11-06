import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  ArrowRightIcon,
  BadgeCheckIcon,
  ClapperboardIcon,
  ClipboardPasteIcon,
  CopyIcon,
  ExternalLinkIcon,
  ImageIcon,
  LanguagesIcon,
  MicIcon,
  Music2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  BotIcon
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteEpisode,
  getEpisode,
  getPackaging,
  savePlatformPack,
  applyJsonTitles,
  getPublishConnections,
  getInstagramMediaHosting,
  listEpisodes,
  listTechReels,
  listTechSceneTemplates,
  getSfxStatus,
  uploadCustomSfx,
  listTtsVoices,
  listPublishSchedules,
  cancelPublishSchedule,
  uploadEpisodeVideo,
  uploadEpisodeAudio,
  uploadEpisodeSceneClip,
  uploadEpisodeSceneStill,
  getImagePrompts,
  downloadEpisodeScriptLlmBrief,
  downloadEpisodeScriptSampleJson,
  copyEpisodeScriptLlmBrief,
  copyEpisodeScriptSampleJson,
  runJob,
  saveReview,
  ttsVoicePreviewUrl,
  type PublishScheduleRecord,
  type TtsVoiceOption
} from '@/lib/api';
import { ImagePromptsDialog } from '@/components/image-prompts-dialog';
import { StillUploadDialog } from '@/components/still-upload-dialog';
import { VideoExperiments } from '@/components/video-experiments';
import { SceneVisualEditor } from '@/components/scene-visual-editor';
import { TechProducePanel } from '@/components/tech-produce-panel';
import { TechScenesPanel } from '@/components/tech-scenes-panel';
import { WanSceneRenderer } from '@/components/wan-scene-renderer';
import { requiredImageIds, missingVisuals, visualSource, visualRows } from '@/lib/visual-plan';
import type {
  AssetFile,
  ClaimVerdict,
  EpisodeDetail,
  EpisodeSummary,
  InstagramMediaHosting,
  JobKind,
  JobResult,
  PhaseApprovals,
  PipelinePhase,
  PlatformPackView,
  PublishConnection,
  SceneAsset,
  SelectedAssets
} from '@/lib/types';
import {
  PhaseStepper,
  PHASES,
  phasesForPipeline,
  completedPhaseCount,
  getPhaseStatus,
  pickActivePhase,
  type PhaseAssets
} from '@/components/phase-stepper';
import { PastePackDialog } from '@/components/paste-pack-dialog';
import { ImportScriptDialog } from '@/components/import-script-dialog';
import { BgmPickerDialog, type SelectedBgm } from '@/components/bgm-picker-dialog';
import { PipelineSwitcher } from '@/components/pipeline-switcher';
import { ConnectAiBanner, ConnectAiDialog } from '@/components/connect-ai-dialog';
import { usePipeline } from '@/lib/pipeline';
import { useAuth } from '@/lib/auth';
import { Link, useNavigate } from 'react-router-dom';
import {
  PublishAllDialog,
  extractPublishUrl,
  type PlatformUploadState,
  type PublishPlatformId
} from '@/components/publish-all-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { hasSpokenHook, spokenHookDisplayText } from '@/lib/spoken-hook';
import { cn } from '@/lib/utils';

const VERDICTS: { value: ClaimVerdict; label: string }[] = [
  { value: 'unchecked', label: 'Unchecked' },
  { value: 'supported', label: 'Supported' },
  { value: 'unsupported', label: 'Unsupported' },
  { value: 'needs-source', label: 'Needs source' }
];

function emptyApprovals(): PhaseApprovals {
  return { script: false, tts: false, images: false };
}

function emptySelected(): SelectedAssets {
  return {};
}

function mediaPathFromUrl(url: string): string {
  const clean = url.split(/[?#]/, 1)[0] || '';
  return clean.startsWith('/api/media/') ? clean.slice('/api/media/'.length) : clean.replace(/^\/+/, '');
}

function publishMatchesCurrentVideo(
  production: EpisodeDetail['assets']['production'],
  videoPath?: string
): boolean {
  if (!videoPath) return true;
  if (!production?.finalVideo) return false;
  const current = mediaPathFromUrl(production.finalVideo);
  return videoPath.replaceAll('\\', '/').endsWith(current);
}

function savedPublishState(production: EpisodeDetail['assets']['production']): Partial<
  Record<PublishPlatformId, { url?: string; status: 'uploaded' | 'scheduled' }>
> {
  const saved: Partial<
    Record<PublishPlatformId, { url?: string; status: 'uploaded' | 'scheduled' }>
  > = {};
  for (const item of production?.publish?.results || []) {
    if (
      (item.platform === 'youtube' || item.platform === 'instagram' || item.platform === 'facebook') &&
      (item.status === 'uploaded' || item.status === 'scheduled') &&
      !item.error &&
      publishMatchesCurrentVideo(production, item.videoPath)
    ) {
      saved[item.platform] = {
        status: item.status,
        ...(item.url ? { url: item.url } : {})
      };
    }
  }
  return saved;
}

function selectedImageMapsMatch(
  left?: Record<string, string>,
  right?: Record<string, string>
): boolean {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function defaultScheduleLocalValue(hoursAhead = 1): string {
  const date = new Date(Date.now() + hoursAhead * 60 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localScheduleToIso(localValue: string): string {
  const trimmed = localValue.trim();
  if (!trimmed) throw new Error('Pick a schedule date and time');
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid schedule time');
  const min = Date.now() + 15 * 60_000;
  if (date.getTime() < min) throw new Error('Schedule must be at least 15 minutes from now');
  return date.toISOString();
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
}

function asAudioFiles(audio: EpisodeDetail['assets']['audio']): AssetFile[] {
  return (audio || []).map((item, index) => {
    if (typeof item === 'string') {
      const path = mediaPathFromUrl(item);
      return {
        url: item,
        path,
        name: path.split('/').pop() || `audio-${index + 1}.mp3`,
        mtimeMs: 0,
        provider: 'tts'
      };
    }
    return item;
  });
}

/** Only takes whose filename includes this episode id. */
function episodeAudioFiles(
  audio: EpisodeDetail['assets']['audio'],
  episodeId: string
): AssetFile[] {
  return asAudioFiles(audio).filter(
    (file) => file.name.includes(episodeId) || file.path.includes(`/${episodeId}`)
  );
}

function isMixedAudio(file: AssetFile): boolean {
  const name = file.name.toLowerCase();
  return name.includes('final-mix') || name.includes('sfx-mix');
}

function narrationTakes(audio: EpisodeDetail['assets']['audio'], episodeId: string): AssetFile[] {
  return episodeAudioFiles(audio, episodeId).filter((file) => !isMixedAudio(file));
}

function mixedTakes(audio: EpisodeDetail['assets']['audio'], episodeId: string): AssetFile[] {
  return episodeAudioFiles(audio, episodeId)
    .filter((file) => isMixedAudio(file))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Bust browser/audio-element cache when the same path is overwritten. */
function mediaUrlWithCacheBust(file: Pick<AssetFile, 'url' | 'mtimeMs'>): string {
  const base = file.url;
  const version = file.mtimeMs || Date.now();
  return `${base}${base.includes('?') ? '&' : '?'}v=${version}`;
}

function clipCandidatesFor(scene: SceneAsset): AssetFile[] {
  const fromApi = scene.clipCandidates || [];
  const list =
    fromApi.length > 0
      ? [...fromApi]
      : (() => {
          const fallback: AssetFile[] = [];
          const push = (url: string | undefined, provider: string) => {
            if (!url) return;
            const path = mediaPathFromUrl(url);
            if (fallback.some((f) => f.path === path)) return;
            fallback.push({
              url,
              path,
              name: path.split('/').pop() || `${provider}.mp4`,
              mtimeMs: 0,
              provider
            });
          };
          push(scene.veoClip, 'veo');
          push(scene.clip, scene.clip?.includes('veo') ? 'veo' : 'clip');
          return fallback;
        })();

  // Desktop: left = still/ffmpeg/other, right = Veo
  const rank = (provider?: string) => {
    const p = (provider || '').toLowerCase();
    if (p === 'veo' || p.includes('veo')) return 2;
    if (p === 'wan' || p.includes('wan')) return 1;
    return 0;
  };
  return list.sort((a, b) => rank(a.provider) - rank(b.provider) || a.name.localeCompare(b.name));
}

/** Full-length assembled Shorts only (not ~8s scene clips). */
function isFullAssembledPath(pathOrUrl: string): boolean {
  const p = mediaPathFromUrl(pathOrUrl);
  if (!p.endsWith('.mp4')) return false;
  if (p.includes('/clips/') || p.includes('/scene-clips/')) return false;
  const name = p.split('/').pop() || '';
  if (/^scene-\d+/i.test(name)) return false;
  return true;
}

/** Title/description/tags must be real copy — not empty or blank-pack TODOs. */
function packCopyReady(
  pack?: Pick<PlatformPackView, 'title' | 'description' | 'tags' | 'hashtags'> | null
): boolean {
  if (!pack) return false;
  const title = pack.title.trim();
  const description = pack.description.trim();
  return (
    title.length >= 3 &&
    !/^TODO\b/i.test(title) &&
    description.length >= 20 &&
    !/^TODO\b/i.test(description) &&
    pack.tags.length > 0 &&
    pack.hashtags.length > 0
  );
}

/** Parse `…-final-YYYYMMDD-HHMMSS…` so newest Remotion cuts sort first. */
function finalStamp(pathOrUrl: string): number {
  const match = mediaPathFromUrl(pathOrUrl).match(/final-(\d{8})-(\d{6})/);
  return match ? Number(`${match[1]}${match[2]}`) : 0;
}

function assembledFinalOptions(detail: EpisodeDetail): AssetFile[] {
  const out: AssetFile[] = [];
  const push = (url: string | undefined, provider: string, label?: string) => {
    if (!url || !isFullAssembledPath(url)) return;
    const path = mediaPathFromUrl(url);
    if (out.some((f) => f.path === path)) return;
    const name = path.split('/').pop() || 'assembled.mp4';
    const engine = name.includes('-chrome')
      ? 'remotion-chrome'
      : name.includes('-remotion')
        ? 'remotion-final'
        : name.includes('-ffmpeg')
          ? 'ffmpeg-final'
          : provider;
    out.push({
      url: url.startsWith('/api/media/') ? url : `/api/media/${path}`,
      path,
      name: label || name,
      mtimeMs: finalStamp(path),
      provider: engine
    });
  };
  for (const url of detail.assets.veo || []) {
    push(url, 'veo-assembled', 'Veo assembled Short');
  }
  for (const url of detail.assets.video || []) {
    push(url, 'ffmpeg-stills', 'FFmpeg Ken-Burns Short');
  }
  for (const url of detail.assets.final || []) {
    push(url, 'final');
  }
  push(detail.assets.production?.finalVideo, 'final');

  // Newest production cut first; Remotion/ffmpeg finals ahead of stills/veo fallbacks.
  const rank = (provider?: string) => {
    const value = provider || '';
    if (value.includes('chrome')) return 4;
    if (value.includes('remotion')) return 3;
    if (value.includes('final') || value.includes('ffmpeg-final')) return 2;
    if (value.includes('stills')) return 1;
    return 0;
  };
  return out.sort(
    (a, b) => rank(b.provider) - rank(a.provider) || b.mtimeMs - a.mtimeMs
  );
}

function finalOptionLabel(file: AssetFile): string {
  const provider = file.provider || '';
  const name = file.name || file.path || '';
  if (name.includes('external-mux') || provider.includes('external-mux')) {
    return 'Uploaded video + app audio';
  }
  if (provider.includes('veo')) return 'Veo assembled final';
  if (provider.includes('stills')) return 'FFmpeg Ken-Burns final';
  if (provider.includes('chrome') || name.includes('-chrome')) {
    return 'Remotion chrome final (intro/outro)';
  }
  if (provider.includes('remotion') || name.includes('-remotion')) {
    return 'Remotion tech visual final';
  }
  if (name.includes('-ffmpeg') || provider.includes('ffmpeg-final')) {
    return 'FFmpeg SVG tech final';
  }
  return 'Merged final Short';
}

function toPhaseAssets(summary: EpisodeSummary | null, detail: EpisodeDetail | null): PhaseAssets | null {
  if (detail) {
    return {
      hasAudio: detail.assets.audio.length > 0,
      hasImages: detail.assets.images.some(
        (s) => Boolean(s.image) || (s.clipCandidates?.length ?? 0) > 0
      ),
      hasVideo: detail.assets.video.length > 0,
      hasVeo:
        detail.assets.veo.length > 0 ||
        detail.assets.images.some(
          (s) => Boolean(s.veoClip) || clipCandidatesFor(s).some((c) => c.provider === 'veo')
        ),
      hasFinal: assembledFinalOptions(detail).length > 0,
      productionStatus: detail.assets.production?.reviewStatus || null,
      productionStale: Boolean(detail.assets.production?.staleReason),
      hasPublished: Boolean(
        detail.assets.production?.publish?.results.some(
          (item) =>
            (item.status === 'uploaded' || item.status === 'scheduled') &&
            !item.error &&
            publishMatchesCurrentVideo(detail.assets.production, item.videoPath)
        )
      )
    };
  }
  if (!summary) return null;
  return {
    hasAudio: summary.assets.hasAudio,
    hasImages: summary.assets.hasImages,
    hasVideo: summary.assets.hasVideo,
    hasVeo: summary.assets.hasVeo,
    hasFinal: summary.assets.hasFinal,
    productionStatus: summary.assets.productionStatus,
    productionStale: summary.assets.productionStale,
    hasPublished: summary.assets.hasPublished
  };
}

function phaseInstruction(
  phase: PipelinePhase,
  creating: boolean,
  detail: EpisodeDetail | null,
  approvals: PhaseApprovals,
  selected: SelectedAssets,
  isTech = false
): string {
  if (phase === 'script') {
    if (creating || !detail) {
      return 'Enter a topic and generate a script, or import your own structured episode JSON.';
    }
    if (!approvals.script) return 'Read the scenes, check each factual claim, then approve the script.';
    return 'The script is approved. Continue to Voice.';
  }
  if (phase === 'tts') {
    if (!detail?.assets.audio.length) return 'Choose a voice engine and generate the narration.';
    if (!selected.audio) return 'Listen to the available narrations and select one.';
    if (!approvals.tts) return 'Approve the selected narration to continue.';
    return isTech
      ? 'Voice is approved. Continue to Scenes.'
      : 'Voice is approved. Continue to Visuals.';
  }
  if (phase === 'images') {
    if (isTech) {
      if (!approvals.images) {
        return 'Pick or edit scene TSX, optionally generate a static still preview, then continue to Produce.';
      }
      return 'Scenes step done. Continue to Produce to create the video, then Review.';
    }
    if (!detail) return 'Choose uploaded video or artwork for each section, then generate the images you need.';
    const hasAnyVisual =
      detail.assets.images.some((item) => Boolean(item.image)) ||
      Boolean(selected.clips && Object.keys(selected.clips).length);
    if (!hasAnyVisual) {
      return 'Choose uploaded video or artwork for each section, then generate the images you need.';
    }
    if (!approvals.images) {
      return 'Visual plan saved. Click Approve visuals → Produce when the sections look right (hook/ending videos do not need stills).';
    }
    return 'Visual plan approved. Continue to Produce.';
  }
  if (phase === 'produce') {
    if (detail?.assets.production?.staleReason) {
      return detail.assets.production.staleReason;
    }
    if (!detail?.assets.final.length && !detail?.assets.production?.finalVideo) {
      return 'Merge your approved visual plan with narration into one vertical Short.';
    }
    return 'A final video is ready. Continue to Review and watch it end to end.';
  }
  if (phase === 'review') {
    if (detail?.assets.production?.reviewStatus !== 'APPROVED') {
      return 'Watch the complete video. Approve it, reject it, or request a scene regeneration.';
    }
    return 'The final video is approved. Continue to Publish.';
  }
  if (!detail?.packaging) return 'Generate titles, post copy, tags, and cover assets for each platform.';
  return 'Generate a delivery pack, pick one connected account, confirm title & description, then upload or schedule. Use Publish all for multiple accounts.';
}

function phaseStatusLabel(status: ReturnType<typeof getPhaseStatus>): string {
  if (status === 'approved' || status === 'done') return 'Complete';
  if (status === 'review') return 'Needs review';
  if (status === 'ready') return 'Ready now';
  if (status === 'locked') return 'Waiting';
  return 'To do';
}

function assetSource(provider?: string, path?: string): { label: string; tone: 'free' | 'paid' | 'local' } {
  const value = `${provider || ''} ${path || ''}`.toLowerCase();
  if (value.includes('edge')) return { label: 'Edge TTS · Free', tone: 'free' };
  if (value.includes('eleven')) return { label: 'ElevenLabs · Paid', tone: 'paid' };
  if (value.includes('upload')) {
    return {
      label: /\.(png|jpe?g|webp)$/i.test(path || '') ? 'Uploaded still' : 'Uploaded clip',
      tone: 'local'
    };
  }
  if (value.includes('pollination') || /\.jpe?g$/i.test(path || '')) {
    return { label: 'Pollinations · Free', tone: 'free' };
  }
  if (value.includes('gemini') || /\.png$/i.test(path || '')) {
    return { label: 'Gemini · Paid', tone: 'paid' };
  }
  if (value.includes('veo')) return { label: 'Veo · Paid', tone: 'paid' };
  if (value.includes('wan')) return { label: 'Wan · Self-hosted', tone: 'local' };
  if (value.includes('sound-director') || /(?:final|sfx)-mix/i.test(path || '')) {
    return { label: 'Audio mix · Local', tone: 'local' };
  }
  if (value.includes('ffmpeg') || value.includes('final')) {
    return { label: 'FFmpeg · Local', tone: 'local' };
  }
  if (/\.mp3$/i.test(path || '') || provider === 'tts') {
    return { label: 'TTS · Unknown provider', tone: 'local' };
  }
  return { label: 'Local asset', tone: 'local' };
}

function SourceTag({ provider, path }: { provider?: string; path?: string }) {
  const source = assetSource(provider, path);
  return <span className={cn('source-tag', `source-tag-${source.tone}`)}>{source.label}</span>;
}

export default function App() {
  const {
    ready: pipelineReady,
    needsGate,
    pipelineId,
    pipeline,
    isTech,
    isTechPipeline,
    readSelectedEpisode,
    storeSelectedEpisode
  } = usePipeline();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [connectAiOpen, setConnectAiOpen] = useState(false);
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [phase, setPhase] = useState<PipelinePhase>('script');
  const [claimVerdicts, setClaimVerdicts] = useState<Record<string, ClaimVerdict>>({});
  const [approvals, setApprovals] = useState<PhaseApprovals>(emptyApprovals());
  const [selectedAssets, setSelectedAssets] = useState<SelectedAssets>(emptySelected());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [activeJob, setActiveJob] = useState<JobKind | null>(null);
  const [publishAction, setPublishAction] = useState<'dry-run' | 'upload' | 'schedule' | null>(null);
  const [jobLog, setJobLog] = useState<JobResult | null>(null);
  const [topic, setTopic] = useState('Why Hanuman forgot his powers');
  const [storyProvider, setStoryProvider] = useState('openrouter');
  const [imageProvider, setImageProvider] = useState('pollinations');
  const [frameVariant, setFrameVariant] = useState<
    'HERITAGE_LIGHT' | 'HERITAGE_CLASSIC' | 'HERITAGE_DRAMATIC'
  >('HERITAGE_CLASSIC');
  /** Scene opened in the “what’s wrong?” regenerate dialog. */
  const [imageFixScene, setImageFixScene] = useState<number | null>(null);
  const [imageFixFeedback, setImageFixFeedback] = useState('');
  const [imageFixBusy, setImageFixBusy] = useState(false);
  const [stillUploadScene, setStillUploadScene] = useState<number | null>(null);
  const [stillUploadBusy, setStillUploadBusy] = useState(false);
  const [copyPromptScene, setCopyPromptScene] = useState<number | null>(null);
  const [imagePromptsOpen, setImagePromptsOpen] = useState(false);
  /** Effect ids tagged for optional ElevenLabs SFX generation (saved to custom/). */
  const [sfxElEffects, setSfxElEffects] = useState<string[]>([]);
  /** Library/custom presence for planned cues — missing ones are skipped on mix (upload optional). */
  const [sfxMissing, setSfxMissing] = useState<string[]>([]);
  const [sfxUploadBusy, setSfxUploadBusy] = useState<string | null>(null);
  const [bgmPickerOpen, setBgmPickerOpen] = useState(false);
  const [selectedBgm, setSelectedBgm] = useState<SelectedBgm | null>(null);

  const [ttsKind, setTtsKind] = useState<'tts:free' | 'tts:elevenlabs' | 'tts:sarvam'>('tts:free');
  const [elevenVoices, setElevenVoices] = useState<TtsVoiceOption[]>([]);
  /** Tech default = Rahul; picker loads all Indian-English shared voices. */
  const TECH_RAHUL_VOICE_ID = 'u7bRcYbD7visSINTyAT8';
  const [elevenVoiceId, setElevenVoiceId] = useState('');
  /** Listener / Voice B for TWO_SPEAKER_DIALOGUE episodes. */
  const [elevenVoiceIdB, setElevenVoiceIdB] = useState('');
  const [sarvamVoices, setSarvamVoices] = useState<TtsVoiceOption[]>([]);
  const [sarvamVoiceId, setSarvamVoiceId] = useState('');
  /** Listener / Voice B for TWO_SPEAKER_DIALOGUE on Sarvam. */
  const [sarvamVoiceIdB, setSarvamVoiceIdB] = useState('');
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [produceProvider, setProduceProvider] = useState('wan');
  const [ffmpegEffects, setFfmpegEffects] = useState<'off' | 'atmosphere' | 'water'>('off');
  const [motionLevel, setMotionLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [techVisualEngine, setTechVisualEngine] = useState<'remotion' | 'ffmpeg'>('remotion');
  const [reuseAi, setReuseAi] = useState(true);
  const [reviewScene, setReviewScene] = useState('');
  const [showReviewAlternatives, setShowReviewAlternatives] = useState(false);
  const [activePublishPlatform, setActivePublishPlatform] = useState<PublishPlatformId>('instagram');
  const [topicFocus, setTopicFocus] = useState('');
  const [pastePackOpen, setPastePackOpen] = useState(false);
  const [importScriptOpen, setImportScriptOpen] = useState(false);
  const [publishAllOpen, setPublishAllOpen] = useState(false);
  const [packageImageProvider, setPackageImageProvider] = useState('none');
  const [packageLanguage, setPackageLanguage] = useState<'hi' | 'en'>('hi');
  const [skipCovers, setSkipCovers] = useState(true);
  const [connections, setConnections] = useState<PublishConnection[]>([]);
  const [checkingConnections, setCheckingConnections] = useState(false);
  const [instagramHosting, setInstagramHosting] = useState<InstagramMediaHosting | null>(null);
  const [packConfirmed, setPackConfirmed] = useState<Partial<Record<PublishPlatformId, boolean>>>(
    {}
  );
  const [customPack, setCustomPack] = useState(false);
  const [packDraft, setPackDraft] = useState<{
    title: string;
    description: string;
    tags: string;
    hashtags: string;
    cta: string;
  } | null>(null);
  const [savingPack, setSavingPack] = useState(false);
  const [metaPublishReel, setMetaPublishReel] = useState(true);
  const [metaPublishStory, setMetaPublishStory] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState('');
  const [publishSchedules, setPublishSchedules] = useState<PublishScheduleRecord[]>([]);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [publishDone, setPublishDone] = useState<
    Partial<Record<PublishPlatformId, { url?: string; status: 'uploaded' | 'scheduled' }>>
  >({});
  const [generationOpen, setGenerationOpen] = useState<Partial<Record<PipelinePhase, boolean>>>({});
  const activeEpisodeRef = useRef(selectedFile);
  useEffect(() => { activeEpisodeRef.current = selectedFile; }, [selectedFile]);
  const [deleteTarget, setDeleteTarget] = useState<EpisodeSummary | null>(null);
  const [keepAssetsOnDelete, setKeepAssetsOnDelete] = useState(false);
  const [deletingEpisode, setDeletingEpisode] = useState(false);

  const selectedSummary = useMemo(
    () => episodes.find((item) => item.file === selectedFile) || null,
    [episodes, selectedFile]
  );
  const phaseAssets = toPhaseAssets(creating ? null : selectedSummary, creating ? null : detail);
  const pipelinePhases = phasesForPipeline(isTech);
  const doneCount = completedPhaseCount(Boolean(detail) && !creating, phaseAssets, approvals);
  const progressValue = Math.round((doneCount / pipelinePhases.length) * 100);
  const phaseMeta = pipelinePhases.find((item) => item.id === phase)!;
  const phaseIndex = pipelinePhases.findIndex((item) => item.id === phase);
  const phaseStatus = getPhaseStatus(
    phase,
    Boolean(detail) && !creating,
    phaseAssets,
    approvals
  );
  const episodePublished = Boolean(phaseAssets?.hasPublished);
  const currentInstruction = episodePublished
    ? isTech
      ? 'At least one platform is live. Script/voice/images/produce stay locked — you can still fix Instagram post copy.'
      : 'At least one platform is live. Script/voice/images/produce stay locked — you can still fix post copy and upload to Facebook / Instagram / YouTube that are not done yet.'
    : generationOpen[phase]
      ? 'Generation is reopened. Adjust the settings and create one new version, then review it.'
      : phaseInstruction(phase, creating, detail, approvals, selectedAssets, isTech);
  const generationLocked = {
    script: episodePublished || Boolean(detail && !creating && !generationOpen.script),
    // Only lock after voice is approved — old on-disk MP3s must not block new generation.
    tts: episodePublished || Boolean(approvals.tts && !generationOpen.tts),
    images: episodePublished || Boolean(approvals.images && !generationOpen.images),
    produce: episodePublished || Boolean(
      detail &&
        assembledFinalOptions(detail).length > 0 &&
        !detail.assets.production?.staleReason &&
        !generationOpen.produce
    )
  };
  const voiceSelectionChanged = Boolean(
    selectedAssets.audio && selectedAssets.audio !== detail?.review?.selected.audio
  );
  const isDialogueEpisode = detail?.episode.format === 'TWO_SPEAKER_DIALOGUE';
  const dialogueRoleA = detail?.episode.voices?.A?.role || 'storyteller';
  const dialogueRoleB = detail?.episode.voices?.B?.role || 'listener';
  const imageSelectionChanged = !selectedImageMapsMatch(
    selectedAssets.images,
    detail?.review?.selected.images
  );
  const neededImageIds = detail
    ? requiredImageIds(
        detail.episode.scenes,
        hasSpokenHook(detail.episode.spokenHook),
        Boolean(detail.episode.ending.payoffHi),
        selectedAssets.sceneVisuals,
        selectedAssets.clips,
        { hookTechVisual: detail.episode.hookTechVisual }
      )
    : [];
  /** Slots with no still on disk / selection yet — full Generate only fills these. */
  const missingImageIds = detail
    ? neededImageIds.filter((id) => {
        const locked = selectedAssets.images?.[String(id)];
        if (locked) return false;
        const asset = detail.assets.images.find((row) => row.sceneId === id);
        return !(asset?.imageCandidates?.length || asset?.imagePath || asset?.image);
      })
    : [];
  const hasEpisodeTechVisuals =
    Boolean(detail) &&
    (Boolean(detail!.episode.hookTechVisual) ||
      detail!.episode.scenes.some((scene) => Boolean(scene.techVisual)));
  const techVisualCoversImages =
    Boolean(detail) && neededImageIds.length === 0 && hasEpisodeTechVisuals;
  /** Known Motion Studio storyboard ids under data/tech-reels. */
  const [techReelIds, setTechReelIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!isTech) {
      setTechReelIds(new Set());
      return;
    }
    void listTechSceneTemplates()
      .then(() => listTechReels())
      .then(({ reels }) => setTechReelIds(new Set(reels.map((r) => r.id))))
      .catch(() => setTechReelIds(new Set()));
  }, [pipelineId, selectedFile]);
  /**
   * Tech Remotion paths (mutually exclusive):
   * 1) Episode techVisual → Remotion CODE_PANEL / diagrams in Desk Produce
   * 2) Linked Motion Studio orbital storyboard (same id or note tech-reels/<id>)
   * 3) Neither → guide to Motion Studio (do NOT demand AI stills for Remotion lessons)
   */
  const linkedTechReelId = useMemo(() => {
    if (!isTech || !detail) return '';
    const notes = detail.episode.sourceReview?.notes || [];
    for (const note of notes) {
      const m = note.match(/tech-reels\/([a-zA-Z0-9_-]+)/i);
      if (m?.[1]) return m[1];
    }
    if (techReelIds.has(detail.episode.id)) return detail.episode.id;
    return '';
  }, [pipelineId, detail, techReelIds]);
  const useTechReelStoryboardProduce =
    isTech &&
    (!hasEpisodeTechVisuals || linkedTechReelId === detail?.episode.id) &&
    techReelIds.has(linkedTechReelId) &&
    Boolean(linkedTechReelId);
  /** System-design Desk script waiting for an orbital Remotion storyboard. */
  const techNeedsMotionStudio =
    isTech &&
    !hasEpisodeTechVisuals &&
    !linkedTechReelId;
  const visualProblems = detail ? missingVisuals(detail, selectedAssets) : [];
  const renderProblems = detail ? missingVisuals(detail, selectedAssets, true) : [];
  const scriptClaimsUnresolved = detail
    ? detail.episode.storyKind === 'ORIGINAL_MYTH_FICTION'
      ? 0
      : detail.episode.sourceReview.claimsToVerify.reduce(
          (count, _claim, index) =>
            count + (claimVerdicts[String(index)] === 'supported' ? 0 : 1),
          0
        )
    : 0;
  const approvedFinalPath = detail?.assets.production?.finalVideo
    ? mediaPathFromUrl(detail.assets.production.finalVideo)
    : undefined;
  const selectedFinalIsApproved = Boolean(
    detail?.assets.production?.reviewStatus === 'APPROVED' &&
      approvedFinalPath &&
      selectedAssets.final === approvedFinalPath
  );
  const finalOptions = detail ? assembledFinalOptions(detail) : [];
  const matchingDeliveryPack = detail?.packaging?.language === packageLanguage;
  const pipelinePublishPlatforms = useMemo(() => {
    const fromConfig = (pipeline?.publishProfiles || []).filter(
      (item): item is PublishPlatformId =>
        item === 'youtube' || item === 'instagram' || item === 'facebook'
    );
    return fromConfig.length
      ? fromConfig
      : (['youtube', 'instagram', 'facebook'] as PublishPlatformId[]);
  }, [pipeline?.publishProfiles]);
  const connectedPlatforms = pipelinePublishPlatforms.filter(
    (platform) => connections.find((item) => item.platform === platform)?.state === 'connected'
  );
  const activeConnection = connections.find((item) => item.platform === activePublishPlatform);
  const activePack =
    matchingDeliveryPack && detail?.packaging
      ? detail.packaging.platforms.find((item) => item.platform === activePublishPlatform)
      : undefined;
  const techPackLooksMythology = useMemo(() => {
    if (!isTech || !matchingDeliveryPack || !detail?.packaging) return false;
    const blob = JSON.stringify(detail.packaging).toLowerCase();
    return /epicastra|mythology|#mythology|hanuman|krishna|shastra|पारंपरिक|कल्पना|myth-inspired/.test(
      blob
    );
  }, [pipelineId, matchingDeliveryPack, detail?.packaging]);
  const platformUploadStates = useMemo(() => {
    const next = {} as Record<PublishPlatformId, PlatformUploadState>;
    // Always include every pipeline destination so PublishAllDialog never reads undefined state.
    for (const platform of pipelinePublishPlatforms) {
      next[platform] = {
        confirmed: Boolean(packConfirmed[platform]),
        uploaded: Boolean(publishDone[platform]),
        ...(publishDone[platform]?.url ? { url: publishDone[platform]?.url } : {})
      };
    }
    return next;
  }, [packConfirmed, pipelinePublishPlatforms, publishDone]);

  useEffect(() => {
    if (!activePack) {
      setPackDraft(null);
      return;
    }
    // Custom blank mode owns the draft — don't refill from generated pack.
    if (customPack) return;
    setPackDraft({
      title: activePack.title,
      description: activePack.description,
      tags: activePack.tags.join(', '),
      hashtags: activePack.hashtags.join(' '),
      cta: activePack.cta
    });
  }, [
    activePack?.platform,
    activePack?.title,
    activePack?.description,
    activePack?.cta,
    packageLanguage,
    detail?.packaging?.createdAt,
    customPack
  ]);

  useEffect(() => {
    if (!pipelineReady || needsGate) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setDetail(null);
        setSelectedFile(null);
        setJobLog(null);
        setSelectedBgm(null);
        setPhase('script');
        const { episodes: next } = await listEpisodes();
        if (cancelled) return;
        setEpisodes(next);
        const stored = readSelectedEpisode();
        const preferred =
          (stored && next.find((item) => item.file === stored)?.file) || next[0]?.file || null;
        if (preferred) {
          setSelectedFile(preferred);
          setCreating(false);
        } else {
          setCreating(true);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load episodes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipelineReady, needsGate, pipelineId, readSelectedEpisode]);

  useEffect(() => {
    if (isTech) {
      setTtsKind('tts:elevenlabs');
      setElevenVoiceId(TECH_RAHUL_VOICE_ID);
    }
  }, [pipelineId]);

  useEffect(() => {
    if (ttsKind !== 'tts:elevenlabs' && ttsKind !== 'tts:sarvam') return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingVoices(true);
        setVoicesError(null);
        const provider = ttsKind === 'tts:sarvam' ? 'sarvam' : 'elevenlabs';
        const result = await listTtsVoices(
          provider === 'elevenlabs',
          provider,
          isTech ? 'tech' : 'mythology'
        );
        if (cancelled) return;
        if (provider === 'sarvam') {
          setSarvamVoices(result.voices);
          setSarvamVoiceId((previous) => {
            if (previous && result.voices.some((voice) => voice.id === previous)) return previous;
            return result.defaultVoiceId || result.voices[0]?.id || '';
          });
        } else {
          setElevenVoices(result.voices);
          if (result.accountError) setVoicesError(result.accountError);
          setElevenVoiceId((previous) => {
            if (previous && result.voices.some((voice) => voice.id === previous)) return previous;
            if (isTech) {
              return result.defaultVoiceId || TECH_RAHUL_VOICE_ID || result.voices[0]?.id || '';
            }
            return result.defaultVoiceId || result.voices[0]?.id || '';
          });
        }
      } catch (err) {
        if (!cancelled) {
          setVoicesError(
            err instanceof Error
              ? err.message
              : ttsKind === 'tts:sarvam'
                ? 'Failed to load Sarvam voices'
                : 'Failed to load ElevenLabs voices'
          );
        }
      } finally {
        if (!cancelled) setLoadingVoices(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ttsKind, pipelineId]);

  useEffect(() => {
    return () => {
      voicePreviewAudioRef.current?.pause();
      voicePreviewAudioRef.current = null;
    };
  }, []);

  const toggleElevenVoicePreview = (voice: TtsVoiceOption) => {
    const canPreview = Boolean(voice.previewUrl) || voice.source === 'shared' || voice.source === 'account' || voice.source === 'config';
    if (!canPreview) {
      toast.message('No free demo sample for this voice');
      return;
    }
    const audio = voicePreviewAudioRef.current;
    if (playingVoiceId === voice.id && audio) {
      audio.pause();
      setPlayingVoiceId(null);
      return;
    }
    audio?.pause();
    const next = new Audio(ttsVoicePreviewUrl(voice.id));
    voicePreviewAudioRef.current = next;
    setPlayingVoiceId(voice.id);
    next.onended = () => setPlayingVoiceId((current) => (current === voice.id ? null : current));
    next.onerror = () => {
      setPlayingVoiceId((current) => (current === voice.id ? null : current));
      toast.error('Could not play free demo (sample missing or blocked)');
    };
    void next.play().catch(() => {
      setPlayingVoiceId(null);
      toast.error('Could not play free demo');
    });
  };

  useEffect(() => {
    if (creating || !selectedFile) {
      setDetail(null);
      setApprovals(emptyApprovals());
      setSelectedAssets(emptySelected());
      setClaimVerdicts({});
      setNotes('');
      setPhase('script');
      setGenerationOpen({});
      setImageFixScene(null);
      setImageFixFeedback('');
      setSfxElEffects([]);
      setShowReviewAlternatives(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const next = await getEpisode(selectedFile);
        if (cancelled) return;
        setDetail(next);
        const castA = next.episode.voiceCast?.NARRATOR;
        const castB = next.episode.voiceCast?.FEMALE_CHARACTER;
        if (castA?.provider === 'sarvam') {
          if (castA.speaker) setSarvamVoiceId(castA.speaker);
          if (castB?.speaker) setSarvamVoiceIdB(castB.speaker);
        } else {
          const voiceA =
            next.episode.voices?.A?.voiceId || castA?.speaker || '';
          const voiceB =
            next.episode.voices?.B?.voiceId || castB?.speaker || '';
          if (voiceA) setElevenVoiceId(voiceA);
          if (voiceB) setElevenVoiceIdB(voiceB);
        }
        setPackageLanguage(
          next.packaging?.language || pipeline?.defaultLanguage || (isTech ? 'en' : 'hi')
        );
        setGenerationOpen({});
        setImageFixScene(null);
        setImageFixFeedback('');
        setSfxElEffects([]);
        setShowReviewAlternatives(false);
        setScheduleEnabled(false);
        setScheduleLocal(defaultScheduleLocalValue());
        void listPublishSchedules(next.episode.id)
          .then(({ schedules }) => {
            if (!cancelled) {
              setPublishSchedules(
                schedules.filter((row) => row.status === 'pending' || row.status === 'running')
              );
            }
          })
          .catch(() => {
            if (!cancelled) setPublishSchedules([]);
          });
        const inferredVariant =
          next.episode.visualStyle?.frameVariant || next.assets.heritageDemos?.variant;
        setFrameVariant(
          inferredVariant === 'HERITAGE_LIGHT' ||
            inferredVariant === 'HERITAGE_CLASSIC' ||
            inferredVariant === 'HERITAGE_DRAMATIC'
            ? inferredVariant
            : 'HERITAGE_CLASSIC'
        );
        const nextApprovals = next.review?.approvals || emptyApprovals();
        // Tech motion is Motion Studio / tech:reel — Desk skips Remotion/FFmpeg visuals produce.
        if (isTech) {
          nextApprovals.images = true;
        }
        setApprovals(nextApprovals);
        const locked = next.review?.selected || emptySelected();
        const draft: SelectedAssets = { ...locked };
        const audioFiles = episodeAudioFiles(next.assets.audio, next.episode.id);
        if (draft.audio && !audioFiles.some((file) => file.path === draft.audio)) {
          delete draft.audio;
        }
        if (!draft.audio && audioFiles[0]) draft.audio = audioFiles[0].path;
        // Drop finals wrongly copied from an unrelated Motion Studio storyboard
        // (e.g. …-techreel-request-coalescing-…) when this episode has Remotion techVisuals.
        const episodeHasTechVisual =
          Boolean(next.episode.hookTechVisual) ||
          next.episode.scenes.some((scene) => Boolean(scene.techVisual));
        if (
          episodeHasTechVisual &&
          draft.final &&
          /-techreel-/.test(draft.final) &&
          !draft.final.includes(`-techreel-${next.episode.id}-`)
        ) {
          delete draft.final;
        }
        if (!draft.images) {
          const images: Record<string, string> = {};
          for (const scene of next.assets.images) {
            if (scene.imagePath) images[String(scene.sceneId)] = scene.imagePath;
            else if (scene.image) images[String(scene.sceneId)] = mediaPathFromUrl(scene.image);
          }
          if (Object.keys(images).length) draft.images = images;
        }
        if (!draft.clips) {
          const clips: Record<string, string> = {};
          for (const scene of next.assets.images) {
            const preferred =
              clipCandidatesFor(scene).find((c) => c.provider === 'veo') ||
              clipCandidatesFor(scene).find((c) => c.provider === 'wan') ||
              clipCandidatesFor(scene)[0];
            if (preferred) clips[String(scene.sceneId)] = preferred.path;
          }
          if (Object.keys(clips).length) draft.clips = clips;
        }
        if (!next.assets.production?.staleReason) {
          const assembled = assembledFinalOptions(next);
          const productionPath = next.assets.production?.finalVideo
            ? mediaPathFromUrl(next.assets.production.finalVideo)
            : undefined;
          const productionOption = productionPath
            ? assembled.find((option) => option.path === productionPath)
            : undefined;
          // Prefer the latest produce output over a stale review.selected.final.
          if (
            productionOption &&
            (!draft.final || finalStamp(productionOption.path) >= finalStamp(draft.final))
          ) {
            draft.final = productionOption.path;
          } else if (!draft.final && assembled[0]) {
            draft.final = assembled[0].path;
          }
        }
        setSelectedAssets(draft);
        setNotes(next.review?.reviewerNotes || '');
        const claims = next.episode.sourceReview.claimsToVerify;
        const existing = next.review?.claimVerdicts || {};
        const seeded: Record<string, ClaimVerdict> = {};
        claims.forEach((_, index) => {
          seeded[String(index)] = existing[String(index)] || 'unchecked';
        });
        setClaimVerdicts(seeded);
        const assets = toPhaseAssets(null, next);
        setPhase(pickActivePhase(true, assets, nextApprovals));
        setPackConfirmed({});
        setPublishDone(savedPublishState(next.assets.production));
        setActivePublishPlatform(pipelinePublishPlatforms[0] || 'instagram');
        setPublishAllOpen(false);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load episode');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFile, creating]);

  useEffect(() => {
    const cues = detail?.episode.audioPlan?.sfx;
    if (!cues?.length) {
      setSfxMissing([]);
      return;
    }
    let cancelled = false;
    void getSfxStatus(cues.map((cue) => cue.effect))
      .then((status) => {
        if (!cancelled) setSfxMissing(status.missing);
      })
      .catch(() => {
        if (!cancelled) setSfxMissing([]);
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.episode.id, detail?.episode.audioPlan?.sfx]);

  useEffect(() => {
    if (phase !== 'publish') return;
    let cancelled = false;
    setCheckingConnections(true);
    Promise.all([
      getPublishConnections(true, pipelinePublishPlatforms),
      getInstagramMediaHosting(detail?.episode.id)
    ])
      .then(([{ connections: next }, { hosting }]) => {
        if (cancelled) return;
        setConnections(
          next.filter((connection) => pipelinePublishPlatforms.includes(connection.platform))
        );
        setInstagramHosting(hosting);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to verify accounts');
      })
      .finally(() => {
        if (!cancelled) setCheckingConnections(false);
      });

    function onAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'instagram-auth-ok') {
        void checkConnections().then(() => toast.success('Instagram token refreshed'));
        return;
      }
      if (event.data?.type === 'youtube-auth-ok') {
        void checkConnections().then(() => toast.success('YouTube token saved for this pipeline'));
      }
    }
    window.addEventListener('message', onAuthMessage);

    return () => {
      cancelled = true;
      window.removeEventListener('message', onAuthMessage);
    };
  }, [phase, detail?.episode.id, pipelineId, pipelinePublishPlatforms]);

  useEffect(() => {
    if (!pipelinePublishPlatforms.includes(activePublishPlatform)) {
      setActivePublishPlatform(pipelinePublishPlatforms[0] || 'instagram');
    }
  }, [pipelinePublishPlatforms, activePublishPlatform]);

  async function selectPackageLanguage(language: 'hi' | 'en') {
    setPackageLanguage(language);
    setPackConfirmed({});
    if (!selectedFile) return;
    try {
      const { packaging } = await getPackaging(selectedFile, language);
      setDetail((previous) => (previous ? { ...previous, packaging } : previous));
    } catch {
      setDetail((previous) => (previous ? { ...previous, packaging: null } : previous));
    }
  }

  async function checkConnections() {
    try {
      setCheckingConnections(true);
      setError(null);
      setJobLog(null);
      const [{ connections: next }, { hosting }] = await Promise.all([
        getPublishConnections(true, pipelinePublishPlatforms),
        getInstagramMediaHosting(detail?.episode.id)
      ]);
      const scoped = next.filter((connection) =>
        pipelinePublishPlatforms.includes(connection.platform)
      );
      setConnections(scoped);
      setInstagramHosting(hosting);
      const ready = scoped.filter((connection) => connection.state === 'connected').length;
      const blocked = scoped.length - ready;
      if (blocked) toast.warning(`${ready} connected · ${blocked} need attention`);
      else toast.success('All account connections verified');
      if (
        pipelinePublishPlatforms.includes('instagram') &&
        !hosting.ready
      ) {
        toast.warning('Instagram media hosting not ready (S3 or public URL)');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection check failed';
      setError(message);
      toast.error(message);
    } finally {
      setCheckingConnections(false);
    }
  }

  function resolvePublishVideoPath(): string {
    return (
      selectedAssets.final ||
      approvedFinalPath ||
      (detail?.assets.production?.finalVideo
        ? mediaPathFromUrl(detail.assets.production.finalVideo)
        : '')
    );
  }

  async function refreshPublishSchedules(episodeId?: string) {
    const id = episodeId || detail?.episode.id;
    if (!id) {
      setPublishSchedules([]);
      return;
    }
    try {
      const { schedules } = await listPublishSchedules(id);
      setPublishSchedules(schedules.filter((row) => row.status === 'pending' || row.status === 'running'));
    } catch {
      setPublishSchedules([]);
    }
  }

  async function publishToPlatform(platform: PublishPlatformId, dryRun = false) {
    const videoPath = resolvePublishVideoPath();
    if (!videoPath) {
      toast.error('Approve a final video in Review first');
      return null;
    }
    if (!platform) {
      toast.error('Select a platform first');
      return null;
    }
    if (!matchingDeliveryPack) {
      toast.error('Generate the delivery pack first (or create a Custom blank pack)');
      return null;
    }
    if (isTech && techPackLooksMythology) {
      toast.error('Regenerate tech post copy first — pack still looks like mythology / EpicAstra');
      return null;
    }
    const packForPlatform = detail?.packaging?.platforms.find((item) => item.platform === platform);
    if (!dryRun && !packCopyReady(packForPlatform)) {
      toast.error(
        'Title and description are empty or still TODO — fill Custom copy and Save before upload'
      );
      return null;
    }
    if (!packConfirmed[platform] && !dryRun) {
      toast.error(`Confirm title & description for ${platform} first`);
      return null;
    }
    const connection = connections.find((item) => item.platform === platform);
    if (connection?.state !== 'connected') {
      toast.error(`${platform} is not connected`);
      return null;
    }
    if (platform === 'instagram' && instagramHosting && !instagramHosting.ready && !dryRun) {
      toast.error(
        'Instagram needs S3 (S3_BUCKET + AWS keys) or PUBLISH_VIDEO_PUBLIC_URL before upload'
      );
      return null;
    }
    if (
      (platform === 'instagram' || platform === 'facebook') &&
      !metaPublishReel &&
      !metaPublishStory
    ) {
      toast.error('Enable Reel and/or Story before uploading to Meta');
      return null;
    }
    let scheduleAt: string | undefined;
    if (scheduleEnabled && !dryRun) {
      try {
        scheduleAt = localScheduleToIso(scheduleLocal || defaultScheduleLocalValue());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Invalid schedule');
        return null;
      }
    }
    setPublishAction(dryRun ? 'dry-run' : scheduleAt ? 'schedule' : 'upload');
    try {
      const metaFormats =
        platform === 'instagram' || platform === 'facebook'
          ? [metaPublishReel ? 'reel' : null, metaPublishStory ? 'story' : null]
              .filter(Boolean)
              .join(',')
          : undefined;
      const result = await onRun('publish', {
        platforms: platform,
        dryRun,
        language: packageLanguage,
        requirePackaging: true,
        videoPath,
        ...(metaFormats ? { metaFormats } : {}),
        ...(scheduleAt ? { scheduleAt } : {})
      });
      if (result?.ok && !dryRun) {
        const url = extractPublishUrl(platform, result.stdout || '', result.stderr || '');
        const skippedAlready = /Already uploaded/i.test(
          `${result.stdout || ''}\n${result.stderr || ''}`
        );
        const scheduled = /scheduled/i.test(`${result.stdout || ''}\n${result.stderr || ''}`);
        if (url || skippedAlready || scheduled) {
          setPublishDone((previous) => ({
            ...previous,
            [platform]: {
              status: scheduled ? 'scheduled' : 'uploaded',
              ...(url ? { url } : {})
            }
          }));
          if (skippedAlready) toast.message(`${platform} already uploaded — skipped duplicate`);
          else if (scheduled) toast.success(`${platform} scheduled`);
        }
        await refreshPublishSchedules();
      }
      return result;
    } finally {
      setPublishAction(null);
    }
  }

  async function useJsonTitles(target: 'all' | 'youtube' | 'instagram' | 'facebook', sharedOnly = false) {
    if (!selectedFile) return;
    const file = selectedFile;
    setSavingPack(true);
    try {
      const { packaging } = await applyJsonTitles(file, packageLanguage, target, sharedOnly);
      setDetail((previous) => previous?.file === file ? { ...previous, packaging } : previous);
      setPackConfirmed({});
      setCustomPack(false);
      toast.success('JSON titles applied. Review and confirm before publishing.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not apply titles');
    } finally { setSavingPack(false); }
  }

  async function saveCustomPackAndConfirm() {
    if (!selectedFile || !activePack || !packDraft) return;
    const tags = packDraft.tags
      .split(/[,#\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const hashtags = packDraft.hashtags
      .split(/[,\s\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
    if (!packDraft.title.trim() || packDraft.description.trim().length < 20) {
      toast.error('Title and a longer description are required');
      return;
    }
    if (!tags.length || !hashtags.length) {
      toast.error('Add at least one tag and one hashtag');
      return;
    }
    setSavingPack(true);
    try {
      const { packaging } = await savePlatformPack(selectedFile, {
        language: packageLanguage,
        platform: activePublishPlatform,
        title: packDraft.title.trim(),
        description: packDraft.description.trim(),
        tags,
        hashtags,
        cta:
          packDraft.cta.trim() ||
          (isTech
            ? 'Follow for daily tech shorts'
            : 'Follow EpicAstra for more')
      });
      setDetail((previous) => (previous ? { ...previous, packaging } : previous));
      setPackConfirmed((previous) => ({ ...previous, [activePublishPlatform]: true }));
      setCustomPack(false);
      toast.success(`Saved custom ${activePublishPlatform} copy`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save packaging');
    } finally {
      setSavingPack(false);
    }
  }

  async function publishAllReady() {
    const queue = connectedPlatforms.filter(
      (platform) => packConfirmed[platform] && !publishDone[platform]
    );
    for (const platform of queue) {
      const result = await publishToPlatform(platform, false);
      if (!result?.ok) break;
    }
  }

  function changeVisualPlan(next: SelectedAssets) {
    setSelectedAssets({ ...next, final: undefined });
    setApprovals((previous) => ({ ...previous, images: false }));
    setGenerationOpen((previous) => ({ ...previous, images: true, produce: true }));
  }

  async function uploadVisualClip(id: number, file: File): Promise<AssetFile> {
    if (!selectedFile || !detail) throw new Error('Select an episode first');
    const uploaded = await uploadEpisodeSceneClip(selectedFile, detail.episode.id, id, file);
    const next = await getEpisode(selectedFile);
    if (activeEpisodeRef.current === selectedFile) setDetail(next);
    return next.assets.images.flatMap((item) => item.clipCandidates || []).find((item) => item.path === uploaded.path)
      || { ...uploaded, mtimeMs: Date.now(), provider: 'upload' };
  }

  async function uploadSceneStill(sceneId: number, file: File) {
    if (!selectedFile || !detail) throw new Error('Select an episode first');
    if (episodePublished) throw new Error('Published episode — upload is locked');
    setStillUploadBusy(true);
    try {
      const uploaded = await uploadEpisodeSceneStill(
        selectedFile,
        detail.episode.id,
        sceneId,
        file
      );
      const next = await getEpisode(selectedFile);
      if (activeEpisodeRef.current === selectedFile) setDetail(next);
      setSelectedAssets((prev) => ({
        ...prev,
        images: { ...(prev.images || {}), [String(sceneId)]: uploaded.path },
        final: undefined
      }));
      setApprovals((previous) => ({ ...previous, images: false }));
      setGenerationOpen((previous) => ({ ...previous, images: true, produce: true }));
      setStillUploadScene(null);
      toast.success(
        `${sceneId === 0 ? 'Opening hook' : `Scene ${sceneId}`} still uploaded`
      );
    } finally {
      setStillUploadBusy(false);
    }
  }

  async function copySceneImagePrompt(sceneId: number) {
    if (!selectedFile) {
      toast.error('Select an episode first');
      return;
    }
    setCopyPromptScene(sceneId);
    try {
      const prompts = await getImagePrompts(selectedFile);
      const item = prompts.items.find((row) =>
        sceneId === 0 ? row.id === 'hook' || row.id === 0 : row.id === sceneId
      );
      if (!item?.finalPrompt?.trim()) {
        throw new Error(
          sceneId === 0
            ? 'No image prompt for the opening hook'
            : `No image prompt for scene ${sceneId}`
        );
      }
      await navigator.clipboard.writeText(item.finalPrompt);
      toast.success(
        `Copied ${sceneId === 0 ? 'hook' : `scene ${sceneId}`} image prompt`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to copy prompt');
    } finally {
      setCopyPromptScene(null);
    }
  }

  async function persistApprovals(next: PhaseApprovals, selectedOverride?: SelectedAssets) {
    if (!detail || !selectedFile) return null;
    if (episodePublished) {
      toast.error('Published episode — editing is locked. Create a new draft for changes.');
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const selected = selectedOverride ?? selectedAssets;
      const saved = await saveReview(selectedFile, {
        episodeId: detail.episode.id,
        claimVerdicts,
        approvals: next,
        selected,
        reviewerNotes: notes
      });
      setApprovals(saved.review.approvals);
      setSelectedAssets(saved.review.selected || emptySelected());
      const { episodes: nextList } = await listEpisodes();
      setEpisodes(nextList);
      setDetail(await getEpisode(selectedFile));
      toast.success('Selection + approval saved');
      return saved.review.approvals;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save approval';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function onRun(
    kind: JobKind,
    extras: Record<string, string | boolean | undefined> = {}
  ) {
    try {
      if (
        episodePublished &&
        kind !== 'publish' &&
        kind !== 'package' &&
        kind !== 'topics' &&
        kind !== 'story'
      ) {
        toast.error(
          'Published episode — content edits are locked. You can still regenerate post copy and publish to other platforms.'
        );
        return;
      }
      setJobBusy(true);
      setActiveJob(kind);
      setJobLog(null);
      setError(null);
      const result = await runJob({
        kind,
        episodeFile: selectedFile || undefined,
        episodeId: detail?.episode.id,
        ...extras
      });
      setJobLog(result);
      if (!result.ok) toast.error(`${kind} failed`);
      else toast.success(`${kind} finished`);

      if (result.ok) {
        const generatedPhase: PipelinePhase | undefined =
          kind === 'story'
            ? 'script'
            : kind === 'tts:free' ||
                kind === 'tts:elevenlabs' ||
                kind === 'tts:sarvam' ||
                kind === 'audio:plan' ||
                kind === 'audio:mix' ||
                kind === 'audio:sfx-el'
              ? 'tts'
              : kind === 'images'
                ? 'images'
                : kind === 'produce' ||
                    kind === 'render' ||
                    kind === 'remotion' ||
                    kind === 'remotion:chrome' ||
                    kind === 'mux:external'
                  ? 'produce'
                  : undefined;
        if (generatedPhase) {
          setGenerationOpen((previous) =>
            (generatedPhase === 'tts' || generatedPhase === 'images') && previous[generatedPhase]
              ? previous
              : { ...previous, [generatedPhase]: false }
          );
        }
      }

      if (kind === 'story' && result.ok) {
        const { episodes: next } = await listEpisodes();
        setEpisodes(next);
        if (next[0]) {
          selectEpisode(next[0].file);
        }
      } else if (selectedFile) {
        const { episodes: next } = await listEpisodes();
        setEpisodes(next);
        const updated = await getEpisode(selectedFile);
        setDetail(updated);
        if (result.ok && kind === 'produce' && updated.assets.production?.finalVideo) {
          setSelectedAssets((previous) => ({ ...previous, final: mediaPathFromUrl(updated.assets.production!.finalVideo!) }));
        }
        if (result.ok && kind === 'remotion:chrome') {
          const chrome = assembledFinalOptions(updated).find(
            (file) =>
              (file.path || '').includes('-chrome') || (file.provider || '').includes('chrome')
          );
          if (chrome) {
            setSelectedAssets((previous) => ({ ...previous, final: chrome.path }));
            setShowReviewAlternatives(true);
            setPhase('review');
          }
        }
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Job failed';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setJobBusy(false);
      setActiveJob(null);
    }
  }

  function jobSpinner(kind: JobKind) {
    return activeJob === kind ? <Spinner data-icon="inline-start" /> : null;
  }

  async function submitImageFix() {
    if (imageFixScene == null) return;
    const note = imageFixFeedback.trim();
    if (!note) {
      toast.error('Say what is wrong with this image');
      return;
    }
    try {
      setImageFixBusy(true);
      const sceneId = imageFixScene;
      const result = await onRun('images', {
        provider: imageProvider,
        scenes: sceneId === 0 ? 'hook' : String(sceneId),
        feedback: note
      });
      if (result?.ok) {
        setImageFixScene(null);
        setImageFixFeedback('');
        if (selectedFile) {
          const next = await getEpisode(selectedFile);
          setDetail(next);
          const asset = next.assets.images.find((item) => item.sceneId === sceneId);
          if (asset?.imagePath) {
            setSelectedAssets((prev) => ({
              ...prev,
              images: {
                ...(prev.images || {}),
                [String(sceneId)]: asset.imagePath!
              }
            }));
          }
        }
      }
    } finally {
      setImageFixBusy(false);
    }
  }

  function selectEpisode(file: string) {
    setCreating(false);
    setSelectedFile(file);
    storeSelectedEpisode(file);
    setJobLog(null);
    setSelectedBgm(null);
    setBgmPickerOpen(false);
  }

  async function confirmDeleteEpisode() {
    if (!deleteTarget) return;
    if (deleteTarget.assets.hasPublished) {
      toast.error('Published episode — delete is locked.');
      setDeleteTarget(null);
      return;
    }
    try {
      setDeletingEpisode(true);
      const result = await deleteEpisode(deleteTarget.file, {
        keepAssets: keepAssetsOnDelete
      });
      const { episodes: next } = await listEpisodes();
      setEpisodes(next);
      if (selectedFile === deleteTarget.file) {
        if (next[0]) {
          setSelectedFile(next[0].file);
          storeSelectedEpisode(next[0].file);
          setCreating(false);
        } else {
          setSelectedFile(null);
          storeSelectedEpisode(null);
          setDetail(null);
          setCreating(true);
          setPhase('script');
        }
      }
      setDeleteTarget(null);
      setKeepAssetsOnDelete(false);
      toast.success(
        result.keptAssets
          ? `Deleted script ${result.episodeId} (assets kept)`
          : `Deleted script ${result.episodeId} and ${result.removedAssets.length} asset path(s)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete script';
      toast.error(message);
    } finally {
      setDeletingEpisode(false);
    }
  }

  function startNew() {
    setCreating(true);
    setSelectedFile(null);
    storeSelectedEpisode(null);
    setDetail(null);
    setPhase('script');
    setApprovals(emptyApprovals());
    setJobLog(null);
    setGenerationOpen({});
  }

  async function reopenGeneration(target: 'script' | 'tts' | 'images' | 'produce') {
    if (target === 'script') {
      const currentTopic = detail?.episode.topic || topic;
      startNew();
      setTopic(currentTopic);
      setGenerationOpen({ script: true });
      toast.message('New draft opened. The published episode and its assets are unchanged.');
      return;
    }
    if (episodePublished) {
      toast.error('Published episode — editing is locked. Use “Create another draft” for a new Short.');
      return;
    }
    setGenerationOpen((previous) => ({ ...previous, [target]: true }));
  }

  function goRelative(delta: number) {
    const next = PHASES[phaseIndex + delta];
    if (next) setPhase(next.id);
  }

  return (
    <div className="app-shell flex min-h-svh flex-col md:flex-row">
      <aside className="app-sidebar flex h-56 max-h-56 w-full shrink-0 flex-col overflow-hidden md:sticky md:top-0 md:h-svh md:max-h-svh md:w-72 xl:w-80">
        <div className="flex shrink-0 items-center gap-3 px-4 py-3 md:px-5 md:pt-6 md:pb-5">
          <div className="brand-mark" aria-hidden>
            <SparklesIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="brand-name">{pipeline?.label || 'Shortforge'}</p>
            <p className="mt-0.5 text-xs text-white/45">
              {pipeline?.studioSubtitle || 'Shorts production studio'}
            </p>
          </div>
        </div>
        <div className="shrink-0 px-4 pb-3 md:pb-4">
          <Button className="h-9 w-full bg-primary text-primary-foreground hover:bg-primary/90 md:h-10" onClick={startNew}>
            <PlusIcon data-icon="inline-start" />
            {pipeline?.newEpisodeLabel || 'Create a new short'}
          </Button>
        </div>
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 text-[0.66rem] font-semibold tracking-[0.16em] text-white/35 uppercase">
          <span>Episodes</span>
          <span>{episodes.length}</span>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-3 pb-5">
          <div className="flex flex-col gap-1 pr-2">
            {loading && (
              <>
                <Skeleton className="h-16 w-full bg-white/8" />
                <Skeleton className="h-16 w-full bg-white/8" />
              </>
            )}
            {!loading && episodes.length === 0 && (
              <p className="px-2 py-4 text-sm text-white/45">
                {pipeline?.emptyListCopy || 'No episodes yet. Create your first short.'}
              </p>
            )}
            {episodes.map((item) => {
              const a = item.review?.approvals || emptyApprovals();
              const active = !creating && item.file === selectedFile;
              const itemAssets = toPhaseAssets(item, null);
              const itemPhase = PHASES.find(
                (candidate) => candidate.id === pickActivePhase(true, itemAssets, a)
              );
              const itemComplete = completedPhaseCount(true, itemAssets, a);
              return (
                <div
                  key={item.file}
                  className={cn(
                    'episode-row group relative rounded-xl px-3 py-3 text-left transition-all duration-200',
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-white/68 hover:bg-white/6 hover:text-white'
                  )}
                >
                  {active && (
                    <span className="absolute top-3 bottom-3 left-0 w-0.5 rounded-full bg-primary" />
                  )}
                  <button
                    type="button"
                    onClick={() => selectEpisode(item.file)}
                    className="w-full text-left"
                  >
                    <div className="truncate text-sm font-medium leading-snug">{item.titleEn}</div>
                    <div className="mt-1 truncate font-[family-name:var(--font-hi)] text-xs text-white/38">
                      {item.titleHi || item.topic}
                    </div>
                    <div className="mt-1.5 truncate font-mono text-[0.62rem] text-white/30">
                      id: {item.id}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[0.68rem] text-white/38">
                      <span>
                        {itemComplete}/{PHASES.length} complete
                      </span>
                      <span className="size-0.5 rounded-full bg-white/25" />
                      <span className="truncate">
                        {item.assets.hasPublished
                          ? 'Published'
                          : `Next: ${itemPhase?.label || 'Review'}`}
                      </span>
                    </div>
                  </button>
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-white/45 hover:bg-white/10 hover:text-red-300"
                      disabled={item.assets.hasPublished}
                      title={
                        item.assets.hasPublished
                          ? 'Published episodes cannot be deleted'
                          : 'Delete episode'
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.assets.hasPublished) {
                          toast.error('Published episode — delete is locked.');
                          return;
                        }
                        setKeepAssetsOnDelete(false);
                        setDeleteTarget(item);
                      }}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="app-topbar sticky top-0 z-30 flex items-center justify-between gap-4 px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="mb-1 text-[0.67rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {creating ? 'New production' : 'Current production'}
            </p>
            <h1 className="truncate font-[family-name:var(--font-serif)] text-xl font-semibold tracking-tight sm:text-2xl">
              {creating ? 'New Short' : detail?.episode.titleEn || 'Select an episode'}
            </h1>
            {!creating && detail?.episode.id && (
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                Script id: <span className="text-foreground/80">{detail.episode.id}</span>
              </p>
            )}
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <PipelineSwitcher
              blockedReason={
                jobBusy ? 'Finish or cancel the current job before switching pipelines.' : null
              }
              onBeforeSwitch={() => {
                setSelectedFile(null);
                setDetail(null);
                setEpisodes([]);
                setJobLog(null);
                setCreating(true);
                setPhase('script');
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => setConnectAiOpen(true)}>
              <BotIcon data-icon="inline-start" />
              Connect AI
            </Button>
            {isTech && (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to="/desk?studio=1">Motion studio</Link>
              </Button>
            )}
            {user?.email && (
              <span className="max-w-[10rem] truncate text-xs text-muted-foreground" title={user.email}>
                {user.email}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                void logout().then(() => navigate('/login', { replace: true }));
              }}
            >
              Sign out
            </Button>
            {detail && (
              <span className="text-xs text-muted-foreground">
                {detail.episode.targetDurationSeconds}s · {detail.episode.scenes.length} scenes
              </span>
            )}
            {detail && !creating && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                disabled={episodePublished}
                title={
                  episodePublished
                    ? 'Published episodes cannot be deleted'
                    : 'Delete episode'
                }
                onClick={() => {
                  if (episodePublished) {
                    toast.error('Published episode — delete is locked.');
                    return;
                  }
                  const summary =
                    episodes.find((item) => item.file === selectedFile) ||
                    ({
                      file: selectedFile!,
                      id: detail.episode.id,
                      titleEn: detail.episode.titleEn,
                      titleHi: detail.episode.titleHi,
                      topic: detail.episode.topic,
                      assets: { hasPublished: false }
                    } as EpisodeSummary);
                  setKeepAssetsOnDelete(false);
                  setDeleteTarget(summary);
                }}
              >
                <Trash2Icon data-icon="inline-start" />
                Delete script
              </Button>
            )}
            {episodePublished && (
              <Badge variant="secondary">Published</Badge>
            )}
            <Badge className={cn('status-badge', phaseStatus === 'locked' && 'opacity-60')}>
              <span className="status-dot" />
              {phaseStatusLabel(phaseStatus)}
            </Badge>
          </div>
        </header>

        {creating && <ConnectAiBanner onOpen={() => setConnectAiOpen(true)} />}
        <ConnectAiDialog open={connectAiOpen} onOpenChange={setConnectAiOpen} />

        {error && (
          <div className="px-6 pt-4">
            <Alert variant="destructive">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="workflow-layout flex flex-1 gap-0 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">
          <aside className="workflow-rail hidden shrink-0 xl:block">
            <div className="sticky top-28">
              <PhaseStepper
                value={phase}
                creating={creating}
                hasEpisode={Boolean(detail) && !creating}
                assets={phaseAssets}
                approvals={approvals}
                onChange={setPhase}
                isTech={isTech}
              />
            </div>
          </aside>

          <section className="min-w-0 flex-1 xl:pl-10">
            <div className="mb-5 xl:hidden">
              <PhaseStepper
                value={phase}
                creating={creating}
                hasEpisode={Boolean(detail) && !creating}
                assets={phaseAssets}
                approvals={approvals}
                onChange={setPhase}
                isTech={isTech}
              />
            </div>

            <div key={phase} className="phase-intro mb-7 animate-phase-in">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[0.68rem] font-semibold tracking-[0.16em] text-primary uppercase">
                  Step {phaseMeta.step} of {pipelinePhases.length}
                </span>
                <span className="h-3 w-px bg-border" />
                <span className="text-xs text-muted-foreground">{phaseStatusLabel(phaseStatus)}</span>
              </div>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <h2 className="font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight sm:text-4xl">
                    {phaseMeta.label}
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                    {currentInstruction}
                  </p>
                </div>
                <div className="flex min-w-52 items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex justify-between text-[0.67rem] text-muted-foreground">
                      <span>Overall progress</span>
                      <span>{doneCount}/{PHASES.length}</span>
                    </div>
                    <Progress value={progressValue} className="h-1.5" />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      aria-label="Previous step"
                      variant="outline"
                      size="icon"
                      disabled={phaseIndex <= 0}
                      onClick={() => goRelative(-1)}
                    >
                      <ArrowLeftIcon />
                    </Button>
                    <Button
                      aria-label="Next step"
                      variant="outline"
                      size="icon"
                      disabled={phaseIndex >= PHASES.length - 1}
                      onClick={() => goRelative(1)}
                    >
                      <ArrowRightIcon />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

          {episodePublished && detail && !creating && (
            <Alert className="mx-5 mb-2 sm:mx-7">
              <AlertTitle>Partially published — content locked</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  Script, voice, images, produce, and delete stay locked so the live cut is not
                  overwritten. Open Publish to finish remaining platforms (post copy + upload still
                  work).
                </span>
                <Button variant="outline" size="sm" onClick={() => reopenGeneration('script')}>
                  Create another draft
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {phase === 'script' && (
            <div className="flex flex-col gap-4">
              {generationLocked.script && (
                <div className="review-lock-note">
                  <div>
                    <p className="text-sm font-semibold">
                      {episodePublished
                        ? 'Published — editing locked'
                        : approvals.script
                          ? 'Script approved'
                          : 'Script ready for review'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {episodePublished
                        ? 'This published Short cannot be edited in place. Create another draft for a new version.'
                        : 'Generation settings are locked so this version cannot be replaced by accident.'}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => reopenGeneration('script')}>
                    Create another draft
                  </Button>
                </div>
              )}

              {(!detail || creating || generationOpen.script) && (
                <>
              <Card>
                <CardHeader>
                  <CardTitle>Scout topics</CardTitle>
                  <CardDescription>
                    Optional: find eight focused ideas before choosing your story.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="focus">Focus (optional)</FieldLabel>
                      <Input
                        id="focus"
                        value={topicFocus}
                        onChange={(e) => setTopicFocus(e.target.value)}
                        placeholder="Hanuman childhood lore"
                      />
                    </Field>
                  </FieldGroup>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    disabled={jobBusy}
                    onClick={() =>
                      onRun('topics', {
                        provider: storyProvider,
                        focus: topicFocus || undefined,
                        count: '8'
                      })
                    }
                  >
                    {jobSpinner('topics')}
                    Run topics
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Create the script</CardTitle>
                  <CardDescription>
                    Generate with AI, or copy the sample JSON / full LLM prompt (prompt already
                    includes the sample JSON), fill externally, then import the result.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="topic">Topic</FieldLabel>
                      <Input
                        id="topic"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Provider</FieldLabel>
                      <Select
                        value={storyProvider}
                        onValueChange={setStoryProvider}
                      >
                        <SelectTrigger className="w-full max-w-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="gemini">gemini</SelectItem>
                            <SelectItem value="openrouter">openrouter</SelectItem>
                            <SelectItem value="groq">groq</SelectItem>
                            <SelectItem value="nvidia">nvidia</SelectItem>
                            <SelectItem value="openai">openai</SelectItem>
                            <SelectItem value="ollama">ollama</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  </FieldGroup>
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    disabled={jobBusy || !topic.trim()}
                    onClick={() => onRun('story', { topic, provider: storyProvider })}
                  >
                    {jobSpinner('story')}
                    Generate script
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={jobBusy}
                    onClick={() => {
                      void copyEpisodeScriptSampleJson(topic || undefined)
                        .then(() => toast.success('Sample JSON copied — paste into your LLM'))
                        .catch((error) =>
                          toast.error(error instanceof Error ? error.message : 'Copy failed')
                        );
                    }}
                  >
                    Copy sample JSON
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={jobBusy}
                    onClick={() => {
                      void copyEpisodeScriptLlmBrief(topic || undefined)
                        .then(() =>
                          toast.success('LLM prompt copied (includes sample JSON) — paste into ChatGPT/Claude')
                        )
                        .catch((error) =>
                          toast.error(error instanceof Error ? error.message : 'Copy failed')
                        );
                    }}
                  >
                    Copy LLM prompt
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={jobBusy}
                    onClick={() => {
                      void downloadEpisodeScriptSampleJson(topic || undefined)
                        .then(() => toast.message('Sample JSON downloaded'))
                        .catch((error) =>
                          toast.error(
                            error instanceof Error ? error.message : 'Download failed'
                          )
                        );
                    }}
                  >
                    Download sample JSON
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={jobBusy}
                    onClick={() => {
                      void downloadEpisodeScriptLlmBrief(topic || undefined)
                        .then(() => toast.message('LLM brief downloaded'))
                        .catch((error) =>
                          toast.error(
                            error instanceof Error ? error.message : 'Download failed'
                          )
                        );
                    }}
                  >
                    Download LLM brief
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={jobBusy}
                    onClick={() => setImportScriptOpen(true)}
                  >
                    Import script JSON…
                  </Button>
                </CardFooter>
              </Card>
                </>
              )}

              {detail && !creating && (
                <Card>
                  <CardHeader>
                    <CardTitle>Approve script</CardTitle>
                    <CardDescription>
                      Title (not spoken):{' '}
                      <span className="font-[family-name:var(--font-hi)] text-foreground">
                        {detail.episode.titleHi}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {hasSpokenHook(detail.episode.spokenHook) && (
                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Spoken hook
                          {detail.episode.spokenHookDurationSeconds
                            ? ` · ${detail.episode.spokenHookDurationSeconds}s`
                            : ''}
                          {detail.episode.hookDelivery ? ` · ${detail.episode.hookDelivery}` : ''}
                          {typeof detail.episode.spokenHook === 'object' &&
                          detail.episode.spokenHook?.voiceRole
                            ? ` · ${detail.episode.spokenHook.voiceRole}`
                            : ''}
                        </p>
                        <p className="mt-1 font-[family-name:var(--font-hi)] text-sm leading-relaxed text-foreground">
                          {spokenHookDisplayText(detail.episode.spokenHook)}
                        </p>
                      </div>
                    )}
                    {detail.episode.featuredLords && detail.episode.featuredLords.length > 0 && (
                      <div className="rounded-xl border border-border bg-muted/10 p-3">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Featured lords (for images)
                        </p>
                        <ul className="mt-2 flex flex-col gap-2">
                          {detail.episode.featuredLords.map((lord) => (
                            <li key={lord.nameEn} className="text-sm leading-snug">
                              <span className="font-medium text-foreground">
                                {lord.nameEn}
                                {lord.nameHi ? (
                                  <span className="font-[family-name:var(--font-hi)] text-muted-foreground">
                                    {' '}
                                    · {lord.nameHi}
                                  </span>
                                ) : null}
                              </span>
                              <Badge variant="outline" className="ml-2 align-middle">
                                {lord.importance}
                              </Badge>
                              <p className="mt-0.5 text-xs text-muted-foreground">{lord.visualIdentity}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-col gap-3">
                      {detail.episode.scenes.map((scene) => (
                        <div key={scene.id} className="flex gap-3 border-t pt-3 first:border-t-0 first:pt-0">
                          <div className="w-8 shrink-0 text-lg font-semibold text-muted-foreground">
                            {scene.id}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline">{scene.durationSeconds}s</Badge>
                              <Badge variant={scene.renderMode === 'AI_VIDEO' ? 'secondary' : 'outline'}>
                                {scene.renderMode}
                              </Badge>
                              {(scene.appearingLords || []).map((name) => (
                                <Badge key={name} variant="secondary">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                            <p className="font-[family-name:var(--font-hi)] leading-relaxed">
                              {scene.narrationHi}
                            </p>
                            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
                              <div>
                                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                  Image Prompt
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-foreground/90">
                                  {scene.visualPrompt}
                                </p>
                              </div>
                              {scene.renderMode === 'AI_VIDEO' ? (
                                <>
                                  <div>
                                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                      Video Prompt
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-foreground/90">
                                      {scene.videoPrompt?.trim() || (
                                        <span className="text-muted-foreground">
                                          Not set — edit in Review visual scripts before AI motion.
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                      Negative Video Prompt
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-foreground/90">
                                      {scene.videoNegativePrompt?.trim() || (
                                        <span className="text-muted-foreground">
                                          Not set — edit in Review visual scripts before AI motion.
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator />
                    {scriptClaimsUnresolved > 0 && !approvals.script && (
                      <Alert>
                        <AlertTitle>Claim check required</AlertTitle>
                        <AlertDescription>
                          Mark all {scriptClaimsUnresolved} remaining claim{scriptClaimsUnresolved === 1 ? '' : 's'} as Supported before approving this non-fiction script. Unsupported claims should be corrected in a new draft.
                        </AlertDescription>
                      </Alert>
                    )}
                    <FieldGroup>
                      {detail.episode.sourceReview.claimsToVerify.map((claim, index) => (
                        <Field key={`${index}-${claim.slice(0, 20)}`} orientation="responsive">
                          <FieldLabel className="font-[family-name:var(--font-hi)] font-normal">
                            {claim}
                          </FieldLabel>
                          <Select
                            value={claimVerdicts[String(index)] || 'unchecked'}
                            onValueChange={(value) =>
                              setClaimVerdicts((prev) => ({
                                ...prev,
                                [String(index)]: value as ClaimVerdict
                              }))
                            }
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {VERDICTS.map((v) => (
                                  <SelectItem key={v.value} value={v.value}>
                                    {v.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      ))}
                      <Field>
                        <FieldLabel htmlFor="notes">Reviewer notes</FieldLabel>
                        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                      </Field>
                    </FieldGroup>
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2">
                    {approvals.script ? (
                      <>
                        <Button variant="outline" disabled={saving} onClick={() => void persistApprovals(approvals)}>
                          {saving ? <Spinner data-icon="inline-start" /> : null}
                          Save claim notes
                        </Button>
                        <Button onClick={() => setPhase('tts')}>
                          Continue to Voice
                          <ArrowRightIcon data-icon="inline-end" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={saving || scriptClaimsUnresolved > 0}
                        onClick={async () => {
                          const next = await persistApprovals({ ...approvals, script: true });
                          if (next) setPhase('tts');
                        }}
                      >
                        {saving ? <Spinner data-icon="inline-start" /> : null}
                        {scriptClaimsUnresolved > 0
                          ? `Resolve ${scriptClaimsUnresolved} claim${scriptClaimsUnresolved === 1 ? '' : 's'} first`
                          : 'Approve script → Voice'}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )}
            </div>
          )}

          {phase === 'tts' && detail && !creating && (
            <Card>
              <CardHeader>
                <CardTitle>Voice · Hindi narration</CardTitle>
                <CardDescription>
                  First choose which TTS engine will generate the voice. Then pick one take to
                  approve.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {!approvals.script ? (
                  <Alert>
                    <AlertTitle>Locked</AlertTitle>
                    <AlertDescription>Approve the script first.</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    {generationLocked.tts && (
                      <div className="review-lock-note">
                        <div>
                          <p className="text-sm font-semibold">
                            {episodePublished ? 'Published — editing locked' : 'Voice approved'}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {episodePublished
                              ? 'Voice cannot be regenerated on a published Short. Create another draft for a new take.'
                              : 'Generation is locked. Reopen to pick another provider and create a new take.'}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() =>
                            reopenGeneration(episodePublished ? 'script' : 'tts')
                          }
                        >
                          {episodePublished ? 'Create another draft' : 'Reopen voice generation'}
                        </Button>
                      </div>
                    )}

                    <div
                      className={cn(
                        'flex flex-col gap-3',
                        generationLocked.tts && 'generation-locked'
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium">1 · Which TTS should generate the voice?</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Pick an engine, then Generate. Old takes below are for selection only —
                          they do not block a new run.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label
                          className={cn(
                            'flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors',
                            ttsKind === 'tts:free'
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                              : 'border-border hover:border-primary/40',
                            generationLocked.tts && 'pointer-events-none opacity-60'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="tts-provider"
                              className="size-4 accent-[var(--primary)]"
                              checked={ttsKind === 'tts:free'}
                              disabled={generationLocked.tts}
                              onChange={() => setTtsKind('tts:free')}
                            />
                            <span className="text-sm font-semibold">Edge TTS</span>
                            <Badge variant="secondary">Free</Badge>
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Microsoft Edge neural Hindi voice. No API key. Good for drafts.
                          </p>
                        </label>
                        <label
                          className={cn(
                            'flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors',
                            ttsKind === 'tts:sarvam'
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                              : 'border-border hover:border-primary/40',
                            generationLocked.tts && 'pointer-events-none opacity-60'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="tts-provider"
                              className="size-4 accent-[var(--primary)]"
                              checked={ttsKind === 'tts:sarvam'}
                              disabled={generationLocked.tts}
                              onChange={() => setTtsKind('tts:sarvam')}
                            />
                            <span className="text-sm font-semibold">Sarvam</span>
                            <Badge>Indic</Badge>
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Bulbul Hindi voices. Needs <code>SARVAM_API_KEY</code>.
                          </p>
                        </label>
                        <label
                          className={cn(
                            'flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors',
                            ttsKind === 'tts:elevenlabs'
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                              : 'border-border hover:border-primary/40',
                            generationLocked.tts && 'pointer-events-none opacity-60'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="tts-provider"
                              className="size-4 accent-[var(--primary)]"
                              checked={ttsKind === 'tts:elevenlabs'}
                              disabled={generationLocked.tts}
                              onChange={() => setTtsKind('tts:elevenlabs')}
                            />
                            <span className="text-sm font-semibold">ElevenLabs</span>
                            <Badge>Paid</Badge>
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Higher quality multilingual. Needs <code>ELEVENLABS_API_KEY</code>.
                          </p>
                        </label>
                      </div>
                      <Alert>
                        <AlertTitle>
                          Will use:{' '}
                          {ttsKind === 'tts:free'
                            ? 'Edge TTS (free)'
                            : ttsKind === 'tts:sarvam'
                              ? 'Sarvam Bulbul (Indic)'
                              : 'ElevenLabs (paid)'}
                        </AlertTitle>
                        <AlertDescription>
                          {ttsKind === 'tts:free'
                            ? 'Runs npm run tts:free — creates a new Edge Hindi MP3 for this episode.'
                            : ttsKind === 'tts:sarvam'
                              ? 'Runs npm run tts:sarvam — creates a new Sarvam Hindi MP3 for this episode.'
                              : isTech
                                ? 'Indian-English voices only (lang=en, accent=indian). Default Rahul Bharadwaj — pick any other Indian-English voice below. Mythology Hindi voices are hidden.'
                                : isDialogueEpisode
                                  ? 'Two-speaker script: one voice list — assign any voice as A and any other as B. Generate stitches turns into one narration file.'
                                  : 'Runs npm run tts:elevenlabs — creates a new ElevenLabs Hindi MP3 for this episode.'}
                        </AlertDescription>
                      </Alert>

                      {ttsKind === 'tts:elevenlabs' && (
                        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              {isDialogueEpisode ? 'ElevenLabs voices' : 'ElevenLabs voice'}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={loadingVoices || generationLocked.tts}
                              onClick={async () => {
                                try {
                                  setLoadingVoices(true);
                                  setVoicesError(null);
                                  const result = await listTtsVoices(
                                    true,
                                    'elevenlabs',
                                    isTech ? 'tech' : 'mythology'
                                  );
                                  setElevenVoices(result.voices);
                                  if (result.accountError) setVoicesError(result.accountError);
                                  const nextA =
                                    elevenVoiceId || result.defaultVoiceId || result.voices[0]?.id || '';
                                  if (!elevenVoiceId && nextA) setElevenVoiceId(nextA);
                                  if (
                                    isDialogueEpisode &&
                                    (!elevenVoiceIdB || elevenVoiceIdB === nextA)
                                  ) {
                                    const alt =
                                      result.voices.find((voice) => voice.id !== nextA)?.id || '';
                                    if (alt) setElevenVoiceIdB(alt);
                                  }
                                } catch (err) {
                                  setVoicesError(
                                    err instanceof Error ? err.message : 'Failed to refresh voices'
                                  );
                                } finally {
                                  setLoadingVoices(false);
                                }
                              }}
                            >
                              {loadingVoices ? (
                                <Spinner data-icon="inline-start" />
                              ) : (
                                <RefreshCwIcon data-icon="inline-start" />
                              )}
                              Refresh voices
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {isTech
                              ? 'All Indian-English shared voices (and tech config picks). Preview is free; generating narration uses quota. Keep narration in simple English.'
                              : isDialogueEpisode
                                ? 'One list — tap A or B on any voice. Preview demos are free; generate uses more quota than single-voice.'
                                : 'Famous Hindi male narrators load from the ElevenLabs voice library. Play buttons use free demo samples (no TTS character cost).'}
                          </p>
                          {voicesError && (
                            <Alert variant="destructive">
                              <AlertTitle>Could not load some voices</AlertTitle>
                              <AlertDescription>{voicesError}</AlertDescription>
                            </Alert>
                          )}
                          {isDialogueEpisode &&
                            elevenVoiceId &&
                            elevenVoiceIdB &&
                            elevenVoiceId === elevenVoiceIdB && (
                              <Alert>
                                <AlertTitle>Same voice for A and B</AlertTitle>
                                <AlertDescription>
                                  Assign a different voice to B so the dialogue sounds like two people.
                                </AlertDescription>
                              </Alert>
                            )}
                          {isDialogueEpisode ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
                              <span className="text-muted-foreground">A · {dialogueRoleA}</span>
                              <span className="font-medium">
                                {elevenVoices.find((v) => v.id === elevenVoiceId)?.label ||
                                  elevenVoiceId ||
                                  '—'}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                disabled={generationLocked.tts || !elevenVoiceId || !elevenVoiceIdB}
                                title="Swap A and B"
                                onClick={() => {
                                  setElevenVoiceId(elevenVoiceIdB);
                                  setElevenVoiceIdB(elevenVoiceId);
                                }}
                              >
                                <ArrowLeftRightIcon className="size-3.5" />
                              </Button>
                              <span className="text-muted-foreground">B · {dialogueRoleB}</span>
                              <span className="font-medium">
                                {elevenVoices.find((v) => v.id === elevenVoiceIdB)?.label ||
                                  elevenVoiceIdB ||
                                  '—'}
                              </span>
                            </div>
                          ) : null}
                          {elevenVoices.length === 0 && !loadingVoices ? (
                            <p className="text-sm text-muted-foreground">
                              No voices yet. Set <code>ELEVENLABS_API_KEY</code>,{' '}
                              <code>ELEVENLABS_VOICES</code> / <code>ELEVENLABS_VOICE_ID</code>, or
                              add entries to <code>config/elevenlabs-voices.json</code>.
                            </p>
                          ) : (
                            <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                              {elevenVoices
                                .filter((voice) => {
                                  if (isDialogueEpisode || isTech) {
                                    return true;
                                  }
                                  if (voice.source !== 'account') return true;
                                  const blob = `${voice.label} ${voice.description || ''}`.toLowerCase();
                                  return /hindi|\bhi\b|indian|mythology|kanika|story teller|narrator/.test(
                                    blob
                                  );
                                })
                                .map((voice) => {
                                  const isA = elevenVoiceId === voice.id;
                                  const isB = elevenVoiceIdB === voice.id;
                                  const active = isDialogueEpisode ? isA || isB : isA;
                                  const isPlaying = playingVoiceId === voice.id;
                                  const hasPreview =
                                    Boolean(voice.previewUrl) ||
                                    voice.source === 'shared' ||
                                    voice.source === 'account' ||
                                    voice.source === 'config';
                                  const hindiMale =
                                    voice.source === 'shared' ||
                                    Boolean(voice.clonedByCount) ||
                                    /hindi male|male.*hindi|♂/i.test(
                                      `${voice.label} ${voice.description || ''}`
                                    );
                                  return (
                                    <div
                                      key={voice.id}
                                      className={cn(
                                        'flex flex-col gap-1 rounded-lg border p-3',
                                        active
                                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                          : 'border-border hover:border-primary/40',
                                        generationLocked.tts && 'pointer-events-none opacity-60'
                                      )}
                                    >
                                      <div className="flex items-start gap-2">
                                        <button
                                          type="button"
                                          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-foreground/10 transition hover:bg-muted/80 disabled:opacity-40"
                                          disabled={!hasPreview || generationLocked.tts}
                                          aria-label={
                                            isPlaying
                                              ? `Pause demo ${voice.label}`
                                              : `Play free demo ${voice.label}`
                                          }
                                          title={
                                            hasPreview
                                              ? 'Free demo sample (no TTS cost)'
                                              : 'No free demo available'
                                          }
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            toggleElevenVoicePreview(voice);
                                          }}
                                        >
                                          {isPlaying ? (
                                            <PauseIcon className="size-3.5" />
                                          ) : (
                                            <PlayIcon className="size-3.5" />
                                          )}
                                        </button>
                                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                                          {isDialogueEpisode ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-sm font-medium">{voice.label}</span>
                                              <Badge variant="outline">{voice.source}</Badge>
                                              {isA ? <Badge>A</Badge> : null}
                                              {isB ? <Badge variant="secondary">B</Badge> : null}
                                              <div className="ml-auto flex gap-1">
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant={isA ? 'default' : 'outline'}
                                                  className="h-7 px-2 text-xs"
                                                  disabled={generationLocked.tts}
                                                  onClick={() => setElevenVoiceId(voice.id)}
                                                >
                                                  A
                                                </Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant={isB ? 'default' : 'outline'}
                                                  className="h-7 px-2 text-xs"
                                                  disabled={generationLocked.tts}
                                                  onClick={() => setElevenVoiceIdB(voice.id)}
                                                >
                                                  B
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <label className="flex cursor-pointer flex-col gap-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <input
                                                  type="radio"
                                                  name="eleven-voice"
                                                  className="size-4 accent-[var(--primary)]"
                                                  checked={isA}
                                                  disabled={generationLocked.tts}
                                                  onChange={() => setElevenVoiceId(voice.id)}
                                                />
                                                <span className="text-sm font-medium">{voice.label}</span>
                                                <Badge variant="outline">{voice.source}</Badge>
                                                {hindiMale ? (
                                                  <Badge variant="secondary">Hindi male</Badge>
                                                ) : null}
                                              </div>
                                            </label>
                                          )}
                                          {voice.description ? (
                                            <p className="text-[0.7rem] text-muted-foreground">
                                              {voice.description}
                                            </p>
                                          ) : null}
                                          <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
                                            {voice.id}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      )}

                      {ttsKind === 'tts:sarvam' && (
                        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              {isDialogueEpisode ? 'Sarvam speakers' : 'Sarvam speaker'}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={loadingVoices || generationLocked.tts}
                              onClick={async () => {
                                try {
                                  setLoadingVoices(true);
                                  setVoicesError(null);
                                  const result = await listTtsVoices(false, 'sarvam');
                                  setSarvamVoices(result.voices);
                                  const nextA =
                                    sarvamVoiceId || result.defaultVoiceId || result.voices[0]?.id || '';
                                  if (!sarvamVoiceId && nextA) setSarvamVoiceId(nextA);
                                  if (
                                    isDialogueEpisode &&
                                    (!sarvamVoiceIdB || sarvamVoiceIdB === nextA)
                                  ) {
                                    const alt =
                                      result.voices.find((voice) => voice.id !== nextA)?.id || '';
                                    if (alt) setSarvamVoiceIdB(alt);
                                  }
                                } catch (err) {
                                  setVoicesError(
                                    err instanceof Error ? err.message : 'Failed to refresh speakers'
                                  );
                                } finally {
                                  setLoadingVoices(false);
                                }
                              }}
                            >
                              {loadingVoices ? (
                                <Spinner data-icon="inline-start" />
                              ) : (
                                <RefreshCwIcon data-icon="inline-start" />
                              )}
                              Refresh speakers
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {isDialogueEpisode
                              ? 'One list — tap A or B on any speaker. Generate stitches dialogue turns into one MP3.'
                              : 'Bulbul v3 speaker ids (lowercase). Curated list in '}
                            {!isDialogueEpisode ? (
                              <>
                                <code>config/sarvam-voices.json</code>. Set <code>SARVAM_API_KEY</code>.
                              </>
                            ) : null}
                          </p>
                          {voicesError && (
                            <Alert variant="destructive">
                              <AlertTitle>Could not load speakers</AlertTitle>
                              <AlertDescription>{voicesError}</AlertDescription>
                            </Alert>
                          )}
                          {isDialogueEpisode &&
                            sarvamVoiceId &&
                            sarvamVoiceIdB &&
                            sarvamVoiceId === sarvamVoiceIdB && (
                              <Alert>
                                <AlertTitle>Same speaker for A and B</AlertTitle>
                                <AlertDescription>
                                  Assign a different speaker to B so the dialogue sounds like two people.
                                </AlertDescription>
                              </Alert>
                            )}
                          {isDialogueEpisode ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
                              <span className="text-muted-foreground">A · {dialogueRoleA}</span>
                              <span className="font-medium">
                                {sarvamVoices.find((v) => v.id === sarvamVoiceId)?.label ||
                                  sarvamVoiceId ||
                                  '—'}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                disabled={generationLocked.tts || !sarvamVoiceId || !sarvamVoiceIdB}
                                title="Swap A and B"
                                onClick={() => {
                                  setSarvamVoiceId(sarvamVoiceIdB);
                                  setSarvamVoiceIdB(sarvamVoiceId);
                                }}
                              >
                                <ArrowLeftRightIcon className="size-3.5" />
                              </Button>
                              <span className="text-muted-foreground">B · {dialogueRoleB}</span>
                              <span className="font-medium">
                                {sarvamVoices.find((v) => v.id === sarvamVoiceIdB)?.label ||
                                  sarvamVoiceIdB ||
                                  '—'}
                              </span>
                            </div>
                          ) : null}
                          {sarvamVoices.length === 0 && !loadingVoices ? (
                            <p className="text-sm text-muted-foreground">
                              No speakers listed. Check <code>config/sarvam-voices.json</code>.
                            </p>
                          ) : (
                            <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                              {sarvamVoices.map((voice) => {
                                const isA = sarvamVoiceId === voice.id;
                                const isB = sarvamVoiceIdB === voice.id;
                                const active = isDialogueEpisode ? isA || isB : isA;
                                return (
                                  <div
                                    key={voice.id}
                                    className={cn(
                                      'flex flex-col gap-1 rounded-lg border p-3',
                                      active
                                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                        : 'border-border hover:border-primary/40',
                                      generationLocked.tts && 'pointer-events-none opacity-60'
                                    )}
                                  >
                                    {isDialogueEpisode ? (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">{voice.label}</span>
                                        <Badge variant="outline">{voice.source}</Badge>
                                        {isA ? <Badge>A</Badge> : null}
                                        {isB ? <Badge variant="secondary">B</Badge> : null}
                                        <div className="ml-auto flex gap-1">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant={isA ? 'default' : 'outline'}
                                            className="h-7 px-2 text-xs"
                                            disabled={generationLocked.tts}
                                            onClick={() => setSarvamVoiceId(voice.id)}
                                          >
                                            A
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant={isB ? 'default' : 'outline'}
                                            className="h-7 px-2 text-xs"
                                            disabled={generationLocked.tts}
                                            onClick={() => setSarvamVoiceIdB(voice.id)}
                                          >
                                            B
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <label className="flex cursor-pointer flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="radio"
                                            name="sarvam-voice"
                                            className="size-4 accent-[var(--primary)]"
                                            checked={isA}
                                            disabled={generationLocked.tts}
                                            onChange={() => setSarvamVoiceId(voice.id)}
                                          />
                                          <span className="text-sm font-medium">{voice.label}</span>
                                          <Badge variant="outline">{voice.source}</Badge>
                                        </div>
                                      </label>
                                    )}
                                    {voice.description ? (
                                      <p className="text-[0.7rem] text-muted-foreground">
                                        {voice.description}
                                      </p>
                                    ) : null}
                                    <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
                                      {voice.id}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-sm font-medium">2 · Narration takes</p>
                        <label className="mt-3 block text-sm">Upload your narration MP3 / WAV
                          <input type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" className="mt-2 block w-full text-sm"
                            disabled={episodePublished || jobBusy || saving || !approvals.script}
                            onChange={async (event) => {
                              const file = event.target.files?.[0]; event.target.value = '';
                              if (!file || !selectedFile) return;
                              setJobBusy(true);
                              try {
                                const upload = await uploadEpisodeAudio(selectedFile, detail.episode.id, file);
                                if (activeEpisodeRef.current !== selectedFile) return;
                                await persistApprovals({ ...approvals, tts: false }, { ...selectedAssets, audio: upload.path });
                                setGenerationOpen((previous) => ({ ...previous, tts: true, produce: true }));
                                toast.success('Narration uploaded. Listen, then approve this take.');
                              } catch (error) { toast.error(error instanceof Error ? error.message : 'Voice upload failed'); }
                              finally { setJobBusy(false); }
                            }} />
                        </label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Pick the voice track Sound Director will mix. Mixed files appear in step 4.
                        </p>
                      </div>
                      {narrationTakes(detail.assets.audio, detail.episode.id).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No narration yet. Choose a provider above, then Generate.
                        </p>
                      ) : (
                        narrationTakes(detail.assets.audio, detail.episode.id).map((file) => {
                          const active = selectedAssets.audio === file.path;
                          return (
                            <label
                              key={file.path}
                              className={cn(
                                'flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors',
                                active
                                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                  : 'border-border hover:border-primary/40'
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="radio"
                                  name="selected-audio"
                                  className="size-4 accent-[var(--primary)]"
                                  checked={active}
                                  onChange={() =>
                                    setSelectedAssets((prev) => ({ ...prev, audio: file.path }))
                                  }
                                />
                                <span className="truncate text-sm font-medium">{file.name}</span>
                                <SourceTag provider={file.provider} path={file.path} />
                                <Badge variant={active ? 'secondary' : 'outline'}>
                                  {active ? 'selected narration' : 'pick this take'}
                                </Badge>
                              </div>
                              <audio
                                key={`${file.path}:${file.mtimeMs}`}
                                controls
                                src={mediaUrlWithCacheBust(file)}
                                className="w-full max-w-2xl"
                              />
                              <p className="truncate text-[0.7rem] text-muted-foreground">{file.path}</p>
                            </label>
                          );
                        })
                      )}
                    </div>

                    <div
                      className={cn(
                        'flex flex-col gap-3 rounded-xl border border-border bg-muted/15 p-4',
                        generationLocked.tts && 'generation-locked'
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium">3 · Sound Director (SFX + BGM)</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Plan cues from the library ids, pick BGM, then mix. Missing SFX files are{' '}
                          <strong>skipped automatically</strong> (not auto-generated). Optionally
                          upload a WAV to <code>sfx/custom/</code> or opt-in Generate EL for a cue —
                          neither is required to finish the mix.
                        </p>
                      </div>
                      {sfxMissing.length > 0 ? (
                        <Alert>
                          <AlertTitle>Missing SFX (optional)</AlertTitle>
                          <AlertDescription className="space-y-2 text-sm">
                            <p>
                              {sfxMissing.length} cue
                              {sfxMissing.length === 1 ? '' : 's'} not on disk:{' '}
                              <code>{sfxMissing.join(', ')}</code>. Mix will skip them. Upload a
                              short WAV/MP3 per id if you want that hit, or leave blank.
                            </p>
                          </AlertDescription>
                        </Alert>
                      ) : null}
                      <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-background/60 px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                              Background music
                            </p>
                            {selectedBgm ? (
                              <p className="mt-0.5 truncate text-sm">
                                <span className="font-medium">{selectedBgm.label}</span>
                                <span className="text-muted-foreground">
                                  {' '}
                                  · {selectedBgm.groupLabel} · planned SFX included
                                </span>
                              </p>
                            ) : (
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                Auto from plan mood
                                {detail.episode.audioPlan?.bgmMood ? (
                                  <>
                                    {' '}
                                    (<code className="text-foreground">
                                      {detail.episode.audioPlan.bgmMood}
                                    </code>
                                    )
                                  </>
                                ) : null}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={jobBusy || generationLocked.tts}
                              onClick={() => setBgmPickerOpen(true)}
                            >
                              <Music2Icon data-icon="inline-start" />
                              {selectedBgm ? 'Change BGM' : 'Add BGM'}
                            </Button>
                            {selectedBgm ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={jobBusy || generationLocked.tts}
                                onClick={() => setSelectedBgm(null)}
                              >
                                Clear
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            jobBusy ||
                            generationLocked.tts ||
                            narrationTakes(detail.assets.audio, detail.episode.id).length === 0
                          }
                          onClick={() => onRun('audio:plan')}
                        >
                          {activeJob === 'audio:plan' ? (
                            <Spinner data-icon="inline-start" />
                          ) : null}
                          1. AI plan SFX
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-amber-500/40 hover:border-amber-500/60 hover:bg-amber-500/5"
                          disabled={
                            jobBusy ||
                            generationLocked.tts ||
                            sfxElEffects.length === 0 ||
                            !detail.episode.audioPlan?.sfx?.length
                          }
                          onClick={async () => {
                            const effects = [...new Set(sfxElEffects)].sort().join(',');
                            const result = await onRun('audio:sfx-el', { effects });
                            if (result?.ok) {
                              toast.success(
                                `Saved ${sfxElEffects.length} ElevenLabs SFX to custom/ for future mixes`
                              );
                              setSfxElEffects([]);
                              if (detail.episode.audioPlan?.sfx) {
                                void getSfxStatus(
                                  detail.episode.audioPlan.sfx.map((cue) => cue.effect)
                                ).then((status) => setSfxMissing(status.missing));
                              }
                            }
                          }}
                        >
                          {activeJob === 'audio:sfx-el' ? (
                            <Spinner data-icon="inline-start" />
                          ) : null}
                          Opt-in Generate EL ({sfxElEffects.length || 0})
                        </Button>
                        <Button
                          type="button"
                          disabled={
                            jobBusy ||
                            generationLocked.tts ||
                            (!selectedBgm && !detail.episode.audioPlan?.sfx?.length) ||
                            !selectedAssets.audio ||
                            selectedAssets.audio.includes('final-mix') ||
                            selectedAssets.audio.includes('sfx-mix')
                          }
                          onClick={async () => {
                            const narrationPath = selectedAssets.audio;
                            if (
                              !narrationPath ||
                              narrationPath.includes('final-mix') ||
                              narrationPath.includes('sfx-mix')
                            ) {
                              toast.error('Select a narration take in step 2 first');
                              return;
                            }
                            const result = await onRun('audio:mix', {
                              audio: narrationPath.replace(/^output[/\\]/, ''),
                              ...(selectedBgm
                                ? { bgm: `assets/audio/bgm/${selectedBgm.relativePath}` }
                                : {})
                            });
                            if (result?.ok && selectedFile) {
                              const next = await getEpisode(selectedFile);
                              setDetail(next);
                              const mixes = mixedTakes(next.assets.audio, next.episode.id);
                              // Newest take first (timestamped *-final-mix-YYYY….wav).
                              const finalMix =
                                mixes.find((f) => /final-mix-\d{14}\.wav$/i.test(f.name)) ||
                                mixes.find((f) => f.name.includes('final-mix')) ||
                                mixes[0];
                              if (finalMix) {
                                setSelectedAssets((prev) => ({ ...prev, audio: finalMix.path }));
                                toast.success(
                                  selectedBgm
                                    ? `New mix take: ${finalMix.name}`
                                    : `New mix take: ${finalMix.name}`
                                );
                              }
                            }
                          }}
                        >
                          {activeJob === 'audio:mix' ? (
                            <Spinner data-icon="inline-start" />
                          ) : null}
                          {selectedBgm
                            ? '2. Mix narration + BGM + SFX'
                            : '2. Mix with library / custom'}
                        </Button>
                      </div>

                      {detail.episode.audioPlan ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs text-muted-foreground">
                            BGM mood:{' '}
                            <code className="text-foreground">{detail.episode.audioPlan.bgmMood}</code>
                            {' · '}
                            {detail.episode.audioPlan.sfx.length} cues
                            {detail.episode.audioPlan.narrationDurationSeconds
                              ? ` · clock ${detail.episode.audioPlan.narrationDurationSeconds.toFixed(1)}s TTS`
                              : null}
                            {detail.episode.audioPlan.sfxUsage ? (
                              <>
                                {' · '}
                                <span className="text-foreground">
                                  {detail.episode.audioPlan.sfxUsage.local} local
                                </span>
                                {' / '}
                                <span className="text-foreground">
                                  {detail.episode.audioPlan.sfxUsage.elevenlabs} ElevenLabs
                                </span>
                                {detail.episode.audioPlan.sfxUsage.skipped ? (
                                  <>
                                    {' / '}
                                    <span className="text-amber-700">
                                      {detail.episode.audioPlan.sfxUsage.skipped} skipped
                                    </span>
                                  </>
                                ) : null}
                              </>
                            ) : (
                              <span>
                                {' '}
                                · missing files are skipped; upload or opt-in EL only if you want them
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              disabled={generationLocked.tts || !detail.episode.audioPlan.sfx.length}
                              onClick={() =>
                                setSfxElEffects([
                                  ...new Set(detail.episode.audioPlan!.sfx.map((cue) => cue.effect))
                                ])
                              }
                            >
                              Select all EL
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              disabled={generationLocked.tts || sfxElEffects.length === 0}
                              onClick={() => setSfxElEffects([])}
                            >
                              Clear EL
                            </Button>
                          </div>
                          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background/80">
                            <table className="w-full text-left text-xs">
                              <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                                <tr>
                                  <th className="px-2 py-1.5 font-medium">EL</th>
                                  <th className="px-2 py-1.5 font-medium">Time</th>
                                  <th className="px-2 py-1.5 font-medium">Effect</th>
                                  <th className="px-2 py-1.5 font-medium">Src</th>
                                  <th className="px-2 py-1.5 font-medium">Vol</th>
                                  <th className="px-2 py-1.5 font-medium">Upload</th>
                                  <th className="px-2 py-1.5 font-medium">Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.episode.audioPlan.sfx.map((cue, index) => {
                                  const usage = detail.episode.audioPlan?.sfxUsage?.cues?.find(
                                    (item) => item.effect === cue.effect
                                  );
                                  const missing = sfxMissing.includes(cue.effect);
                                  const src =
                                    usage?.source === 'elevenlabs'
                                      ? 'EL'
                                      : usage?.source === 'custom'
                                        ? 'custom'
                                        : usage?.source === 'skipped'
                                          ? 'skip'
                                          : usage
                                            ? 'local'
                                            : missing
                                              ? 'miss'
                                              : '—';
                                  const elChecked = sfxElEffects.includes(cue.effect);
                                  return (
                                    <tr
                                      key={`${cue.effect}-${cue.time}-${index}`}
                                      className="border-t border-border/60"
                                    >
                                      <td className="px-2 py-1.5">
                                        <Checkbox
                                          checked={elChecked}
                                          disabled={generationLocked.tts || jobBusy}
                                          onCheckedChange={(checked) => {
                                            setSfxElEffects((prev) => {
                                              if (checked === true) {
                                                return prev.includes(cue.effect)
                                                  ? prev
                                                  : [...prev, cue.effect];
                                              }
                                              return prev.filter((id) => id !== cue.effect);
                                            });
                                          }}
                                          aria-label={`Request ElevenLabs for ${cue.effect}`}
                                        />
                                      </td>
                                      <td className="px-2 py-1.5 font-mono">{cue.time.toFixed(2)}s</td>
                                      <td className="px-2 py-1.5">{cue.effect}</td>
                                      <td
                                        className={cn(
                                          'px-2 py-1.5 font-mono text-muted-foreground',
                                          (missing || usage?.source === 'skipped') && 'text-amber-700'
                                        )}
                                      >
                                        {src}
                                      </td>
                                      <td className="px-2 py-1.5 font-mono">{cue.volume}</td>
                                      <td className="px-2 py-1.5">
                                        <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline">
                                          <input
                                            type="file"
                                            accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
                                            className="sr-only"
                                            disabled={
                                              generationLocked.tts ||
                                              jobBusy ||
                                              sfxUploadBusy === cue.effect
                                            }
                                            onChange={async (event) => {
                                              const file = event.target.files?.[0];
                                              event.target.value = '';
                                              if (!file) return;
                                              setSfxUploadBusy(cue.effect);
                                              try {
                                                await uploadCustomSfx(cue.effect, file);
                                                toast.success(`Uploaded custom/${cue.effect}.wav`);
                                                setSfxMissing((prev) =>
                                                  prev.filter((id) => id !== cue.effect)
                                                );
                                              } catch (err) {
                                                toast.error(
                                                  err instanceof Error ? err.message : 'Upload failed'
                                                );
                                              } finally {
                                                setSfxUploadBusy(null);
                                              }
                                            }}
                                          />
                                          {sfxUploadBusy === cue.effect
                                            ? '…'
                                            : missing
                                              ? 'Upload'
                                              : 'Replace'}
                                        </label>
                                      </td>
                                      <td className="px-2 py-1.5 text-muted-foreground">{cue.reason}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No plan yet. Run <strong>AI plan SFX</strong> after you have a narration take.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-sm font-medium">4 · Mixed audio (approve this for produce)</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Pick the newest <code>*-final-mix-….wav</code> (voice + SFX + BGM). Avoid{' '}
                          <code>*-sfx-mix*</code> — that has no BGM bed. You can still approve raw
                          narration if you skip Sound Director.
                        </p>
                      </div>
                      {mixedTakes(detail.assets.audio, detail.episode.id).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No mix yet. Complete step 3, or approve a narration take from step 2.
                        </p>
                      ) : (
                        mixedTakes(detail.assets.audio, detail.episode.id).map((file) => {
                          const active = selectedAssets.audio === file.path;
                          return (
                            <label
                              key={file.path}
                              className={cn(
                                'flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors',
                                active
                                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                  : 'border-border hover:border-primary/40'
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="radio"
                                  name="selected-audio-mix"
                                  className="size-4 accent-[var(--primary)]"
                                  checked={active}
                                  onChange={() =>
                                    setSelectedAssets((prev) => ({ ...prev, audio: file.path }))
                                  }
                                />
                                <span className="truncate text-sm font-medium">{file.name}</span>
                                <SourceTag provider={file.provider} path={file.path} />
                                {typeof file.durationSeconds === 'number' ? (
                                  <Badge variant="outline">
                                    {file.durationSeconds >= 60
                                      ? `${Math.floor(file.durationSeconds / 60)}:${String(
                                          Math.round(file.durationSeconds % 60)
                                        ).padStart(2, '0')}`
                                      : `${file.durationSeconds.toFixed(1)}s`}
                                  </Badge>
                                ) : null}
                                <Badge variant={active ? 'secondary' : 'outline'}>
                                  {active ? 'selected for approve' : 'pick this mix'}
                                </Badge>
                              </div>
                              <audio
                                key={`${file.path}:${file.mtimeMs}`}
                                controls
                                src={mediaUrlWithCacheBust(file)}
                                className="w-full max-w-2xl"
                              />
                              <p className="truncate text-[0.7rem] text-muted-foreground">{file.path}</p>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </CardContent>
              {approvals.script && (
                <CardFooter className="flex flex-wrap gap-2">
                  {visualProblems.length > 0 && <p className="w-full text-xs text-amber-700">{visualProblems.join(' · ')}</p>}
                  {!generationLocked.tts && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-primary/30 bg-background text-foreground hover:border-primary/50 hover:bg-accent/50"
                      disabled={
                        jobBusy ||
                        (ttsKind === 'tts:elevenlabs' && !elevenVoiceId) ||
                        (ttsKind === 'tts:elevenlabs' && isDialogueEpisode && !elevenVoiceIdB) ||
                        (ttsKind === 'tts:sarvam' && !sarvamVoiceId) ||
                        (ttsKind === 'tts:sarvam' && isDialogueEpisode && !sarvamVoiceIdB)
                      }
                      onClick={() =>
                        onRun(
                          ttsKind,
                          ttsKind === 'tts:elevenlabs' && elevenVoiceId
                            ? {
                                voiceId: elevenVoiceId,
                                ...(isDialogueEpisode && elevenVoiceIdB
                                  ? { voiceIdB: elevenVoiceIdB }
                                  : {})
                              }
                            : ttsKind === 'tts:sarvam' && sarvamVoiceId
                              ? {
                                  voiceId: sarvamVoiceId,
                                  ...(isDialogueEpisode && sarvamVoiceIdB
                                    ? { voiceIdB: sarvamVoiceIdB }
                                    : {})
                                }
                              : {}
                        )
                      }
                    >
                      {activeJob === ttsKind ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <MicIcon data-icon="inline-start" />
                      )}
                      {ttsKind === 'tts:free'
                        ? 'Generate with Edge TTS (free)'
                        : ttsKind === 'tts:sarvam'
                          ? isDialogueEpisode
                            ? (() => {
                                const labelA =
                                  sarvamVoices.find((v) => v.id === sarvamVoiceId)?.label || 'A';
                                const labelB =
                                  sarvamVoices.find((v) => v.id === sarvamVoiceIdB)?.label || 'B';
                                return sarvamVoiceId && sarvamVoiceIdB
                                  ? `Generate dialogue · ${labelA} + ${labelB}`
                                  : 'Generate dialogue (pick A + B)';
                              })()
                            : sarvamVoices.find((voice) => voice.id === sarvamVoiceId)?.label
                              ? `Generate with Sarvam · ${sarvamVoices.find((voice) => voice.id === sarvamVoiceId)!.label}`
                              : 'Generate with Sarvam'
                          : isDialogueEpisode
                            ? (() => {
                                const labelA =
                                  elevenVoices.find((v) => v.id === elevenVoiceId)?.label || 'A';
                                const labelB =
                                  elevenVoices.find((v) => v.id === elevenVoiceIdB)?.label || 'B';
                                return elevenVoiceId && elevenVoiceIdB
                                  ? `Generate dialogue · ${labelA} + ${labelB}`
                                  : 'Generate dialogue (pick A + B)';
                              })()
                            : elevenVoices.find((voice) => voice.id === elevenVoiceId)?.label
                              ? `Generate with ${elevenVoices.find((voice) => voice.id === elevenVoiceId)!.label}`
                              : 'Generate with ElevenLabs (paid)'}
                    </Button>
                  )}
                  {approvals.tts && !voiceSelectionChanged ? (
                    <Button
                      size="lg"
                      onClick={() => setPhase('images')}
                    >
                      {isTech ? 'Continue to Scenes' : 'Continue to Images'}
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      className="bg-primary text-primary-foreground shadow-sm"
                      disabled={saving || !selectedAssets.audio}
                      onClick={async () => {
                        if (!selectedAssets.audio) {
                          toast.error('Select which audio take to approve');
                          return;
                        }
                        const next = await persistApprovals(
                          { ...approvals, tts: true },
                          { ...selectedAssets, audio: selectedAssets.audio }
                        );
                        if (next) {
                          setGenerationOpen((previous) => ({ ...previous, tts: false }));
                          setPhase('images');
                        }
                      }}
                    >
                      {saving ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <BadgeCheckIcon data-icon="inline-start" />
                      )}
                      {isTech
                        ? voiceSelectionChanged
                          ? 'Use selected voice → Scenes'
                          : 'Approve selected voice → Scenes'
                        : voiceSelectionChanged
                          ? 'Use selected voice → Images'
                          : 'Approve selected voice → Images'}
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                  )}
                </CardFooter>
              )}
            </Card>
          )}

          {phase === 'images' && detail && !creating && isTech && (
            <TechScenesPanel
              key={detail.episode.id}
              reelId={linkedTechReelId || undefined}
              episodeTitle={detail.episode.titleEn || detail.episode.titleHi || detail.episode.id}
              continueBusy={saving}
              onContinue={async () => {
                await persistApprovals({ ...approvals, images: true }, selectedAssets);
                setPhase('produce');
              }}
            />
          )}

          {phase === 'images' && detail && !creating && !isTech && (
            <Card>
              <CardHeader>
                <CardTitle>Plan the visuals</CardTitle>
                <CardDescription>
                  Place your avatar clips anywhere, then generate artwork for the remaining sections.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {!approvals.script ? (
                  <Alert>
                    <AlertTitle>Locked</AlertTitle>
                    <AlertDescription>Approve the script first.</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <SceneVisualEditor key={detail.episode.id} detail={detail} selected={selectedAssets}
                      disabled={episodePublished || jobBusy || saving}
                      onChange={changeVisualPlan} onUpload={uploadVisualClip} />
                    <Button variant="outline" className="self-start" disabled={episodePublished || jobBusy || saving}
                      onClick={() => void persistApprovals(approvals, selectedAssets)}>Save visual plan</Button>
                    <p className="text-xs text-muted-foreground">
                      Saving keeps hook/ending videos and still choices. Use <span className="font-medium text-foreground">Approve visuals → Produce</span> when ready — that clears “Needs review”.
                    </p>
                    {generationLocked.images && (
                      <div className="review-lock-note">
                        <div>
                          <p className="text-sm font-semibold">
                            {episodePublished
                              ? 'Published — editing locked'
                              : approvals.images
                                ? 'Images approved'
                                : 'Images ready for review'}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {episodePublished
                              ? 'Images cannot be changed on a published Short. Create another draft for a new set.'
                              : 'The selected stills are locked for production. Open another image set to change a provider, regenerate one scene, or select a new version.'}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() =>
                            reopenGeneration(episodePublished ? 'script' : 'images')
                          }
                        >
                          {episodePublished ? 'Create another draft' : 'Create another image set'}
                        </Button>
                      </div>
                    )}
                    <FieldGroup
                      className={cn(generationLocked.images && approvals.images && 'generation-locked')}
                    >
                      <Field>
                        <FieldLabel>Image provider</FieldLabel>
                        <Select
                          value={imageProvider}
                          disabled={generationLocked.images || jobBusy || imageFixBusy}
                          onValueChange={setImageProvider}
                        >
                          <SelectTrigger className="w-full max-w-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="pollinations">Pollinations · Free</SelectItem>
                              <SelectItem value="gemini">Gemini · Paid</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      {!isTechPipeline(detail.episode.brandId) &&
                      detail.episode.storyKind !== 'TECH_EDUCATION' ? (
                        <Field>
                          <FieldLabel>EpicAstra Heritage Frame</FieldLabel>
                          <FieldDescription>
                            One thin frame family for the whole episode. Demo makes a single free
                            preview so you can check the look before generating every scene.
                          </FieldDescription>
                          <Select
                            value={frameVariant}
                            disabled={generationLocked.images || jobBusy || imageFixBusy}
                            onValueChange={(value) =>
                              setFrameVariant(
                                value as 'HERITAGE_LIGHT' | 'HERITAGE_CLASSIC' | 'HERITAGE_DRAMATIC'
                              )
                            }
                          >
                            <SelectTrigger className="w-full max-w-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="HERITAGE_LIGHT">
                                  Heritage Light · childhood / festivals
                                </SelectItem>
                                <SelectItem value="HERITAGE_CLASSIC">
                                  Heritage Classic · default mythology
                                </SelectItem>
                                <SelectItem value="HERITAGE_DRAMATIC">
                                  Heritage Dramatic · battles / mystery
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      ) : (
                        <Field>
                          <FieldLabel>Tech Editorial</FieldLabel>
                          <FieldDescription>
                            Clean 9:16 diagrams — no heritage frame. Describe structure in
                            visualPrompt; prefer Remotion overlays for exact Big-O, indexes, and
                            code (AI images often corrupt those glyphs).
                          </FieldDescription>
                        </Field>
                      )}
                    </FieldGroup>

                    {!isTechPipeline(detail.episode.brandId) &&
                    detail.episode.storyKind !== 'TECH_EDUCATION' ? (
                      <div
                        className={cn(
                          'flex flex-col gap-3 rounded-xl border border-border bg-muted/15 p-4',
                          generationLocked.images && 'generation-locked'
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">Heritage frame demo</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              One free Pollinations still of this episode’s look (
                              {frameVariant.replace(/_/g, ' ')}, thin border — same as production).
                              Does not use Gemini.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              jobBusy || imageFixBusy || generationLocked.images || !approvals.script
                            }
                            onClick={async () => {
                              const result = await onRun('images:demo', {
                                frameVariant
                              });
                              if (result?.ok) {
                                toast.success(`Free demo ready · ${frameVariant}`);
                              }
                            }}
                          >
                            {activeJob === 'images:demo' ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <SparklesIcon data-icon="inline-start" />
                            )}
                            Generate free demo
                          </Button>
                        </div>
                        {detail.assets.heritageDemos?.thin && (
                          <figure className="mx-auto w-full max-w-[220px] overflow-hidden rounded-lg border border-border bg-background">
                            <img
                              src={`${detail.assets.heritageDemos.thin.url}?v=${detail.assets.heritageDemos.thin.mtimeMs}`}
                              alt="Thin heritage frame demo"
                              className="aspect-[9/16] w-full object-cover"
                            />
                            <figcaption className="px-3 py-2 text-xs text-muted-foreground">
                              Thin frame preview · free · matches production
                            </figcaption>
                          </figure>
                        )}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                      {detail.episode.scenes.length === 0 &&
                      !detail.assets.images.some((i) => i.sceneId === 0) &&
                      !hasSpokenHook(detail.episode.spokenHook) ? (
                        <p className="col-span-full text-sm text-muted-foreground">No scenes.</p>
                      ) : (
                        (() => {
                          let rows;
                          try {
                            rows = visualRows(detail, selectedAssets);
                          } catch {
                            rows = visualRows(detail, { ...selectedAssets, sceneVisuals: undefined });
                          }
                          return rows.map((row) => {
                          const source = visualSource(row.id, row.renderMode, selectedAssets.sceneVisuals);
                          const imageKey = row.id === -1 ? detail.episode.scenes.at(-1)!.id : row.id;
                          const showVideo =
                            source === 'upload' ||
                            (source === 'ai' && Boolean(selectedAssets.clips?.[String(row.id)]));
                          const clipPath = selectedAssets.clips?.[String(row.id)];
                          const clipAsset = detail.assets.images
                            .flatMap((asset) => asset.clipCandidates || [])
                            .find((asset) => asset.path === clipPath);
                          if (showVideo) {
                            return (
                              <div
                                key={`video-${row.id}`}
                                className="overflow-hidden rounded-xl border border-border"
                              >
                                {clipAsset?.url ? (
                                  <video
                                    key={clipAsset.path}
                                    src={clipAsset.url}
                                    muted
                                    playsInline
                                    controls
                                    preload="metadata"
                                    className="aspect-[9/16] w-full bg-black object-contain"
                                  />
                                ) : (
                                  <div className="flex aspect-[9/16] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                                    Video needed
                                  </div>
                                )}
                                <div className="flex flex-col gap-1 px-2 py-1.5 text-xs">
                                  <span className="text-muted-foreground">{row.label}</span>
                                  <Badge variant="secondary">
                                    {source === 'ai' ? 'AI video' : 'Uploaded video'}
                                  </Badge>
                                  <p className="text-[11px] leading-4 text-muted-foreground">
                                    Image skipped — switch to Image / Gemini artwork to generate a still.
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          // Ending artwork reuses the last image scene tile — no duplicate card.
                          if (row.id === -1) return null;
                          if (!neededImageIds.includes(row.id === 0 ? 0 : imageKey)) return null;
                          const item =
                            detail.assets.images.find((i) => i.sceneId === imageKey) ||
                            ({
                              sceneId: imageKey,
                              imageCandidates: [],
                              clipCandidates: []
                            } as SceneAsset);
                          const pathKey =
                            selectedAssets.images?.[String(imageKey)] ||
                            item.imagePath ||
                            item.imageCandidates?.[0]?.path;
                          const imageMeta = item.imageCandidates?.find(
                            (candidate) => candidate.path === pathKey
                          );
                          const imageUrl =
                            (pathKey
                              ? `/api/media/${pathKey}?v=${imageMeta?.mtimeMs || Date.now()}`
                              : item.image) || undefined;
                          const active = Boolean(
                            pathKey && selectedAssets.images?.[String(imageKey)] === pathKey
                          );
                          const fixingThis = imageFixBusy && imageFixScene === imageKey;
                          return (
                            <div
                              key={`image-${row.id}`}
                              className={cn(
                                'overflow-hidden rounded-xl border text-left transition-all',
                                active
                                  ? 'border-primary ring-2 ring-primary/20'
                                  : 'border-border hover:border-primary/40'
                              )}
                            >
                              <button
                                type="button"
                                className="block w-full text-left"
                                disabled={!imageUrl || generationLocked.images}
                                onClick={() => {
                                  if (!pathKey) return;
                                  setSelectedAssets((prev) => {
                                    const key = String(imageKey);
                                    const current = prev.images?.[key];
                                    if (current === pathKey) {
                                      const images = { ...(prev.images || {}) };
                                      delete images[key];
                                      return {
                                        ...prev,
                                        images: Object.keys(images).length ? images : undefined
                                      };
                                    }
                                    return {
                                      ...prev,
                                      images: {
                                        ...(prev.images || {}),
                                        [key]: pathKey
                                      }
                                    };
                                  });
                                }}
                              >
                                {imageUrl ? (
                                  <img
                                    key={imageUrl}
                                    src={imageUrl}
                                    alt={row.label}
                                    className="aspect-[9/16] w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex aspect-[9/16] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                                    No still yet
                                  </div>
                                )}
                              </button>
                              <div className="flex flex-col gap-1.5 px-2 py-1.5 text-xs">
                                <div className="flex items-start justify-between gap-1">
                                  <span className="flex min-w-0 flex-col gap-1">
                                    <span className="text-muted-foreground">{row.label}</span>
                                    {imageUrl ? (
                                      <SourceTag provider={imageMeta?.provider} path={pathKey} />
                                    ) : null}
                                  </span>
                                  {imageUrl ? (
                                    <Badge variant={active ? 'secondary' : 'outline'}>
                                      {active ? 'use' : 'pick'}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 w-full text-[11px]"
                                    disabled={copyPromptScene === imageKey}
                                    onClick={() => void copySceneImagePrompt(imageKey)}
                                  >
                                    {copyPromptScene === imageKey ? (
                                      <Spinner data-icon="inline-start" />
                                    ) : (
                                      <CopyIcon data-icon="inline-start" />
                                    )}
                                    Copy prompt
                                  </Button>
                                  {!generationLocked.images && (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 w-full text-[11px]"
                                        disabled={jobBusy || imageFixBusy || stillUploadBusy}
                                        onClick={() => setStillUploadScene(imageKey)}
                                      >
                                        <UploadIcon data-icon="inline-start" />
                                        Upload
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 w-full border-amber-500/40 text-[11px] hover:border-amber-500/60 hover:bg-amber-500/5"
                                        disabled={jobBusy || imageFixBusy || stillUploadBusy}
                                        onClick={() => {
                                          setImageFixScene(imageKey);
                                          setImageFixFeedback('');
                                        }}
                                      >
                                        {fixingThis ? (
                                          <Spinner data-icon="inline-start" />
                                        ) : (
                                          <RefreshCwIcon data-icon="inline-start" />
                                        )}
                                        Regenerate
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                          });
                        })()
                      )}
                    </div>
                    {selectedAssets.audio && (
                      <p className="text-xs text-muted-foreground">
                        Locked voice for produce: <code>{selectedAssets.audio}</code>
                      </p>
                    )}

                    {selectedFile ? (
                      <WanSceneRenderer
                        detail={detail}
                        episodeFile={selectedFile}
                        selected={selectedAssets}
                        disabled={episodePublished || !approvals.script}
                        onChange={(next) => {
                          setSelectedAssets(next);
                        }}
                        onPersistSelection={async (selectedOverride) => {
                          const saved = await persistApprovals(
                            approvals,
                            selectedOverride ?? selectedAssets
                          );
                          return Boolean(saved);
                        }}
                        onOpenPromptEditor={() => {
                          if (!neededImageIds.length) {
                            toast.message(
                              techVisualCoversImages
                                ? 'No AI image prompts — Remotion tech diagrams cover this episode. Approve visuals → Produce (Remotion + voice).'
                                : 'No AI image prompts for this visual plan.'
                            );
                            return;
                          }
                          setImagePromptsOpen(true);
                        }}
                        onRefresh={async () => {
                          if (!selectedFile) return;
                          const updated = await getEpisode(selectedFile);
                          setDetail(updated);
                          setSelectedAssets((prev) => {
                            const clips = { ...(prev.clips || {}) };
                            const sceneVisuals = { ...(prev.sceneVisuals || {}) };
                            for (const scene of updated.episode.scenes) {
                              const stable = `ai-video/${updated.episode.id}/scene-${scene.id}.mp4`;
                              const candidates =
                                updated.assets.images.find((row) => row.sceneId === scene.id)
                                  ?.clipCandidates || [];
                              const match =
                                candidates.find((c) => c.path === stable) ||
                                candidates.find((c) => (c.provider || '').includes('wan')) ||
                                candidates.find((c) => c.path.includes(`scene-${scene.id}`));
                              if (match?.path) {
                                clips[String(scene.id)] = match.path;
                                sceneVisuals[scene.id] = {
                                  ...sceneVisuals[scene.id],
                                  source: 'ai'
                                };
                              }
                            }
                            return { ...prev, clips, sceneVisuals };
                          });
                        }}
                      />
                    ) : null}
                  </>
                )}
              </CardContent>
              {approvals.script && (
                <CardFooter className="flex flex-wrap gap-2">
                  {!generationLocked.images && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-primary/30 bg-background text-foreground hover:border-primary/50 hover:bg-accent/50"
                      disabled={jobBusy || imageFixBusy || saving || !neededImageIds.length}
                      onClick={async () => {
                        if (await persistApprovals(approvals, selectedAssets)) setImagePromptsOpen(true);
                      }}
                    >
                      {activeJob === 'images' ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <ImageIcon data-icon="inline-start" />
                      )}
                      {neededImageIds.length
                        ? missingImageIds.length
                          ? `Review prompts & generate missing (${missingImageIds.length})`
                          : `All ${neededImageIds.length} stills present — review prompts`
                        : techVisualCoversImages
                          ? 'No AI images — techVisual diagrams'
                          : 'No images needed for video scenes'}
                    </Button>
                  )}
                  {neededImageIds.length === 0 && !generationLocked.images && (
                    <p className="basis-full text-xs text-muted-foreground">
                      {techVisualCoversImages
                        ? 'This episode uses Remotion Algo Lab (same paper chrome as the Scale Lab sample). AI image prompts are skipped — approve visuals and Produce to render Remotion then mux voice with FFmpeg.'
                        : 'Every section uses video — approve visuals and continue to Produce.'}
                    </p>
                  )}
                  {neededImageIds.length > 0 &&
                    missingImageIds.length < neededImageIds.length &&
                    !generationLocked.images && (
                      <p className="basis-full text-xs text-muted-foreground">
                        Generate fills empty slots only. Uploaded / existing stills are kept — use
                        Regenerate on a card to replace one.
                      </p>
                    )}
                  {approvals.images && !imageSelectionChanged ? (
                    <Button
                      size="lg"
                      onClick={() => setPhase('produce')}
                    >
                      Continue to Produce
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      className="bg-primary text-primary-foreground shadow-sm"
                      disabled={saving || jobBusy || visualProblems.length > 0}
                      onClick={async () => {
                        const images: Record<string, string> = { ...(selectedAssets.images || {}) };
                        for (const scene of detail.assets.images) {
                          const key = String(scene.sceneId);
                          if (!images[key] && scene.imagePath) images[key] = scene.imagePath;
                        }
                        const next = await persistApprovals(
                          { ...approvals, images: true },
                          { ...selectedAssets, images }
                        );
                        if (next) {
                          setGenerationOpen((previous) => ({ ...previous, images: false }));
                          setPhase('produce');
                        }
                      }}
                    >
                      {saving ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <BadgeCheckIcon data-icon="inline-start" />
                      )}
                      {imageSelectionChanged
                        ? 'Use selected visuals → Produce'
                        : 'Approve visuals → Produce'}
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                  )}
                </CardFooter>
              )}
            </Card>
          )}

          {phase === 'produce' && detail && !creating && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {generationLocked.produce ? 'Final outputs are ready' : 'Build the final Short'}
                </CardTitle>
                <CardDescription>
                  {generationLocked.produce
                    ? 'Production is complete. Compare and approve the outputs in Review.'
                    : techVisualCoversImages
                      ? 'Render this episode’s Remotion techVisuals (CODE_PANEL / BOOKING_HALL / SYSTEM_FLOW / diagrams) with the selected voice.'
                      : useTechReelStoryboardProduce
                        ? 'This episode is linked to a Motion Studio storyboard — render that matching reel, then Review.'
                        : techNeedsMotionStudio
                          ? 'Remotion Tech Reels are planned in Motion Studio (orbital storyboard), not from AI stills. Create the storyboard first, then Produce here.'
                          : 'Merge the scene plan with your selected narration and subtitles.'}
                </CardDescription>
              </CardHeader>
              {!isTech && (
              <VideoExperiments key={detail.file} file={detail.file}
                disabled={Boolean(jobBusy || saving || episodePublished)}
                selectionKey={JSON.stringify(selectedAssets)}
                saveSelections={async () => Boolean(await persistApprovals(approvals))} />
              )}
              {generationLocked.produce ? (
                <>
                  <CardContent>
                    <div className="produce-complete-state">
                      <div className="complete-mark">
                        <BadgeCheckIcon className="size-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold">
                          {assembledFinalOptions(detail).length}{' '}
                          {assembledFinalOptions(detail).length === 1 ? 'version' : 'versions'} ready
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {assembledFinalOptions(detail)
                            .map(finalOptionLabel)
                            .filter((label, index, labels) => labels.indexOf(label) === index)
                            .join(' + ')} moved to Review.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2">
                    <Button onClick={() => setPhase('review')}>
                      Review final videos
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => reopenGeneration(episodePublished ? 'script' : 'produce')}
                    >
                      <RotateCcwIcon data-icon="inline-start" />
                      {episodePublished ? 'Create another draft' : 'Build another version'}
                    </Button>
                  </CardFooter>
                </>
              ) : (
                <>
              <CardContent className="flex flex-col gap-4">
                {detail.assets.production?.staleReason && (
                  <Alert>
                    <AlertTitle>Rebuild required</AlertTitle>
                    <AlertDescription>{detail.assets.production.staleReason}</AlertDescription>
                  </Alert>
                )}
                {!(approvals.script && approvals.tts) && (
                  <Alert>
                    <AlertTitle>Produce command locked</AlertTitle>
                    <AlertDescription>
                      Approve the script and narration before merging your visual plan.
                    </AlertDescription>
                  </Alert>
                )}
                <details className="advanced-tools">
                  <summary>Selected files</summary>
                <Alert>
                  <AlertTitle>Locked selections</AlertTitle>
                  <AlertDescription className="space-y-1 text-xs">
                    <div>
                      Audio: <code>{selectedAssets.audio || 'not set'}</code>
                    </div>
                    <div>
                      Images:{' '}
                      {selectedAssets.images
                        ? `${Object.keys(selectedAssets.images).length} scene(s)`
                        : 'not set'}
                    </div>
                    <div>
                      Clips:{' '}
                      {selectedAssets.clips
                        ? `${Object.keys(selectedAssets.clips).length} scene(s)`
                        : 'not set'}
                    </div>
                    <div>
                      Final Short: <code>{selectedAssets.final || 'not set'}</code>
                    </div>
                    <div>
                      Uploaded video: <code>{selectedAssets.externalVideo || 'not set'}</code>
                    </div>
                    <div>
                      Episode id lock: <code>{detail.episode.id}</code>
                    </div>
                  </AlertDescription>
                </Alert>
                </details>
                <FieldGroup>
                  {useTechReelStoryboardProduce ? (
                    <TechProducePanel
                      episodeId={detail.episode.id}
                      topic={detail.episode.topic}
                      title={detail.episode.titleEn || detail.episode.titleHi}
                      notes={[
                        ...(detail.episode.sourceReview?.notes || []),
                        ...(linkedTechReelId
                          ? [`tech-reels/${linkedTechReelId}`]
                          : [])
                      ]}
                      disabled={jobBusy || saving || generationLocked.produce}
                      onAttached={async (finalPath) => {
                        const nextSelected = { ...selectedAssets, final: finalPath };
                        setSelectedAssets(nextSelected);
                        await persistApprovals({ ...approvals, images: true }, nextSelected);
                        setDetail(await getEpisode(selectedFile!));
                      }}
                      onContinueReview={async () => {
                        if (!selectedAssets.final) {
                          toast.error('Create or attach a video first');
                          return;
                        }
                        await persistApprovals({ ...approvals, images: true }, selectedAssets);
                        setPhase('review');
                      }}
                    />
                  ) : techVisualCoversImages ? (
                    <Field>
                      <FieldLabel>Tech visual engine</FieldLabel>
                      <Select
                        value={techVisualEngine}
                        disabled={generationLocked.produce}
                        onValueChange={(value) =>
                          setTechVisualEngine(value as 'remotion' | 'ffmpeg')
                        }
                      >
                        <SelectTrigger className="w-full max-w-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="remotion">
                              Remotion · draw THIS episode’s techVisuals (new video)
                            </SelectItem>
                            <SelectItem value="ffmpeg">
                              FFmpeg · per-scene SVG cards (legacy)
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Creates a <strong>new</strong> final from BOOKING_HALL / CODE_PANEL / diagram
                        fields on this script + your selected voice. Does not reuse request-coalescing
                        or other storyboards.
                      </FieldDescription>
                    </Field>
                  ) : techNeedsMotionStudio ? (
                    <Alert>
                      <AlertTitle>Remotion path: Motion Studio storyboard required</AlertTitle>
                      <AlertDescription className="space-y-3 text-sm">
                        <p>
                          Desk episodes with <code>techVisual</code> render Remotion diagrams here.
                          System-design orbital reels (cache stampede, coalescing, scaling) are
                          authored as <code>data/tech-reels/*.json</code> in Motion Studio — not by
                          picking AI stills, and not by reusing an old storyboard like
                          request-coalescing.
                        </p>
                        <ol className="list-decimal space-y-1 pl-5">
                          <li>
                            Open{' '}
                            <Link className="underline" to="/desk?studio=1">
                              Motion studio
                            </Link>
                          </li>
                          <li>
                            Create a storyboard with id{' '}
                            <code>{detail.episode.id}</code> (same as this episode)
                          </li>
                          <li>
                            Validate → Save &amp; render final there, or come back to Produce once
                            the storyboard exists
                          </li>
                        </ol>
                        <p className="text-xs text-muted-foreground">
                          Alternate: add <code>techVisual</code> on each scene (CODE_PANEL /
                          diagrams) if you want Remotion from this Desk script without Motion
                          Studio.
                        </p>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Field>
                      <FieldLabel>Image camera motion</FieldLabel>
                      <Select
                        value={motionLevel}
                        disabled={generationLocked.produce}
                        onValueChange={(value) =>
                          setMotionLevel(value as 'low' | 'medium' | 'high')
                        }
                      >
                        <SelectTrigger className="w-full max-w-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="low">Low motion · Free</SelectItem>
                            <SelectItem value="medium">Medium motion · Free</SelectItem>
                            <SelectItem value="high">High motion · Free</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Gentle pan and zoom for image sections. Uploaded clips keep their original
                        motion.
                      </FieldDescription>
                    </Field>
                  )}
                  {!isTech && (
                    <Field>
                      <FieldLabel>FFmpeg atmosphere effects</FieldLabel>
                      <Select value={ffmpegEffects} disabled={generationLocked.produce}
                        onValueChange={(value) => setFfmpegEffects(value as 'off' | 'atmosphere' | 'water')}>
                        <SelectTrigger className="w-full max-w-sm"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectGroup>
                          <SelectItem value="off">Off · camera motion only</SelectItem>
                          <SelectItem value="atmosphere">Mist, particles and soft light</SelectItem>
                          <SelectItem value="water">Atmosphere + foreground water ripples</SelectItem>
                        </SelectGroup></SelectContent>
                      </Select>
                      <FieldDescription>
                        Applies to all image sections in this render, including the hook. Local rendering only;
                        no AI charges. Clips keep their original motion. Effects take longer to render.
                        {ffmpegEffects === 'water' && ' Water mode distorts the bottom 13% of every still. Use only when that area contains water throughout; otherwise choose atmosphere.'}
                      </FieldDescription>
                    </Field>
                  )}
                </FieldGroup>

                <details className="advanced-tools">
                  <summary>
                    {useTechReelStoryboardProduce
                      ? 'Advanced · upload an external MP4 instead'
                      : 'Already have a complete video? Upload and replace its audio'}
                  </summary>
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <UploadIcon className="size-5 text-foreground" />
                    <p className="text-sm font-semibold">Upload external video</p>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Use a Short you generated outside EpicAstra. It is stored only under{' '}
                    <code>output/external/{detail.episode.id}/</code> and can only be muxed with
                    this episode&apos;s selected voice — never another episode&apos;s audio.
                  </p>
                  <input
                    id="external-video-upload"
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                    className="hidden"
                    disabled={jobBusy || saving || generationLocked.produce}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file || !selectedFile || !detail) return;
                      try {
                        setJobBusy(true);
                        setActiveJob('mux:external');
                        toast.message(`Uploading for ${detail.episode.id}…`);
                        const uploaded = await uploadEpisodeVideo(
                          selectedFile,
                          detail.episode.id,
                          file
                        );
                        if (uploaded.episodeId !== detail.episode.id) {
                          throw new Error('Upload returned a different episode id — aborted');
                        }
                        const nextSelected = {
                          ...selectedAssets,
                          externalVideo: uploaded.path
                        };
                        setSelectedAssets(nextSelected);
                        await persistApprovals(approvals, nextSelected);
                        toast.success(`Uploaded · ${uploaded.name}`);
                        setDetail(await getEpisode(selectedFile));
                      } catch (err) {
                        const message = err instanceof Error ? err.message : 'Upload failed';
                        toast.error(message);
                        setError(message);
                      } finally {
                        setJobBusy(false);
                        setActiveJob(null);
                      }
                    }}
                  />
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={jobBusy || saving || generationLocked.produce}
                      onClick={() => document.getElementById('external-video-upload')?.click()}
                    >
                      <UploadIcon data-icon="inline-start" />
                      Choose video file
                    </Button>
                    <Button
                      type="button"
                      disabled={
                        jobBusy ||
                        saving ||
                        generationLocked.produce ||
                        !selectedAssets.externalVideo ||
                        !selectedAssets.audio ||
                        !(approvals.script && approvals.tts)
                      }
                      onClick={async () => {
                        if (!selectedAssets.externalVideo) {
                          toast.error('Upload a video for this episode first');
                          return;
                        }
                        if (!selectedAssets.audio) {
                          toast.error('Select this episode’s voice first (Voice step)');
                          setPhase('tts');
                          return;
                        }
                        if (!selectedAssets.audio.includes(detail.episode.id)) {
                          toast.error(
                            'Selected audio does not belong to this episode — pick the correct voice take'
                          );
                          setPhase('tts');
                          return;
                        }
                        if (!selectedAssets.externalVideo.includes(detail.episode.id)) {
                          toast.error('Uploaded video is not tagged for this episode');
                          return;
                        }
                        const saved = await persistApprovals(approvals, selectedAssets);
                        if (!saved) return;
                        toast.message('Muxing uploaded video + selected voice…');
                        const audioRel = selectedAssets.audio.replace(/^output[/\\]/, '');
                        await onRun('mux:external', {
                          videoPath: selectedAssets.externalVideo,
                          audio: audioRel
                        });
                        setPhase('review');
                      }}
                    >
                      {activeJob === 'mux:external' ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <ClapperboardIcon data-icon="inline-start" />
                      )}
                      Mux with selected voice
                    </Button>
                  </div>
                  {(detail.assets.external || []).length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(detail.assets.external || []).map((item) => {
                        const active = selectedAssets.externalVideo === item.path;
                        return (
                          <div
                            key={item.path}
                            className={cn(
                              'overflow-hidden rounded-lg border',
                              active ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                            )}
                          >
                            <video
                              src={`${item.url}?v=${item.mtimeMs}`}
                              controls
                              className="aspect-[9/16] w-full bg-black object-contain"
                            />
                            <div className="flex items-center justify-between gap-2 px-2 py-2">
                              <p className="truncate font-mono text-[11px] text-muted-foreground">
                                {item.name}
                              </p>
                              <Button
                                size="sm"
                                variant={active ? 'default' : 'outline'}
                                disabled={generationLocked.produce}
                                onClick={() =>
                                  setSelectedAssets((prev) => ({
                                    ...prev,
                                    externalVideo: item.path
                                  }))
                                }
                              >
                                {active ? 'Selected' : 'Use'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No uploads yet for <code>{detail.episode.id}</code>.
                    </p>
                  )}
                </div>
                </details>

                {!useTechReelStoryboardProduce && !techNeedsMotionStudio && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <ClapperboardIcon className="size-5 text-primary" />
                    <p className="text-sm font-semibold">
                      {techVisualCoversImages
                          ? 'Build with Remotion + voice'
                          : 'Build from scene plan'}
                    </p>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {techVisualCoversImages
                        ? 'This episode’s BOOKING_HALL / CODE_PANEL / diagram techVisuals are drawn by Remotion (or FFmpeg SVG), then muxed with your selected voice — not a Motion Studio storyboard like request-coalescing.'
                        : 'Combines selected images and uploaded clips in story order. Clip audio is muted; your selected narration plays once across the entire video. No paid video generation.'}
                  </p>
                  <label className="mb-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedAssets.burnSubtitles !== false}
                      onChange={(event) => setSelectedAssets((previous) => ({ ...previous, burnSubtitles: event.target.checked }))} />
                    Burn subtitles into the video (SRT also saved)
                  </label>
                  <p className="mb-3 text-xs text-muted-foreground">Captions use the approved script and estimated speech timing. Review the result against your MP3.</p>
                  {renderProblems.length > 0 && <p role="status" className="mb-3 text-sm text-amber-700">{renderProblems.join(' · ')}</p>}
                  {selectedAssets.audio ? (
                    <p className="mb-3 rounded-lg border border-border bg-background/70 px-3 py-2 font-mono text-xs">
                      Voice MP3: {selectedAssets.audio}
                    </p>
                  ) : (
                    <Alert className="mb-3">
                      <AlertTitle>No voice selected</AlertTitle>
                      <AlertDescription>
                        Go to Voice, pick a take, and approve/save it before producing.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="lg"
                      className="bg-primary text-primary-foreground shadow-sm"
                      disabled={
                        jobBusy ||
                        saving ||
                        !(approvals.script && approvals.tts) || renderProblems.length > 0 ||
                        generationLocked.produce ||
                        !selectedAssets.audio
                      }
                      onClick={async () => {
                        if (!selectedAssets.audio) {
                          toast.error('Select an audio track first (Voice step)');
                          setPhase('tts');
                          return;
                        }
                        const saved = await persistApprovals({ ...approvals, images: true }, selectedAssets);
                        if (!saved) return;
                        toast.message(
                          techVisualCoversImages
                            ? techVisualEngine === 'remotion'
                              ? 'Remotion visuals → FFmpeg voice mux…'
                              : 'FFmpeg SVG cards → voice mux…'
                            : 'Merging scene plan, narration and captions…'
                        );
                        const audioRel = selectedAssets.audio.replace(/^output[/\\]/, '');
                        const result = await onRun('produce', {
                          provider: produceProvider,
                          reuseAi: true,
                          motion: motionLevel,
                          ffmpegEffects: isTech ? 'off' : ffmpegEffects,
                          audio: audioRel,
                          ...(techVisualCoversImages
                            ? { techEngine: techVisualEngine }
                            : {})
                        });
                        if (result?.ok) setPhase('review');
                      }}
                    >
                      {activeJob === 'produce' ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <ClapperboardIcon data-icon="inline-start" />
                      )}
                      {techVisualCoversImages
                        ? techVisualEngine === 'remotion'
                          ? 'Remotion + voice → final Reel'
                          : 'FFmpeg SVG + voice → final Reel'
                        : 'Merge scenes + voice → final Short'}
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                    {techVisualCoversImages && (
                      <Button
                        size="lg"
                        variant="outline"
                        disabled={jobBusy || saving || !approvals.script || generationLocked.produce}
                        onClick={async () => {
                          toast.message('Rendering Remotion silent preview (no voice)…');
                          await onRun('remotion');
                        }}
                      >
                        {activeJob === 'remotion' ? (
                          <Spinner data-icon="inline-start" />
                        ) : null}
                        Remotion preview only
                      </Button>
                    )}
                    <Button
                      size="lg"
                      variant="outline"
                      disabled={saving || generationLocked.produce}
                      onClick={async () => {
                        await persistApprovals(approvals, selectedAssets);
                      }}
                    >
                      Save selections only
                    </Button>
                  </div>
                  {!(approvals.script && approvals.tts) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Approve the script and voice first, then complete the visual plan.
                    </p>
                  )}
                </div>
                )}

                {!isTech && (
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Approved visual plan</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Hook / ending videos and middle stills were set on Visuals. Edit them there if you need changes.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPhase('images')}>
                      Edit on Visuals
                    </Button>
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {(() => {
                      let rows;
                      try {
                        rows = visualRows(detail, selectedAssets);
                      } catch {
                        rows = visualRows(detail, { ...selectedAssets, sceneVisuals: undefined });
                      }
                      return rows.map((row) => {
                        const source = visualSource(row.id, row.renderMode, selectedAssets.sceneVisuals);
                        const clip = selectedAssets.clips?.[String(row.id)];
                        const imageKey = row.id === -1 ? detail.episode.scenes.at(-1)!.id : row.id;
                        const image = selectedAssets.images?.[String(imageKey)];
                        const kind =
                          source === 'upload'
                            ? clip
                              ? 'Uploaded video'
                              : 'Video needed'
                            : source === 'ai'
                              ? clip
                                ? 'AI video'
                                : 'AI video (needs clip or still)'
                              : image
                                ? 'Image / Ken Burns'
                                : 'Image needed';
                        return (
                          <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border/60 pt-1.5 first:border-t-0 first:pt-0">
                            <span className="font-medium text-foreground">{row.label}</span>
                            <span className="text-muted-foreground">
                              {kind} · {row.startSecond.toFixed(1)}–{(row.startSecond + row.durationSeconds).toFixed(1)}s
                            </span>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                </div>
                )}

              </CardContent>
              <CardFooter className="flex flex-col items-stretch gap-3">
                {!isTech && (
                <details className="advanced-tools w-full">
                  <summary>
                    <span>Advanced · paid AI video (optional)</span>
                    <span>Veo / Wan clips + FFmpeg merge — not required for free Shorts</span>
                  </summary>
                  <div className="advanced-tools-content grid gap-3 md:grid-cols-2">
                    <div className="advanced-tool-item flex flex-col gap-2 md:col-span-2">
                      <Field>
                        <FieldLabel>AI clip provider</FieldLabel>
                        <Select
                          value={produceProvider}
                          disabled={generationLocked.produce}
                          onValueChange={setProduceProvider}
                        >
                          <SelectTrigger className="w-full max-w-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="veo">Veo · Paid</SelectItem>
                              <SelectItem value="wan">Wan · Self-hosted</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field orientation="horizontal">
                        <Checkbox
                          id="reuse-ai"
                          checked={reuseAi}
                          disabled={generationLocked.produce}
                          onCheckedChange={(checked) => setReuseAi(checked === true)}
                        />
                        <FieldLabel htmlFor="reuse-ai" className="font-normal">
                          Reuse existing AI clips (<code>--reuse-ai</code>)
                        </FieldLabel>
                      </Field>
                    </div>
                    <div className="advanced-tool-item flex flex-col gap-2">
                      <div>
                        <p className="text-sm font-semibold">Generate missing AI scene clips</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Paid/self-hosted only. Creates scene clips; merge afterward.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        disabled={
                          jobBusy ||
                          generationLocked.produce ||
                          !(approvals.script && approvals.tts && approvals.images)
                        }
                        onClick={() => onRun('animate', { provider: produceProvider })}
                      >
                        Generate AI clips ({produceProvider})
                      </Button>
                    </div>
                    <div className="advanced-tool-item flex flex-col gap-2">
                      <div>
                        <p className="text-sm font-semibold">Merge clips + audio</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          FFmpeg assemble of selected AI clips into{' '}
                          <code>output/final/&lt;id&gt;.mp4</code>.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        disabled={
                          jobBusy ||
                          saving ||
                          generationLocked.produce ||
                          !(approvals.script && approvals.tts && approvals.images) ||
                          !selectedAssets.audio
                        }
                        onClick={async () => {
                          if (!selectedAssets.audio) {
                            toast.error('Select an audio track first (Voice step)');
                            setPhase('tts');
                            return;
                          }
                          const saved = await persistApprovals(approvals, selectedAssets);
                          if (!saved) return;
                          await onRun('produce', {
                            provider: produceProvider,
                            motion: motionLevel,
                          ffmpegEffects,
                            reuseAi: true,
                            audio: selectedAssets.audio.replace(/^output[/\\]/, ''),
                            ...(techVisualCoversImages
                              ? { techEngine: techVisualEngine }
                              : {})
                          });
                          setPhase('review');
                        }}
                      >
                        {activeJob === 'produce' ? (
                          <Spinner data-icon="inline-start" />
                        ) : null}
                        Merge selected clips → final
                      </Button>
                    </div>
                  </div>
                </details>
                )}
              </CardFooter>
                </>
              )}
            </Card>
          )}

          {phase === 'review' && detail && !creating && (
              <Card>
                <CardHeader>
                  <CardTitle>Review → Publish</CardTitle>
                  <CardDescription>
                    {isTech
                      ? 'Pick the master Reel, approve it, then continue to Instagram publish.'
                      : 'Pick the master Short, approve it, then continue to YouTube (and optional Meta).'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ol className="review-flow-steps">
                    <li className={cn(selectedAssets.final && 'done')}>
                      <span>1</span>
                      Choose the final MP4
                    </li>
                    <li className={cn(selectedFinalIsApproved && 'done')}>
                      <span>2</span>
                      Approve that cut
                    </li>
                    <li>
                      <span>3</span>
                      Publish with post copy
                    </li>
                  </ol>
                  {finalOptions.length === 0 ? (
                    <Alert>
                      <AlertTitle>No full-length video yet</AlertTitle>
                      <AlertDescription>Return to Produce and build a final version first.</AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {detail.assets.production?.reviewStatus || 'PENDING'}
                        </Badge>
                        {detail.assets.production && (
                          <Badge variant="outline">
                            ${detail.assets.production.costUsd.toFixed(2)} est.
                          </Badge>
                        )}
                        {selectedAssets.final && (
                          <Badge variant="outline" className="max-w-full truncate font-mono text-[0.65rem]">
                            Master: {selectedAssets.final.split('/').pop()}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-sm font-semibold">Choose the final output</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            The selected version is what Publish uploads. Watch it end to end before approving.
                          </p>
                        </div>
                        {!isTech && selectedAssets.final && (
                          <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/30 p-3">
                            <p className="text-sm font-semibold">Remotion chrome wrap</p>
                            <p className="text-xs text-muted-foreground">
                              Adds EpicAstra intro + watermark + end card. Keeps your plain final so you can compare both side by side.
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-fit"
                              disabled={
                                jobBusy ||
                                !selectedAssets.final ||
                                selectedAssets.final.includes('-chrome')
                              }
                              onClick={() =>
                                void onRun('remotion:chrome', {
                                  videoPath: selectedAssets.final!,
                                  focus:
                                    detail.episode.titleEn?.trim() ||
                                    detail.episode.titleHi?.trim() ||
                                    detail.episode.topic?.trim() ||
                                    detail.episode.id
                                })
                              }
                            >
                              {jobSpinner('remotion:chrome')}
                              {activeJob === 'remotion:chrome'
                                ? 'Wrapping with Remotion…'
                                : 'Make Remotion chrome final'}
                            </Button>
                          </div>
                        )}
                        {selectedFinalIsApproved &&
                          finalOptions.length > 1 &&
                          !finalOptions.some((file) => (file.path || '').includes('-chrome')) && (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-fit"
                            onClick={() => setShowReviewAlternatives((value) => !value)}
                          >
                            {showReviewAlternatives
                              ? 'Hide other versions'
                              : `Compare ${finalOptions.length - 1} other version${finalOptions.length === 2 ? '' : 's'}`}
                          </Button>
                        )}
                        {finalOptions.some((file) => (file.path || '').includes('-chrome')) &&
                          finalOptions.length > 1 && (
                          <p className="text-xs text-muted-foreground">
                            Plain final and Remotion chrome final are shown side by side — pick which one Publish should use.
                          </p>
                        )}
                        <div className="grid gap-4 md:grid-cols-2">
                          {finalOptions
                            .filter(
                              (file) =>
                                !selectedFinalIsApproved ||
                                showReviewAlternatives ||
                                finalOptions.some((item) => (item.path || '').includes('-chrome')) ||
                                selectedAssets.final === file.path
                            )
                            .map((file) => {
                            const active = selectedAssets.final === file.path;
                            const isFinal = (file.provider || '').includes('final');
                            return (
                              <label
                                key={file.path}
                                className={cn(
                                  'final-review-option flex cursor-pointer flex-col gap-3 rounded-xl border p-3 transition-all',
                                  active
                                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                    : 'border-border hover:border-primary/40',
                                  isFinal && 'md:order-2'
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <input
                                    type="radio"
                                    name="selected-review-final"
                                    className="size-4 accent-[var(--primary)]"
                                    checked={active}
                                    onChange={() =>
                                      setSelectedAssets((previous) => ({
                                        ...previous,
                                        final: file.path
                                      }))
                                    }
                                  />
                                  <span className="truncate text-sm font-semibold">
                                    {finalOptionLabel(file)}
                                  </span>
                                  {active && <Badge>Selected</Badge>}
                                </div>
                                <SourceTag provider={file.provider} path={file.path} />
                                <video
                                  controls
                                  preload="metadata"
                                  src={file.url}
                                  className="aspect-[9/16] max-h-[62vh] w-full rounded-lg bg-black object-contain"
                                />
                                <p className="truncate text-[0.7rem] text-muted-foreground">{file.path}</p>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="regen-scene">Regenerate scene id</FieldLabel>
                          <Input
                            id="regen-scene"
                            value={reviewScene}
                            onChange={(e) => setReviewScene(e.target.value)}
                            placeholder="e.g. 4"
                            className="max-w-sm"
                          />
                          <FieldDescription>Only needed for REGENERATE.</FieldDescription>
                        </Field>
                      </FieldGroup>
                    </>
                  )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      jobBusy ||
                      !selectedAssets.final ||
                      selectedFinalIsApproved ||
                      finalOptions.length === 0
                    }
                    onClick={async () => {
                      if (!selectedAssets.final) {
                        toast.error('Choose the final video to approve');
                        return;
                      }
                      const saved = await persistApprovals(approvals, selectedAssets);
                      if (!saved) return;
                      const result = await onRun('review', {
                        action: 'APPROVE',
                        videoPath: selectedAssets.final
                      });
                      if (result?.ok) setPhase('publish');
                    }}
                  >
                    <BadgeCheckIcon data-icon="inline-start" />
                    {selectedFinalIsApproved ? 'Selected final approved' : 'Approve selected final'}
                  </Button>
                  {selectedFinalIsApproved && (
                    <Button onClick={() => setPhase('publish')}>
                      Continue to Publish
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    disabled={jobBusy || !reviewScene}
                    onClick={() =>
                      onRun('review', { action: 'REGENERATE', scene: reviewScene })
                    }
                  >
                    Regenerate scene
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={jobBusy}
                    onClick={() => onRun('review', { action: 'REJECT' })}
                  >
                    Reject
                  </Button>
                </CardFooter>
              </Card>
          )}

          {phase === 'publish' && detail && !creating && (() => {
            const publishVideoPath = resolvePublishVideoPath();
            const publishVideoFile =
              assembledFinalOptions(detail).find((file) => file.path === publishVideoPath) ||
              (publishVideoPath
                ? {
                    path: publishVideoPath,
                    url: `/api/media/${publishVideoPath}`,
                    name: publishVideoPath.split('/').pop() || 'final.mp4',
                    mtimeMs: 0,
                    provider: 'final'
                  }
                : null);
            const baseReady =
              detail.assets.production?.reviewStatus === 'APPROVED' &&
              Boolean(matchingDeliveryPack) &&
              Boolean(publishVideoPath);
            const packLooksFilled = packCopyReady(activePack);
            const instagramMediaReady =
              activePublishPlatform !== 'instagram' || Boolean(instagramHosting?.ready);
            const activeReady =
              baseReady &&
              activeConnection?.state === 'connected' &&
              Boolean(activePack) &&
              packLooksFilled &&
              Boolean(packConfirmed[activePublishPlatform]) &&
              instagramMediaReady &&
              !publishDone[activePublishPlatform];
            const platformLabel =
              activePublishPlatform.charAt(0).toUpperCase() + activePublishPlatform.slice(1);
            const igHosting =
              connections.find((item) => item.platform === 'instagram')?.mediaHosting ||
              instagramHosting;
            return (
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Master video</CardTitle>
                  <CardDescription>
                    Approved cut from Review. Each platform upload uses this file.
                  </CardDescription>
                </CardHeader>
                <CardContent className="publish-upload-preview">
                  {detail.assets.production?.reviewStatus !== 'APPROVED' ? (
                    <Alert>
                      <AlertTitle>Final approval required</AlertTitle>
                      <AlertDescription>
                        Return to Review, select the MP4, and approve it before publishing.
                      </AlertDescription>
                    </Alert>
                  ) : publishVideoFile ? (
                    <div className="grid gap-4 sm:grid-cols-[9rem_1fr] sm:items-start">
                      <video
                        controls
                        preload="metadata"
                        src={publishVideoFile.url}
                        className="aspect-[9/16] w-full max-w-[9rem] rounded-lg bg-black object-contain"
                      />
                      <div className="min-w-0 flex flex-col gap-2">
                        <p className="text-sm font-semibold">
                          {detail.episode.titleHi || detail.episode.titleEn}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {publishVideoFile.path}
                        </p>
                        <Badge variant="secondary" className="w-fit">
                          APPROVED
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <Alert>
                      <AlertTitle>No master video locked</AlertTitle>
                      <AlertDescription>
                        Approve a final in Review so Publish knows which file to upload.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>1 · Delivery pack</CardTitle>
                  <CardDescription>
                    {isTech
                      ? 'Generate tech Reel titles & captions (English), then confirm each account. If copy still mentions mythology or EpicAstra, regenerate.'
                      : 'Use your JSON titles or generate new copy, then confirm each platform. OpenRouter free models often time out — use Seed / Custom blank if AI stalls.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="delivery-pack-settings">
                  <details className="rounded-xl border p-4">
                    <summary className="cursor-pointer text-sm font-semibold">Titles from episode JSON · no AI cost</summary>
                    <p className="my-3 text-xs text-muted-foreground">
                      Platform title → shared title → {packageLanguage === 'hi' ? 'titleHi' : 'titleEn'}.
                      Only titles change; descriptions and covers stay.
                      {pipelinePublishPlatforms.length > 1
                        ? ' Same title uses the shared title across destinations.'
                        : ''}{' '}
                      Existing published posts are not edited.
                    </p>
                    <div className="mb-3 space-y-2 text-sm">
                      {pipelinePublishPlatforms.map((platform) => {
                        const titles = detail.episode.publishingTitles?.[packageLanguage];
                        return <p key={platform}><span className="font-medium capitalize">{platform}: </span>{titles?.[platform] || titles?.shared || (packageLanguage === 'hi' ? detail.episode.titleHi : detail.episode.titleEn)}</p>;
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={jobBusy || savingPack || !matchingDeliveryPack} onClick={() => void useJsonTitles('all')}>
                        Apply JSON titles{pipelinePublishPlatforms.length > 1 ? ' to all' : ''}
                      </Button>
                      {pipelinePublishPlatforms.length > 1 && (
                        <Button variant="outline" disabled={jobBusy || savingPack || !matchingDeliveryPack} onClick={() => void useJsonTitles('all', true)}>Same title on all</Button>
                      )}
                      <Button variant="outline" disabled={jobBusy || savingPack || !matchingDeliveryPack} onClick={() => void useJsonTitles(activePublishPlatform)}>Apply to {platformLabel} only</Button>
                    </div>
                    {!matchingDeliveryPack && <p className="mt-2 text-xs text-muted-foreground">Start with “Seed from episode (no AI)” below to create a pack using these titles.</p>}
                  </details>
                  <div className="delivery-language">
                    <div className="flex items-center gap-2">
                      <LanguagesIcon className="size-4 text-primary" />
                      <p className="text-sm font-semibold">Post copy language</p>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Changes titles, descriptions, CTAs, tags and hashtags only. The video voice and burned subtitles stay unchanged.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Delivery pack language">
                      {(isTech
                        ? ([
                            { value: 'en', label: 'English', detail: 'Tech Reels captions (recommended)' },
                            { value: 'hi', label: 'Hindi / Hinglish', detail: 'Roman-script Hinglish captions' }
                          ] as const)
                        : ([
                            { value: 'hi', label: 'Hindi / Hinglish', detail: 'Uses the saved Hindi pack for this story' },
                            { value: 'en', label: 'English', detail: 'English captions' }
                          ] as const)
                      ).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={packageLanguage === option.value}
                          className={cn(
                            'language-choice rounded-xl border px-4 py-3 text-left transition-all',
                            packageLanguage === option.value
                              ? 'border-primary bg-primary/8 ring-2 ring-primary/10'
                              : 'border-border hover:border-primary/35'
                          )}
                          onClick={() => void selectPackageLanguage(option.value)}
                        >
                          <span className="block text-sm font-semibold">{option.label}</span>
                          <span className="mt-0.5 block text-[0.7rem] text-muted-foreground">
                            {option.detail}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Cover treatment</FieldLabel>
                      <Select
                        value={packageImageProvider}
                        onValueChange={(value) => {
                          setPackageImageProvider(value);
                          setSkipCovers(value === 'none');
                        }}
                      >
                        <SelectTrigger className="w-full max-w-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="none">Post copy only · no new cover</SelectItem>
                            <SelectItem value="pollinations">Pollinations · free covers</SelectItem>
                            <SelectItem value="gemini">Gemini · paid covers</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        {matchingDeliveryPack && detail.packaging
                          ? `${packageLanguage === 'hi' ? 'Hindi / Hinglish' : 'English'} pack ready for ${
                              detail.packaging.platforms.filter((item) =>
                                pipelinePublishPlatforms.includes(item.platform)
                              ).length
                            } destination${pipelinePublishPlatforms.length === 1 ? '' : 's'}.`
                          : `No ${packageLanguage === 'hi' ? 'Hindi / Hinglish' : 'English'} delivery pack yet.`}
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                  {techPackLooksMythology && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertTitle>Mythology copy detected</AlertTitle>
                      <AlertDescription>
                        This pack still reads like EpicAstra (mythology / EpicAstra CTA). Click{' '}
                        <strong>Regenerate post copy</strong> (English) before Publish all / Upload —
                        otherwise Instagram gets the wrong caption.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    disabled={jobBusy}
                    onClick={async () => {
                      const result = await onRun('package', {
                        provider: storyProvider,
                        imageProvider: packageImageProvider,
                        skipCovers: skipCovers || packageImageProvider === 'none',
                        language: packageLanguage
                      });
                      setPackConfirmed({});
                      setCustomPack(false);
                      if (result?.ok) setPastePackOpen(true);
                    }}
                  >
                    {jobSpinner('package')}
                    {matchingDeliveryPack
                      ? techPackLooksMythology
                        ? 'Regenerate tech post copy'
                        : 'Regenerate post copy'
                      : `Generate ${packageLanguage === 'hi' ? 'Hindi / Hinglish' : 'English'} post copy`}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={jobBusy}
                    onClick={async () => {
                      const result = await onRun('package', {
                        provider: 'blank',
                        imageProvider: 'none',
                        skipCovers: true,
                        language: packageLanguage
                      });
                      setPackConfirmed({});
                      if (result?.ok) {
                        setCustomPack(true);
                        setPackDraft({
                          title: '',
                          description: '',
                          tags: '',
                          hashtags: '',
                          cta: ''
                        });
                        toast.message('Blank pack ready — fill title, description, tags, then Save');
                      }
                    }}
                  >
                    Custom blank pack
                  </Button>
                  <Button
                    variant="outline"
                    disabled={jobBusy}
                    onClick={async () => {
                      const result = await onRun('package', {
                        provider: 'seed',
                        imageProvider: packageImageProvider,
                        skipCovers: skipCovers || packageImageProvider === 'none',
                        language: packageLanguage
                      });
                      setPackConfirmed({});
                      setCustomPack(false);
                      if (result?.ok) toast.success('Seeded from episode titles (no AI)');
                    }}
                  >
                    Seed from episode (no AI)
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!matchingDeliveryPack}
                    onClick={() => setPastePackOpen(true)}
                  >
                    <ClipboardPasteIcon data-icon="inline-start" />
                    Preview all copy
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>2 · Pick account</CardTitle>
                  <CardDescription>
                    Select one connected destination. Preview its title and description, confirm,
                    then upload. Repeat for the next account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {!matchingDeliveryPack && (
                    <Alert>
                      <AlertTitle>
                        {packageLanguage === 'hi' ? 'Hindi / Hinglish' : 'English'} delivery pack required
                      </AlertTitle>
                      <AlertDescription>
                        Generate the selected language pack before publishing.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="destination-list">
                    {pipelinePublishPlatforms.map((platform) => {
                      const connection = connections.find((item) => item.platform === platform);
                      const chosen = activePublishPlatform === platform;
                      const done = Boolean(publishDone[platform]);
                      const confirmed = Boolean(packConfirmed[platform]);
                      const statusLabel = connection?.state === 'connected'
                          ? connection.accountName
                            ? `Connected · ${connection.accountName}`
                            : 'Connected'
                          : connection?.state === 'setup_required'
                            ? 'Setup required'
                            : connection?.state === 'error'
                              ? 'Check failed'
                              : checkingConnections
                                ? 'Checking…'
                                : 'Not checked';
                      return (
                        <div
                          key={platform}
                          className={cn('destination-row', chosen && 'destination-row-selected')}
                        >
                          <button
                            type="button"
                            aria-pressed={chosen}
                            onClick={() => setActivePublishPlatform(platform)}
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                          >
                            <span className={cn('choice-check mt-0.5', chosen && 'choice-check-active')}>
                              {chosen && <BadgeCheckIcon className="size-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold capitalize">{platform}</span>
                                <Badge
                                  variant={
                                    connection?.state === 'connected' ? 'secondary' : 'outline'
                                  }
                                  className={cn(connection?.state === 'error' && 'text-destructive')}
                                >
                                  {statusLabel}
                                </Badge>
                                {done && (
                                  <Badge variant="outline">
                                    {publishDone[platform]?.status === 'scheduled'
                                      ? 'Scheduled previously'
                                      : 'Published previously'}
                                  </Badge>
                                )}
                                {confirmed && !done && <Badge variant="outline">Copy set</Badge>}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                {connection?.message ||
                                  (checkingConnections ? 'Verifying account…' : 'Reading account setup…')}
                              </span>
                              {connection?.missing.length ? (
                                <>
                                  <span className="mt-1.5 flex flex-wrap gap-1">
                                    {connection.missing.map((name) => (
                                      <code key={name} className="connection-key">
                                        {name}
                                      </code>
                                    ))}
                                  </span>
                                  <span className="mt-1.5 block text-[0.7rem] leading-5 text-muted-foreground">
                                    {platform === 'youtube'
                                      ? 'One-time: YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET in .env (same Google client for all pipelines). Then Authorize YouTube for this pipeline — tokens saved per brand.'
                                      : platform === 'instagram'
                                        ? 'One-time: INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET in .env. Then Authorize Instagram for this pipeline (tokens saved per brand). Reels need S3.'
                                        : 'Add META_ACCESS_TOKEN + FACEBOOK_PAGE_ID (migrates into data/connections for this pipeline).'}
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </button>
                          {(platform === 'instagram' ||
                            platform === 'youtube' ||
                            (connection && connection.state !== 'connected')) && (
                            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                              {platform === 'youtube' && (
                                <Button asChild size="sm" variant="outline">
                                  <a
                                    href={
                                      connection?.connectUrl ||
                                      `/api/publish/youtube-auth/start?pipeline=${encodeURIComponent(pipelineId)}`
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {connection?.state === 'connected'
                                      ? 'Refresh YouTube'
                                      : 'Authorize YouTube'}
                                    <ExternalLinkIcon data-icon="inline-end" />
                                  </a>
                                </Button>
                              )}
                              {platform === 'instagram' && (
                                <Button asChild size="sm" variant="outline">
                                  <a
                                    href={
                                      connection?.connectUrl ||
                                      `/api/publish/instagram-auth/start?pipeline=${encodeURIComponent(pipelineId)}`
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {connection?.state === 'connected'
                                      ? 'Refresh Instagram'
                                      : 'Authorize Instagram'}
                                    <ExternalLinkIcon data-icon="inline-end" />
                                  </a>
                                </Button>
                              )}
                              {connection &&
                                connection.state !== 'connected' &&
                                platform !== 'instagram' &&
                                platform !== 'youtube' && (
                                  <Button asChild size="sm" variant="outline">
                                    <a href={connection.connectUrl} target="_blank" rel="noreferrer">
                                      {connection.state === 'setup_required'
                                        ? 'Set up account'
                                        : connection.state === 'error'
                                          ? 'Reconnect'
                                          : 'Manage'}
                                      <ExternalLinkIcon data-icon="inline-end" />
                                    </a>
                                  </Button>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={checkingConnections}
                    onClick={checkConnections}
                  >
                    {checkingConnections ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <RefreshCwIcon data-icon="inline-start" />
                    )}
                    Re-check connections
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      !baseReady ||
                      connectedPlatforms.length === 0 ||
                      techPackLooksMythology
                    }
                    onClick={() => {
                      if (techPackLooksMythology) {
                        toast.error('Regenerate tech post copy first — pack still looks like mythology');
                        return;
                      }
                      setPublishAllOpen(true);
                    }}
                  >
                    {scheduleEnabled ? 'Schedule all…' : 'Publish all…'}
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>3 · {platformLabel} preview</CardTitle>
                  <CardDescription>
                    Confirm this video, title, and description for {platformLabel}. Upload stays
                    locked until you confirm.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {activeConnection?.state !== 'connected' ? (
                    <Alert>
                      <AlertTitle>{platformLabel} not connected</AlertTitle>
                      <AlertDescription>
                        Connect this account first, or pick another destination above.
                      </AlertDescription>
                    </Alert>
                  ) : !matchingDeliveryPack || !activePack ? (
                    <Alert>
                      <AlertTitle>No copy for {platformLabel}</AlertTitle>
                      <AlertDescription>
                        Generate the delivery pack so title and description appear here.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      {activePublishPlatform === 'instagram' && (
                        <div className="rounded-xl border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">Reel media (public URL)</p>
                            <Badge variant={igHosting?.ready ? 'secondary' : 'outline'}>
                              {igHosting?.label || 'Checking…'}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {igHosting?.message ||
                              'Instagram downloads the MP4 from a public HTTPS URL (not localhost).'}
                          </p>
                          {igHosting?.mode === 's3' && igHosting.exampleKey && (
                            <p className="mt-2 truncate font-mono text-[0.7rem] text-muted-foreground">
                              Auto path: {igHosting.exampleKey}
                            </p>
                          )}
                          {igHosting?.mode === 'env_url' && igHosting.publicUrl && (
                            <p className="mt-2 truncate font-mono text-[0.7rem] text-muted-foreground">
                              {igHosting.publicUrl}
                            </p>
                          )}
                          {igHosting && !igHosting.ready && (
                            <Alert className="mt-3">
                              <AlertTitle>S3 or public URL required</AlertTitle>
                              <AlertDescription>
                                Fill <code>S3_BUCKET</code> + AWS keys in `.env` (recommended), or set{' '}
                                <code>PUBLISH_VIDEO_PUBLIC_URL</code>. Then restart UI and re-check.
                                {igHosting.missing.length ? (
                                  <span className="mt-1.5 flex flex-wrap gap-1">
                                    {igHosting.missing.map((name) => (
                                      <code key={name} className="connection-key">
                                        {name}
                                      </code>
                                    ))}
                                  </span>
                                ) : null}
                              </AlertDescription>
                            </Alert>
                          )}
                          {igHosting?.ready && igHosting.mode === 's3' && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Upload is automated: publish will push this episode’s MP4 to S3, then
                              call Instagram with that URL. You do not paste a URL each time.
                            </p>
                          )}
                        </div>
                      )}
                      <div className="grid gap-4 lg:grid-cols-[9rem_1fr]">
                        {publishVideoFile ? (
                          <video
                            controls
                            preload="metadata"
                            src={publishVideoFile.url}
                            className="aspect-[9/16] w-full max-w-[9rem] rounded-lg bg-black object-contain"
                          />
                        ) : (
                          <div className="flex aspect-[9/16] max-w-[9rem] items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                            No video
                          </div>
                        )}
                        <div className="min-w-0 flex flex-col gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {activeConnection.accountName && (
                              <Badge variant="outline">{activeConnection.accountName}</Badge>
                            )}
                            {publishDone[activePublishPlatform] && (
                              <Badge variant="secondary">Uploaded</Badge>
                            )}
                            {(activePublishPlatform === 'instagram' ||
                              activePublishPlatform === 'facebook') && (
                              <>
                                <Badge variant="outline">
                                  {metaPublishReel ? 'Reel on' : 'Reel off'}
                                </Badge>
                                <Badge variant="outline">
                                  {metaPublishStory ? 'Story on' : 'Story off'}
                                </Badge>
                              </>
                            )}
                          </div>

                          {(activePublishPlatform === 'instagram' ||
                            activePublishPlatform === 'facebook') && (
                            <div className="flex flex-col gap-2 rounded-lg border p-3">
                              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                Meta formats
                              </p>
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={metaPublishReel}
                                  disabled={Boolean(publishDone[activePublishPlatform])}
                                  onCheckedChange={(checked) => setMetaPublishReel(checked === true)}
                                />
                                Reel
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={metaPublishStory}
                                  disabled={Boolean(publishDone[activePublishPlatform])}
                                  onCheckedChange={(checked) =>
                                    setMetaPublishStory(checked === true)
                                  }
                                />
                                Story
                              </label>
                              <p className="text-xs text-muted-foreground">
                                Keep both on to post Reel + Story. Caption applies to Reel; Story is
                                video-only.
                              </p>
                            </div>
                          )}

                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                            <Checkbox
                              checked={customPack}
                              disabled={Boolean(publishDone[activePublishPlatform])}
                              onCheckedChange={(checked) => {
                                const on = checked === true;
                                setCustomPack(on);
                                setPackConfirmed((previous) => ({
                                  ...previous,
                                  [activePublishPlatform]: false
                                }));
                                if (on) {
                                  setPackDraft({
                                    title: '',
                                    description: '',
                                    tags: '',
                                    hashtags: '',
                                    cta: ''
                                  });
                                } else if (activePack) {
                                  setPackDraft({
                                    title: activePack.title,
                                    description: activePack.description,
                                    tags: activePack.tags.join(', '),
                                    hashtags: activePack.hashtags.join(' '),
                                    cta: activePack.cta
                                  });
                                }
                              }}
                            />
                            <span>
                              <span className="block text-sm font-medium">
                                Custom title / description / tags
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Turns on empty fields so you type everything yourself, then Save
                                before upload.
                              </span>
                            </span>
                          </label>

                          {customPack && packDraft ? (
                            <div className="flex flex-col gap-3">
                              <Field>
                                <FieldLabel>Title</FieldLabel>
                                <Input
                                  value={packDraft.title}
                                  placeholder="Required — empty titles cannot be uploaded"
                                  onChange={(event) =>
                                    setPackDraft((previous) =>
                                      previous
                                        ? { ...previous, title: event.target.value }
                                        : previous
                                    )
                                  }
                                  maxLength={100}
                                  className="font-[family-name:var(--font-hi)]"
                                />
                              </Field>
                              <Field>
                                <FieldLabel>Description</FieldLabel>
                                <Textarea
                                  value={packDraft.description}
                                  placeholder="Required — at least 20 characters"
                                  onChange={(event) =>
                                    setPackDraft((previous) =>
                                      previous
                                        ? { ...previous, description: event.target.value }
                                        : previous
                                    )
                                  }
                                  rows={6}
                                  className="font-[family-name:var(--font-hi)]"
                                />
                              </Field>
                              <Field>
                                <FieldLabel>Tags (comma-separated)</FieldLabel>
                                <Input
                                  value={packDraft.tags}
                                  placeholder={
                                    isTech
                                      ? 'dsa, sliding-window, interview'
                                      : 'mythology, krishna, shorts'
                                  }
                                  onChange={(event) =>
                                    setPackDraft((previous) =>
                                      previous ? { ...previous, tags: event.target.value } : previous
                                    )
                                  }
                                />
                              </Field>
                              <Field>
                                <FieldLabel>Hashtags</FieldLabel>
                                <Input
                                  value={packDraft.hashtags}
                                  placeholder={
                                    isTech
                                      ? '#Reels #DSA #Tech'
                                      : '#Shorts #Mythology'
                                  }
                                  onChange={(event) =>
                                    setPackDraft((previous) =>
                                      previous
                                        ? { ...previous, hashtags: event.target.value }
                                        : previous
                                    )
                                  }
                                />
                              </Field>
                              <Field>
                                <FieldLabel>CTA</FieldLabel>
                                <Input
                                  value={packDraft.cta}
                                  placeholder={
                                    isTech
                                      ? 'Save this for interview prep'
                                      : 'End tak dekho aur follow karo'
                                  }
                                  onChange={(event) =>
                                    setPackDraft((previous) =>
                                      previous ? { ...previous, cta: event.target.value } : previous
                                    )
                                  }
                                  maxLength={120}
                                  className="font-[family-name:var(--font-hi)]"
                                />
                              </Field>
                              <Button
                                type="button"
                                disabled={savingPack || jobBusy}
                                onClick={() => void saveCustomPackAndConfirm()}
                              >
                                {savingPack ? <Spinner data-icon="inline-start" /> : null}
                                Save custom copy & confirm
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div>
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Title
                                </p>
                                <p className="mt-1 font-[family-name:var(--font-hi)] text-sm font-semibold leading-relaxed">
                                  {activePack.title}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Description
                                </p>
                                <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-muted p-3 font-[family-name:var(--font-hi)] text-sm leading-relaxed whitespace-pre-wrap">
                                  {activePack.description}
                                </pre>
                              </div>
                              {activePack.tags.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Tags: {activePack.tags.join(', ')}
                                </p>
                              )}
                              {activePack.hashtags.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {activePack.hashtags.join(' ')}
                                </p>
                              )}
                            </>
                          )}

                          {activePack.coverUrl && (
                            <img
                              src={activePack.coverUrl}
                              alt={`${platformLabel} cover`}
                              className="max-w-[12rem] rounded-lg object-cover ring-1 ring-foreground/10"
                            />
                          )}
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                            <Checkbox
                              checked={Boolean(packConfirmed[activePublishPlatform])}
                              disabled={
                                Boolean(publishDone[activePublishPlatform]) ||
                                customPack ||
                                !packCopyReady(activePack)
                              }
                              onCheckedChange={(checked) => {
                                if (checked === true && !packCopyReady(activePack)) {
                                  toast.error(
                                    'Title, description, tags, and hashtags must be filled before confirm'
                                  );
                                  return;
                                }
                                setPackConfirmed((previous) => ({
                                  ...previous,
                                  [activePublishPlatform]: checked === true
                                }));
                              }}
                            />
                            <span>
                              <span className="block text-sm font-medium">
                                Use this title & description for {platformLabel}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {customPack
                                  ? 'Save custom copy above to confirm.'
                                  : !packCopyReady(activePack)
                                    ? 'Fill title/description/tags first (Custom blank packs start empty).'
                                    : 'Required before Upload / Schedule activates.'}
                              </span>
                            </span>
                          </label>
                          {publishDone[activePublishPlatform]?.url && (
                            <a
                              href={publishDone[activePublishPlatform]?.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary"
                            >
                              Open uploaded {platformLabel} post
                              <ExternalLinkIcon className="size-3.5" />
                            </a>
                          )}

                          <div className="rounded-xl border border-border/80 p-3">
                            <label className="flex cursor-pointer items-start gap-3">
                              <Checkbox
                                checked={scheduleEnabled}
                                disabled={Boolean(publishDone[activePublishPlatform])}
                                onCheckedChange={(checked) => {
                                  setScheduleEnabled(checked === true);
                                  if (checked === true && !scheduleLocal) {
                                    setScheduleLocal(defaultScheduleLocalValue());
                                  }
                                }}
                              />
                              <span>
                                <span className="block text-sm font-medium">Schedule posting</span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {isTech
                                    ? `Instagram queues for auto-publish at that time. Keep the Desk server running so queued posts can fire. Timezone: ${browserTimeZone()}.`
                                    : `YouTube + Facebook Reel use native schedule. Instagram (and Facebook Story) queue for auto-publish at that time. Keep the Desk server running so queued Meta posts can fire. Timezone: ${browserTimeZone()}.`}
                                </span>
                              </span>
                            </label>
                            {scheduleEnabled ? (
                              <Field className="mt-3">
                                <FieldLabel>Go live at</FieldLabel>
                                <Input
                                  type="datetime-local"
                                  value={scheduleLocal || defaultScheduleLocalValue()}
                                  onChange={(event) => setScheduleLocal(event.target.value)}
                                  disabled={Boolean(publishDone[activePublishPlatform])}
                                />
                                <FieldDescription>
                                  Must be at least 15 minutes ahead. Applies to Upload and Publish all.
                                </FieldDescription>
                              </Field>
                            ) : null}
                            {publishSchedules.length > 0 ? (
                              <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                  Queued for this episode
                                </p>
                                {publishSchedules.map((row) => (
                                  <div
                                    key={row.id}
                                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                                  >
                                    <span>
                                      {row.platforms.join(', ')} ·{' '}
                                      {new Date(row.scheduledAt).toLocaleString()} · {row.status}
                                    </span>
                                    {row.status === 'pending' ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7"
                                        disabled={scheduleBusy}
                                        onClick={() => {
                                          void (async () => {
                                            try {
                                              setScheduleBusy(true);
                                              await cancelPublishSchedule(row.id);
                                              await refreshPublishSchedules();
                                              toast.message('Schedule cancelled');
                                            } catch (error) {
                                              toast.error(
                                                error instanceof Error
                                                  ? error.message
                                                  : 'Could not cancel'
                                              );
                                            } finally {
                                              setScheduleBusy(false);
                                            }
                                          })();
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={jobBusy || !baseReady || activeConnection?.state !== 'connected'}
                    onClick={() => void publishToPlatform(activePublishPlatform, true)}
                  >
                    {publishAction === 'dry-run' ? <Spinner data-icon="inline-start" /> : null}
                    Dry-run {platformLabel}
                  </Button>
                  <Button
                    disabled={jobBusy || !activeReady}
                    onClick={() => void publishToPlatform(activePublishPlatform, false)}
                  >
                    {publishAction === 'upload' || publishAction === 'schedule' ? (
                      <Spinner data-icon="inline-start" />
                    ) : null}
                    {publishDone[activePublishPlatform]
                      ? publishDone[activePublishPlatform]?.status === 'scheduled'
                        ? `${platformLabel} scheduled`
                        : `${platformLabel} uploaded`
                      : scheduleEnabled
                        ? `Schedule ${activeConnection?.accountName || platformLabel}`
                        : `Upload to ${activeConnection?.accountName || platformLabel}`}
                  </Button>
                </CardFooter>
              </Card>
            </div>
            );
          })()}

          {(jobBusy || jobLog) && (
            <details className="advanced-tools" open={jobBusy}>
              <summary>
                <span>Command log</span>
                <span>
                  {jobBusy
                    ? 'Running…'
                    : jobLog
                      ? `${jobLog.command} · exit ${jobLog.exitCode ?? 'n/a'} · ${jobLog.ok ? 'ok' : 'failed'}`
                      : null}
                </span>
              </summary>
              {jobLog && (
                <div className="advanced-tools-content">
                  <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
                    {[jobLog.stdout, jobLog.stderr].filter(Boolean).join('\n')}
                  </pre>
                </div>
              )}
            </details>
          )}
          </section>
        </div>
      </main>

      <PastePackDialog
        open={pastePackOpen}
        onOpenChange={setPastePackOpen}
        packaging={
          detail?.packaging
            ? {
                ...detail.packaging,
                platforms: detail.packaging.platforms.filter((item) =>
                  pipelinePublishPlatforms.includes(item.platform)
                )
              }
            : null
        }
      />

      <ImportScriptDialog
        open={importScriptOpen}
        onOpenChange={setImportScriptOpen}
        onImported={async (file) => {
          const { episodes: next } = await listEpisodes();
          setEpisodes(next);
          selectEpisode(file);
        }}
      />

      <BgmPickerDialog
        open={bgmPickerOpen}
        onOpenChange={setBgmPickerOpen}
        selected={selectedBgm}
        onSelect={setSelectedBgm}
        moodHint={detail?.episode.audioPlan?.bgmMood}
      />
      <ImagePromptsDialog
        open={imagePromptsOpen}
        episodeFile={selectedFile}
        busy={jobBusy || activeJob === 'images'}
        onOpenChange={setImagePromptsOpen}
        onConfirmed={async () => {
          if (selectedFile) {
            const next = await getEpisode(selectedFile);
            setDetail(next);
          }
          await onRun('images', { provider: imageProvider });
        }}
      />

      <PublishAllDialog
        open={publishAllOpen}
        onOpenChange={setPublishAllOpen}
        connections={connections}
        states={platformUploadStates}
        jobBusy={jobBusy}
        scheduleMode={scheduleEnabled}
        scheduleLabel={
          scheduleEnabled
            ? (() => {
                try {
                  return new Date(
                    localScheduleToIso(scheduleLocal || defaultScheduleLocalValue())
                  ).toLocaleString();
                } catch {
                  return undefined;
                }
              })()
            : undefined
        }
        canBasePublish={
          detail?.assets.production?.reviewStatus === 'APPROVED' &&
          Boolean(matchingDeliveryPack) &&
          Boolean(resolvePublishVideoPath())
        }
        onConfirm={(platform) => {
          const pack = detail?.packaging?.platforms.find((item) => item.platform === platform);
          if (!packCopyReady(pack)) {
            toast.error(
              `Fill ${platform} title, description, tags & hashtags before confirming`
            );
            setActivePublishPlatform(platform);
            setCustomPack(true);
            setPackDraft({
              title: '',
              description: '',
              tags: '',
              hashtags: '',
              cta: ''
            });
            return;
          }
          setActivePublishPlatform(platform);
          setPackConfirmed((previous) => ({ ...previous, [platform]: true }));
        }}
        onUpload={(platform) => {
          setActivePublishPlatform(platform);
          void publishToPlatform(platform, false);
        }}
        onUploadAllReady={() => void publishAllReady()}
      />

      <StillUploadDialog
        open={stillUploadScene != null}
        sceneLabel={
          stillUploadScene === 0
            ? 'Opening hook'
            : stillUploadScene == null
              ? 'Scene'
              : `Scene ${stillUploadScene}`
        }
        busy={stillUploadBusy}
        onOpenChange={(open) => {
          if (!open && !stillUploadBusy) setStillUploadScene(null);
        }}
        onUpload={async (file) => {
          if (stillUploadScene == null) return;
          await uploadSceneStill(stillUploadScene, file);
        }}
      />

      <Dialog
        open={imageFixScene != null}
        onOpenChange={(open) => {
          if (!open && !imageFixBusy) {
            setImageFixScene(null);
            setImageFixFeedback('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!imageFixBusy}>
          <DialogHeader>
            <DialogTitle>Fix {imageFixScene === 0 ? 'hook' : `scene ${imageFixScene}`}</DialogTitle>
            <DialogDescription>
              What is wrong with this image? Only this scene will be regenerated using your note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={imageFixFeedback}
              disabled={imageFixBusy}
              rows={4}
              placeholder="e.g. wrong face, too dark, remove extra people, show baby Krishna clearly…"
              onChange={(event) => setImageFixFeedback(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Provider: <span className="font-medium text-foreground">{imageProvider}</span>
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={imageFixBusy}
              onClick={() => {
                setImageFixScene(null);
                setImageFixFeedback('');
              }}
            >
              Cancel
            </Button>
            <Button disabled={imageFixBusy || !imageFixFeedback.trim()} onClick={() => void submitImageFix()}>
              {imageFixBusy ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
              Regenerate this scene
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletingEpisode) {
            setDeleteTarget(null);
            setKeepAssetsOnDelete(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!deletingEpisode}>
          <DialogHeader>
            <DialogTitle>Delete script?</DialogTitle>
            <DialogDescription>
              This removes the episode JSON and review for{' '}
              <span className="font-medium text-foreground">{deleteTarget?.titleEn}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-mono text-xs text-muted-foreground">
              Script id: {deleteTarget?.id}
            </p>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={keepAssetsOnDelete}
                onCheckedChange={(checked) => setKeepAssetsOnDelete(checked === true)}
                disabled={deletingEpisode}
              />
              <span>
                <span className="block font-medium">Keep media assets</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Leave audio, images, Veo clips, and finals tagged with this id on disk. Uncheck to
                  delete those assets with the script.
                </span>
              </span>
            </label>
            {!keepAssetsOnDelete && (
              <Alert variant="destructive">
                <AlertTitle>Assets will be deleted</AlertTitle>
                <AlertDescription>
                  Removes output folders/files for this id (audio, images, video, packaging).
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deletingEpisode}
              onClick={() => {
                setDeleteTarget(null);
                setKeepAssetsOnDelete(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingEpisode}
              onClick={() => void confirmDeleteEpisode()}
            >
              {deletingEpisode ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
              {keepAssetsOnDelete ? 'Delete script only' : 'Delete script + assets'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
