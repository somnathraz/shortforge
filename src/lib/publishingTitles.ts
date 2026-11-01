export type TitleSet = { shared?: string | undefined; youtube?: string | undefined; instagram?: string | undefined; facebook?: string | undefined };
export type PublishingTitles = { hi?: TitleSet | undefined; en?: TitleSet | undefined };

/** Exact editorial copy; never append hashtags or rewrite an explicit title. */
export function publishingTitle(
  episode: { titleHi: string; titleEn: string; publishingTitles?: PublishingTitles | undefined },
  language: 'hi' | 'en',
  platform: 'youtube' | 'instagram' | 'facebook',
  sharedOnly = false
): string {
  const titles = episode.publishingTitles?.[language];
  return ((!sharedOnly && titles?.[platform]) || titles?.shared ||
    (language === 'hi' ? episode.titleHi : episode.titleEn)).trim();
}
