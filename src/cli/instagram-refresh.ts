#!/usr/bin/env node
/**
 * Refresh Instagram long-lived user token (no browser).
 *
 *   npm run publish:instagram-refresh
 *   npm run publish:instagram-refresh -- --brand tech-instagram
 *
 * Uses vault token (data/connections/<brand>.json) or INSTAGRAM_ACCESS_TOKEN.
 * On success writes vault + .env INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID.
 * If Meta rejects (expired), run: npm run publish:instagram-auth
 */
import '../lib/loadEnv.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isBrandId, resolveBrandId, type BrandId } from '../lib/brands.js';
import {
  getInstagramVaultEntry,
  persistInstagramVaultTokens
} from '../lib/publishConnections.js';
import {
  fetchInstagramUsername,
  refreshInstagramLongLivedToken
} from '../providers/instagramAuth.js';

function parseBrandArg(argv: string[]): BrandId {
  const idx = argv.indexOf('--brand');
  if (idx >= 0) {
    const value = argv[idx + 1];
    if (!isBrandId(value)) {
      throw new Error(`--brand must be epicastra or tech-instagram (got ${value || '(missing)'})`);
    }
    return value;
  }
  return resolveBrandId(process.env.ACTIVE_BRAND);
}

function upsertEnv(contents: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) return contents.replace(pattern, line);
  const trimmed = contents.replace(/\s*$/, '');
  return `${trimmed}\n\n${line}\n`;
}

async function writeEnvTokens(accessToken: string, userId: string): Promise<string | undefined> {
  if (process.env.INSTAGRAM_AUTH_WRITE_ENV === 'false') return undefined;
  const envPath = path.resolve(process.env.DOTENV_PATH || '.env');
  try {
    const previous = await readFile(envPath, 'utf8');
    let next = upsertEnv(previous, 'INSTAGRAM_ACCESS_TOKEN', accessToken);
    next = upsertEnv(next, 'INSTAGRAM_USER_ID', userId);
    if (next === previous) return undefined;
    await writeFile(envPath, next, 'utf8');
    return envPath;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const brandId = parseBrandArg(process.argv.slice(2));
  const vault = getInstagramVaultEntry(brandId);
  const accessToken = vault?.accessToken?.trim() || process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const userId = vault?.userId?.trim() || process.env.INSTAGRAM_USER_ID?.trim();

  if (!accessToken) {
    throw new Error(
      `No Instagram token for ${brandId}. Run: npm run publish:instagram-auth -- --brand ${brandId}`
    );
  }
  if (!userId) {
    throw new Error(`No INSTAGRAM_USER_ID for ${brandId}. Re-authorize Instagram once.`);
  }

  console.log(`Refreshing Instagram long-lived token for ${brandId} …`);
  const refreshed = await refreshInstagramLongLivedToken(accessToken);
  const username =
    (await fetchInstagramUsername(refreshed.accessToken, userId)) || vault?.accountName;

  const saved = persistInstagramVaultTokens({
    brandId,
    accessToken: refreshed.accessToken,
    userId,
    ...(username ? { accountName: username } : {}),
    ...(refreshed.expiresIn != null ? { expiresIn: refreshed.expiresIn } : {})
  });
  const envPath = await writeEnvTokens(refreshed.accessToken, userId);

  console.log(`Saved vault: ${saved.envPath}`);
  if (envPath) console.log(`Updated .env: ${envPath}`);
  if (username) console.log(`Account: @${username.replace(/^@/, '')}`);
  if (refreshed.expiresIn) {
    const days = (refreshed.expiresIn / 86400).toFixed(1);
    console.log(`Expires in ≈${days} days (${refreshed.expiresIn}s)`);
  }
  console.log('\nRestart Desk (npm run ui) if it was already running, then Re-check connections.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
