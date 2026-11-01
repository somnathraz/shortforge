export type ClaimVerdict = 'unchecked' | 'supported' | 'unsupported' | 'needs-source';

export type PhaseApprovals = {
  script: boolean;
  tts: boolean;
  images: boolean;
};

/** Paths relative to output/ with `/` separators. */
export type SelectedAssets = {
  sceneVisuals?: import('../lib/sceneVisualPlan.js').SceneVisuals | undefined;
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
  /** Locked files the reviewer chose (produce uses these first). */
  selected: SelectedAssets;
  /** True when script + tts + images are all approved (ready to produce). */
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
  /** Probed duration for audio assets (seconds). */
  durationSeconds?: number;
};

export type SceneAsset = {
  sceneId: number;
  image?: string;
  imagePath?: string;
  clip?: string;
  veoClip?: string;
  imageCandidates: AssetFile[];
  clipCandidates: AssetFile[];
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
      id?: string | undefined;
      url?: string | undefined;
      error?: string | undefined;
      scheduledAt?: string | undefined;
      scheduleId?: string | undefined;
      formats?:
        | Array<{ kind: 'reel' | 'story'; id: string; url?: string | undefined }>
        | undefined;
      videoPath?: string | undefined;
    }>;
  };
};

export type EpisodeAssets = {
  audio: AssetFile[];
  images: SceneAsset[];
  /** EpicAstra Heritage Frame preview stills (not used in produce). */
  heritageDemos?: {
    variant?: string;
    strong?: AssetFile;
    thin?: AssetFile;
  };
  video: string[];
  /** Externally uploaded full videos for this episode only. */
  external: AssetFile[];
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
    hasVeo: boolean;
    hasVideo: boolean;
    hasFinal: boolean;
    productionStatus: string | null;
    productionStale: boolean;
    hasPublished: boolean;
  };
  review: EpisodeReview | null;
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

export type PipelinePhase = 'script' | 'tts' | 'images' | 'produce' | 'review';
