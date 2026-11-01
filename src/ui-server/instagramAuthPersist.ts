import type { BrandId } from '../lib/brands.js';
import { currentBrandId } from '../lib/brands.js';
import { persistInstagramVaultTokens } from '../lib/publishConnections.js';

/** Persist Instagram Login tokens into the per-brand connection vault. */
export async function persistInstagramLoginTokens(input: {
  accessToken: string;
  userId: string;
  brandId?: BrandId;
  accountName?: string;
  expiresIn?: number;
}): Promise<{ envPath: string; brandId: BrandId }> {
  return persistInstagramVaultTokens({
    brandId: input.brandId || currentBrandId(),
    accessToken: input.accessToken,
    userId: input.userId,
    ...(input.accountName ? { accountName: input.accountName } : {}),
    ...(input.expiresIn != null ? { expiresIn: input.expiresIn } : {})
  });
}
