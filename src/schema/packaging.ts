import { z } from 'zod';

export const PackagingLanguageSchema = z.enum(['hi', 'en']);
export type PackagingLanguage = z.infer<typeof PackagingLanguageSchema>;

export const PlatformCopySchema = z.object({
  platform: z.enum(['youtube', 'instagram', 'facebook']),
  title: z.string().min(3).max(100),
  description: z.string().min(20).max(5000),
  tags: z.array(z.string().min(1).max(40)).min(3).max(20),
  hashtags: z.array(z.string().min(2).max(40)).min(3).max(30),
  cta: z.string().min(3).max(120),
  coverPrompt: z.string().min(20).max(500)
});

export const PackagingCopySchema = z.object({
  sharedHookHi: z.string().min(8).max(160),
  thumbnailTextHi: z.string().min(2).max(28),
  /** Brand publish profiles may be Instagram-only (tech) or YT+IG+FB (EpicAstra). */
  platforms: z.array(PlatformCopySchema).min(1).max(3)
});

export type PackagingCopy = z.infer<typeof PackagingCopySchema>;
export type PlatformCopy = z.infer<typeof PlatformCopySchema>;
export type PackagingPlatformId = PlatformCopy['platform'];

export type PlatformPack = PlatformCopy & {
  coverPath?: string;
  coverAspect: string;
};

export type EpisodePackaging = {
  episodeId: string;
  createdAt: string;
  language: PackagingLanguage;
  imageProvider: string;
  sharedHookHi: string;
  thumbnailTextHi: string;
  platforms: Partial<Record<PackagingPlatformId, PlatformPack>> & {
    // At least one platform is always present after packageEpisode.
    [K in PackagingPlatformId]?: PlatformPack;
  };
};
