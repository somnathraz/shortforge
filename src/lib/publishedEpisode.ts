import type { ProductionReportSummary } from '../ui-server/types.js';

/** True when at least one platform upload/schedule succeeded for the current final. */
export function isProductionPublished(
  production: Pick<ProductionReportSummary, 'finalVideo' | 'publish'> | null | undefined
): boolean {
  if (!production?.publish?.results?.length) return false;
  const currentFinal = production.finalVideo?.replace(/^\/api\/media\//, '');
  return production.publish.results.some(
    (item) =>
      (item.status === 'uploaded' || item.status === 'scheduled') &&
      !item.error &&
      (!item.videoPath ||
        Boolean(currentFinal && item.videoPath.replaceAll('\\', '/').endsWith(currentFinal)))
  );
}
