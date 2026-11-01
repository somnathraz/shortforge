export type ClaimVerdict = 'unchecked' | 'supported' | 'unsupported' | 'needs-source';

export type PhaseApprovals = {
  script: boolean;
  tts: boolean;
  images: boolean;
};

/** Paths relative to output/ with `/` separators. */
export type SelectedAssets = {
  sceneVisuals?: import('../../../src/lib/sceneVisualPlan').SceneVisuals | undefined;
  burnSubtitles?: boolean | undefined;
  audio?: string | undefined;
  images?: Record<string, string> | undefined;
  clips?: Record<string, string> | undefined;
  /** Full assembled Short (veo assemble or produce final), not scene clips. */
  final?: string | undefined;
  /** Uploaded external video under output/external/<episodeId>/. */
  externalVideo?: string | undefined;
};

export type EpisodeReview = {
  episodeFile: string;
  episodeId: string;
  claimVerdicts: Record<string, ClaimVerdict>;
  approvals: PhaseApprovals;
  selected: SelectedAssets;
  approvedForProduction: boolean;
  reviewerNotes: string;
  updatedAt: string;
};

export type AssetFile = {
  url: string;
  path: string;
  name: string;
  mtimeMs: number;
  provider?: string;
  durationSeconds?: number;
};

export type SceneAsset = {
  sceneId: number;
  image?: string;
  imagePath?: string;
  clip?: string;
  veoClip?: string;
  imageCandidates?: AssetFile[];
  clipCandidates?: AssetFile[];
};

export type ProductionReportSummary = {
  path: string;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REGENERATE';
  finalVideo?: string;
  costUsd: number;
  regenerateSceneIds: number[];
  sceneCount: number;
  staleReason?: string;
  publish?: {
    lastAt: string;
    dryRun: boolean;
    results: Array<{
      platform: string;
      status: string;
      id?: string;
      url?: string;
      error?: string;
      scheduledAt?: string;
      scheduleId?: string;
      formats?: Array<{ kind: 'reel' | 'story'; id: string; url?: string }>;
      videoPath?: string;
    }>;
  };
};

export type PlatformPackView = {
  platform: 'youtube' | 'instagram' | 'facebook';
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  cta: string;
  coverAspect: string;
  coverUrl?: string;
  pasteText: string;
};

export type PackagingView = {
  episodeId: string;
  createdAt: string;
  language: 'hi' | 'en';
  imageProvider: string;
  sharedHookHi: string;
  thumbnailTextHi: string;
  platforms: PlatformPackView[];
  files: string[];
};

export type PublishConnection = {
  platform: 'youtube' | 'instagram' | 'facebook';
  state: 'connected' | 'unchecked' | 'setup_required' | 'error';
  label: string;
  message: string;
  missing: string[];
  connectUrl: string;
  brandId?: string;
  accountName?: string;
  mediaHosting?: {
    ready: boolean;
    mode: 'env_url' | 's3' | 'missing';
    label: string;
    message: string;
    missing: string[];
    exampleKey?: string;
    publicUrl?: string;
  };
};

export type InstagramMediaHosting = {
  ready: boolean;
  mode: 'env_url' | 's3' | 'missing';
  label: string;
  message: string;
  missing: string[];
  exampleKey?: string;
  publicUrl?: string;
  bucket?: string;
  region?: string;
  prefix?: string;
};

export type EpisodeAssets = {
  audio: Array<AssetFile | string>;
  images: SceneAsset[];
  heritageDemos?: {
    variant?: string;
    strong?: AssetFile;
    thin?: AssetFile;
  };
  video: string[];
  /** Externally uploaded videos for this episode only. */
  external?: AssetFile[];
  veo: string[];
  srt: string[];
  final: string[];
  production: ProductionReportSummary | null;
};

export type EpisodeSummary = {
  file: string;
  id: string;
  titleEn: string;
  titleHi: string;
  topic: string;
  storyKind: string;
  reviewStatus: string;
  targetDurationSeconds: number;
  sceneCount: number;
  paidMotionScenes: number;
  claimsCount: number;
  mtimeMs: number;
  assets: {
    hasAudio: boolean;
    hasImages: boolean;
    hasVideo: boolean;
    hasVeo: boolean;
    hasFinal: boolean;
    productionStatus: string | null;
    productionStale: boolean;
    hasPublished: boolean;
  };
  review: EpisodeReview | null;
};

export type VoiceDirection = {
  emotion: string;
  delivery: string;
  intensity?: number;
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
};

