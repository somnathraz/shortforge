#!/usr/bin/env node
/**
 * Instagram Login OAuth → per-pipeline connection vault.
 *
 *   npm run publish:instagram-auth
 *   npm run publish:instagram-auth -- --brand tech-instagram
 *
 * Requires INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET in .env.
 * Optional: INSTAGRAM_REDIRECT_URI (default http://127.0.0.1:8766/instagram-oauth/callback)
 *           INSTAGRAM_OAUTH_PORT (default 8766)
 */
import '../lib/loadEnv.js';
import { createServer } from 'node:http';
import {
  isBrandId,
  resolveBrandId,
  type BrandId
} from '../lib/brands.js';
import { persistInstagramVaultTokens, verifyInstagramOAuthState } from '../lib/publishConnections.js';
import {
  completeInstagramOAuth,
  instagramAppConfig,
  instagramAuthUrl
} from '../providers/instagramAuth.js';

const port = Number(process.env.INSTAGRAM_OAUTH_PORT || '8766');
const defaultRedirect = `http://127.0.0.1:${port}/instagram-oauth/callback`;

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

async function main(): Promise<void> {
  const brandId = parseBrandArg(process.argv.slice(2));

  // Prefer dedicated CLI redirect so Desk (8787) and CLI (8766) don't collide.
  if (!process.env.INSTAGRAM_REDIRECT_URI?.trim()) {
    process.env.INSTAGRAM_REDIRECT_URI = defaultRedirect;
  }

  const config = instagramAppConfig();
  const url = instagramAuthUrl(config, brandId);

  console.log(`Pipeline: ${brandId}`);
  console.log('1. Open this URL in a browser and approve Instagram publish access:\n');
  console.log(url);
  console.log(`\n2. Waiting on ${config.redirectUri} …`);
  console.log('   (Add this exact Redirect URI in the Meta Instagram app settings.)\n');

  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const incoming = new URL(req.url || '/', `http://127.0.0.1:${port}`);
        const expectedPath = new URL(config.redirectUri).pathname;
        if (incoming.pathname !== expectedPath) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const code = incoming.searchParams.get('code');
        const err = incoming.searchParams.get('error');
        const errDesc = incoming.searchParams.get('error_description');
        if (err) throw new Error(`OAuth error: ${err}${errDesc ? ` — ${errDesc}` : ''}`);
        if (!code) throw new Error('No code in callback');

        const state = verifyInstagramOAuthState(incoming.searchParams.get('state'));
        if (state.brandId !== brandId) {
          throw new Error(`OAuth state brand ${state.brandId} != requested ${brandId}`);
        }

        const tokens = await completeInstagramOAuth(code);
        const saved = persistInstagramVaultTokens({
          brandId,
          accessToken: tokens.accessToken,
          userId: tokens.userId,
          ...(tokens.username ? { accountName: tokens.username } : {}),
          ...(tokens.expiresIn != null ? { expiresIn: tokens.expiresIn } : {})
        });

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><html><body style="font-family:system-ui;padding:2rem">` +
            `<h1>Instagram auth OK</h1>` +
            `<p>${tokens.username ? `Connected as <strong>@${tokens.username}</strong>` : 'Token received'}` +
            ` for <strong>${brandId}</strong>. You can close this tab.</p></body></html>`
        );

        console.log(`\nSaved vault: ${saved.envPath}`);
        console.log(`INSTAGRAM_USER_ID=${tokens.userId}`);
        if (tokens.username) console.log(`# @${tokens.username}`);
        if (tokens.expiresIn) console.log(`# expires_in≈${tokens.expiresIn}s`);
        console.log('\nRestart Desk (npm run ui) → switch pipeline → Publish → Re-check connections.\n');

        server.close();
        resolve();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(message);
        server.close();
        reject(error);
      }
    });
    server.listen(port, '127.0.0.1');
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
