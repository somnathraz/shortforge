/**
 * One-shot YouTube OAuth callback listener for the EpicAstra/CLI redirect URI
 * (default http://localhost:8765/oauth2callback) so Desk can reuse the same
 * Google Cloud authorized redirect without a second URI.
 */
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { ROOT } from './paths.js';
import { persistYoutubeVaultTokens, verifyYoutubeOAuthState } from '../lib/publishConnections.js';
import {
  exchangeYoutubeAuthCode,
  fetchYoutubeChannelTitle,
  youtubeDeskRedirectUri
} from '../providers/youtubeUpload.js';

let activeServer: Server | null = null;
let activePort: number | null = null;
let listenPromise: Promise<void> | null = null;

function parseRedirect(redirectUri: string): { port: number; pathname: string } {
  const url = new URL(redirectUri);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  return { port, pathname: url.pathname || '/oauth2callback' };
}

export async function ensureYoutubeOAuthCallbackServer(): Promise<{
  redirectUri: string;
  port: number;
}> {
  const redirectUri = youtubeDeskRedirectUri();
  const { port, pathname } = parseRedirect(redirectUri);

  // Desk itself already serves this path — no sidecar needed.
  if (pathname.startsWith('/api/publish/youtube-oauth/')) {
    return { redirectUri, port };
  }

  if (activeServer && activePort === port && listenPromise) {
    await listenPromise;
    return { redirectUri, port };
  }

  if (activeServer) {
    try {
      activeServer.close();
    } catch {
      /* ignore */
    }
    activeServer = null;
    activePort = null;
    listenPromise = null;
  }

  const server = createServer(async (req, res) => {
    try {
      const incoming = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      if (incoming.pathname !== pathname) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const err = incoming.searchParams.get('error');
      const errDesc = incoming.searchParams.get('error_description');
      if (err) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`OAuth error: ${err}${errDesc ? ` — ${errDesc}` : ''}`);
        return;
      }

      const code = incoming.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Missing code in YouTube callback');
        return;
      }

      const oauthState = verifyYoutubeOAuthState(incoming.searchParams.get('state'));
      const tokens = await exchangeYoutubeAuthCode(code, redirectUri);
      if (!tokens.refresh_token) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(
          'No refresh_token returned. Revoke this Google app at https://myaccount.google.com/permissions then Authorize YouTube again.'
        );
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

      const filePath = persistYoutubeVaultTokens({
        brandId: oauthState.brandId,
        refreshToken: tokens.refresh_token,
        ...(accountName ? { accountName } : {}),
        ...(process.env.YOUTUBE_CLIENT_ID?.trim()
          ? { clientId: process.env.YOUTUBE_CLIENT_ID.trim() }
          : {}),
        ...(process.env.YOUTUBE_CLIENT_SECRET?.trim()
          ? { clientSecret: process.env.YOUTUBE_CLIENT_SECRET.trim() }
          : {})
      });

      const who = accountName || 'YouTube channel';
      const rel = path.relative(ROOT, filePath);
      const deskPort = process.env.UI_PORT || '8787';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html><head><title>YouTube connected</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:36rem;line-height:1.5">
  <h1>YouTube connected</h1>
  <p>Signed in as <strong>${who}</strong> for pipeline <strong>${oauthState.brandId}</strong>.</p>
  <p>Refresh token saved to <code>${rel}</code> (not shared across pipelines).</p>
  <p>Return to Desk → Publish → <strong>Re-check connections</strong>.</p>
  <p><a href="http://127.0.0.1:${deskPort}/">Back to Desk</a></p>
  <script>try{window.opener&&window.opener.postMessage({type:'youtube-auth-ok',brandId:${JSON.stringify(oauthState.brandId)}},'*')}catch(e){}</script>
</body></html>`);

      setTimeout(() => {
        if (activeServer === server) {
          server.close();
          activeServer = null;
          activePort = null;
          listenPromise = null;
        }
      }, 60_000);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.message : 'YouTube OAuth failed');
    }
  });

  listenPromise = new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      activeServer = null;
      activePort = null;
      listenPromise = null;
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `YouTube OAuth callback port ${port} is already in use. Stop the other process (or finish npm run publish:youtube-auth) and retry Authorize YouTube.`
          )
        );
        return;
      }
      reject(error);
    });
    server.listen(port, '127.0.0.1', () => resolve());
  });

  activeServer = server;
  activePort = port;
  await listenPromise;
  return { redirectUri, port };
}
