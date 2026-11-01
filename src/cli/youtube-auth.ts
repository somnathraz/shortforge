#!/usr/bin/env node
/**
 * YouTube OAuth reconnect: prints auth URL, waits for ?code=, writes refresh token
 * to the per-brand vault (and .env for epicastra / legacy).
 *
 *   npm run publish:youtube-auth
 *   npm run publish:youtube-auth -- --brand tech-instagram
 *
 * Requires YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET in .env.
 * Optional: YOUTUBE_REDIRECT_URI (default http://localhost:8765/oauth2callback)
 *           YOUTUBE_OAUTH_PORT (default 8765)
 */
import '../lib/loadEnv.js';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_BRAND_ID, BRAND_IDS, LEGACY_ENV_BRAND_ID, isBrandId, type BrandId } from '../lib/brands.js';
import { persistYoutubeVaultTokens } from '../lib/publishConnections.js';
import {
  exchangeYoutubeAuthCode,
  fetchYoutubeChannelTitle,
  youtubeAuthUrl
} from '../providers/youtubeUpload.js';

const port = Number(process.env.YOUTUBE_OAUTH_PORT || '8765');
const redirectUri =
  process.env.YOUTUBE_REDIRECT_URI?.trim() || `http://localhost:${port}/oauth2callback`;

function parseBrandArg(argv: string[]): BrandId {
  const idx = argv.indexOf('--brand');
  const raw = idx >= 0 ? argv[idx + 1] : process.env.ACTIVE_BRAND || DEFAULT_BRAND_ID;
  if (!raw || !isBrandId(raw)) {
    throw new Error(`--brand must be one of ${BRAND_IDS.join(', ')} (got ${raw || 'empty'})`);
  }
  return raw;
}

function upsertEnv(contents: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) return contents.replace(pattern, line);
  const trimmed = contents.replace(/\s*$/, '');
  return `${trimmed}\n\n${line}\n`;
}

async function writeRefreshToken(refreshToken: string): Promise<string | undefined> {
  if (process.env.YOUTUBE_AUTH_WRITE_ENV === 'false') return undefined;
  const envPath = path.resolve(process.env.DOTENV_PATH || '.env');
  try {
    const previous = await readFile(envPath, 'utf8');
    const next = upsertEnv(previous, 'YOUTUBE_REFRESH_TOKEN', refreshToken);
    if (next === previous) return undefined;
    await writeFile(envPath, next, 'utf8');
    return envPath;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const brandId = parseBrandArg(process.argv.slice(2));
  const url = youtubeAuthUrl({ brandId, redirectUri });
  console.log(`YouTube reconnect · pipeline ${brandId}`);
  console.log('1. Open this URL, pick the channel account, and approve upload access:\n');
  console.log(url);
  console.log(`\n2. Waiting on ${redirectUri} …`);

  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const incoming = new URL(req.url || '/', `http://localhost:${port}`);
        if (incoming.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const code = incoming.searchParams.get('code');
        const err = incoming.searchParams.get('error');
        if (err) throw new Error(`OAuth error: ${err}`);
        if (!code) throw new Error('No code in callback');

        const tokens = await exchangeYoutubeAuthCode(code, redirectUri);
        if (!tokens.refresh_token) {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(
            'No refresh_token returned. Revoke Mythology Factory / your Google app access at https://myaccount.google.com/permissions then retry.'
          );
          server.close();
          reject(new Error('No refresh_token returned — revoke app access and retry with prompt=consent'));
          return;
        }

        let accountName: string | undefined;
        if (tokens.access_token) {
          try {
            accountName = await fetchYoutubeChannelTitle(tokens.access_token);
          } catch {
            accountName = undefined;
          }
        }

        const vaultPath = persistYoutubeVaultTokens({
          brandId,
          refreshToken: tokens.refresh_token,
          ...(accountName ? { accountName } : {}),
          ...(process.env.YOUTUBE_CLIENT_ID?.trim()
            ? { clientId: process.env.YOUTUBE_CLIENT_ID.trim() }
            : {}),
          ...(process.env.YOUTUBE_CLIENT_SECRET?.trim()
            ? { clientSecret: process.env.YOUTUBE_CLIENT_SECRET.trim() }
            : {})
        });

        // Keep .env in sync for epicastra only so Tech never overwrites EpicAstra's global token.
        const envPath =
          brandId === LEGACY_ENV_BRAND_ID ? await writeRefreshToken(tokens.refresh_token) : undefined;

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          `<p><strong>YouTube auth OK</strong> for <code>${brandId}</code>${
            accountName ? ` (${accountName})` : ''
          }. Close this tab and return to Desk → Publish → Re-check connections.</p>`
        );

        console.log(`\nYouTube reconnect OK · ${brandId}${accountName ? ` · ${accountName}` : ''}.`);
        console.log(`Vault: ${vaultPath}`);
        if (envPath) {
          console.log(`Updated YOUTUBE_REFRESH_TOKEN in ${envPath}`);
        } else if (brandId !== LEGACY_ENV_BRAND_ID) {
          console.log(`Token stored in the ${brandId} vault only (global .env left unchanged).`);
        } else {
          console.log('\nAdd this to your .env (do not commit):\n');
          console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
        }
        console.log('Restart Desk (npm run ui) then Re-check connections.');
        server.close();
        resolve();
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(error instanceof Error ? error.message : String(error));
        server.close();
        reject(error);
      }
    });
    server.listen(port, () => {
      import('node:child_process')
        .then(({ spawn }) => {
          const opener =
            process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
          spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
        })
        .catch(() => undefined);
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