export type Scene = {
  id: number;
  startSecond: number;
  durationSeconds: number;
  narrationHi: string;
  /** ElevenLabs v4 direction; captions still use narrationHi. */
  voiceDirection?: VoiceDirection;
  /** ElevenLabs v4 speak text with [audio tags]; omit for plain narrationHi. */
  elevenLabsText?: string;
  voiceSegments?: Array<{
    id: string;
    type: 'NARRATION' | 'DIALOGUE';
    speaker: string;
    voiceRole: string;
    textHi: string;
    delivery?: string;
    voiceDirection?: VoiceDirection;
    elevenLabsText?: string;
    lipSync?: boolean;
  }>;
  visualPrompt: string;
  /** Motion prompt for AI_VIDEO (Wan/Kling/Veo). Optional on STILL / older JSON. */
  videoPrompt?: string;
  videoNegativePrompt?: string;
  camera: string;
  importance: number;
  renderMode: 'STILL' | 'AI_VIDEO';
  soundCue: string;
  appearingLords?: string[];
  characterStates?: Record<string, string>;
  /** Tech-only deterministic teaching diagram. */
  techVisual?: {
    visualType: string;
    visualData?: Record<string, unknown>;
    animationSteps?: Array<{
      at: number;
      action: string;
      index?: number;
      row?: number;
      value?: string | number;
      label?: string;
    }>;
  };
};

export type Episode = {
  publishingTitles?: import('../../../src/lib/publishingTitles').PublishingTitles;
  id: string;
  brandId?: string;
  storyKind: string;
  topic: string;
  titleHi: string;
  titleEn: string;
  hookHi: string;
  /** First words heard in TTS/captions — not the publishing title. */
  spokenHook?:
    | string
    | {
        textHi: string;
        voiceRole?: string;
        delivery?: string;
        estimatedDurationSeconds?: number;
      };
  spokenHookDurationSeconds?: number;
  hookDelivery?:
    | 'curious'
    | 'confident'
    | 'urgent'
    | 'warm'
    | 'intriguing'
    | 'challenge_then_pause';
  /** SINGLE_NARRATOR (default) or TWO_SPEAKER_DIALOGUE */
  format?: 'SINGLE_NARRATOR' | 'TWO_SPEAKER_DIALOGUE' | string;
  voices?: {
    A?: { role?: string; voiceId: string; note?: string };
    B?: { role?: string; voiceId: string; note?: string };
  };
  voiceCast?: Record<
    string,
    {
      provider: 'sarvam' | 'elevenlabs' | 'edge';
      model?: string;
      speaker: string;
      languageCode?: string;
      pace?: number;
      temperature?: number;
    }
  >;
  characterVoiceMap?: Record<string, string>;
  featuredLords?: Array<{
    nameEn: string;
    nameHi: string;
    importance: 'primary' | 'supporting' | string;
    visualIdentity: string;
    doNotConfuseWith: string;
    states?: Record<string, string>;
  }>;
  hookVisualPrompt?: string;
  hookAppearingLords?: string[];
  hookCharacterStates?: Record<string, string>;
  hookTechVisual?: {
    visualType: string;
    visualData?: Record<string, unknown>;
    animationSteps?: Array<{
      at: number;
      action: string;
      index?: number;
      row?: number;
      value?: string | number;
      label?: string;
    }>;
  };
  visualStyle?: {
    brand?: 'EPICASTRA_HERITAGE' | 'TECH_EDITORIAL';
    frameVariant?: 'HERITAGE_LIGHT' | 'HERITAGE_CLASSIC' | 'HERITAGE_DRAMATIC';
    lockThinBorder?: boolean;
  };
  targetDurationSeconds: number;
  audience: string;
  fictionDisclosureRequired: boolean;
  sourceReview: {
    status: string;
    claimsToVerify: string[];
    notes: string[];
  };
  scenes: Scene[];
  ending: {
    payoffHi: string;
    nextEpisodeTeaseHi: string;
  };
  metadata: {
    descriptionHi: string;
    keywords: string[];
    thumbnailTextHi: string;
  };
  audioPlan?: {
    bgmMood: string;
    sfx: Array<{
      time: number;
      effect: string;
      volume: number;
      reason: string;
    }>;
    timingSource?: string;
    narrationDurationSeconds?: number;
    bgmTrack?: string;
    sfxUsage?: {
      local: number;
      elevenlabs: number;
      skipped?: number;
      cues: Array<{ effect: string; source: string; file: string }>;
    };
  };
};

export type EpisodeDetail = {
  visualTimeline?: Array<{ id: number; startSecond: number; durationSeconds: number }>;
  file: string;
  mtimeMs: number;
  episode: Episode;
  assets: EpisodeAssets;
  review: EpisodeReview | null;
  packaging: PackagingView | null;
};

export type JobKind =
  | 'topics'
  | 'story'
  | 'tts:free'
  | 'tts:elevenlabs'
  | 'tts:sarvam'
  | 'audio:plan'
  | 'audio:mix'
  | 'audio:sfx-el'
  | 'images'
  | 'images:demo'
  | 'render'
  | 'remotion'
  | 'remotion:chrome'
  | 'animate'
  | 'produce'
  | 'mux:external'
  | 'package'
  | 'review'
  | 'publish';

export type JobResult = {
  ok: boolean;
  kind: JobKind;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export type PipelinePhase = 'script' | 'tts' | 'images' | 'produce' | 'review' | 'publish';
