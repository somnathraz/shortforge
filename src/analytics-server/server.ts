#!/usr/bin/env node
/**
 * Separate YouTube analytics API + dashboard.
 * Default: http://127.0.0.1:8790
 */
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../lib/loadEnv.js';
import {
  fetchFactoryPublishes,
  fetchMultiPlatformOverview,
  type AnalyticsPlatform
} from '../providers/multiPlatformAnalytics.js';
import {
  fetchYoutubeChannelStats,
  fetchYoutubeRecentUploads,
  fetchYoutubeVideoStats
} from '../providers/youtubeAnalytics.js';

const PORT = Number(process.env.ANALYTICS_PORT || '8790');
const HOST = process.env.ANALYTICS_HOST || '127.0.0.1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(HERE, '../../analytics-ui');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(payload);
}

function sendText(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

async function serveStatic(reqPath: string, res: http.ServerResponse): Promise<boolean> {
  const relative = reqPath === '/' ? 'index.html' : reqPath.replace(/^\//, '');
  const absolute = path.resolve(STATIC_DIR, relative);
  if (!absolute.startsWith(STATIC_DIR)) {
    sendText(res, 400, 'Invalid path');
    return true;
  }
  try {
    await access(absolute);
    const info = await stat(absolute);
    if (!info.isFile()) return false;
  } catch {
    if (!path.extname(relative)) {
      const indexPath = path.join(STATIC_DIR, 'index.html');
      try {
        await access(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        createReadStream(indexPath).pipe(res);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
  const type = MIME[path.extname(absolute).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(absolute).pipe(res);
  return true;
}

function parsePlatform(value: string | null): AnalyticsPlatform {
  const raw = (value || 'all').toLowerCase();
  if (raw === 'youtube' || raw === 'instagram' || raw === 'facebook' || raw === 'all') return raw;
  throw new Error('platform must be all|youtube|instagram|facebook');
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const { pathname } = url;
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    if (method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, { ok: true, service: 'publish-analytics' });
      return;
    }

    if (method === 'GET' && pathname === '/api/analytics/channel') {
      sendJson(res, 200, { channel: await fetchYoutubeChannelStats() });
      return;
    }

    if (method === 'GET' && pathname === '/api/analytics/videos') {
      const limit = Number(url.searchParams.get('limit') || '25');
      sendJson(res, 200, { videos: await fetchYoutubeRecentUploads(limit) });
      return;
    }

    const videoMatch = pathname.match(/^\/api\/analytics\/videos\/([^/]+)$/);
    if (method === 'GET' && videoMatch) {
      const id = decodeURIComponent(videoMatch[1]!);
      const [video] = await fetchYoutubeVideoStats([id]);
      if (!video) {
        sendJson(res, 404, { error: `Video not found: ${id}` });
        return;
      }
      sendJson(res, 200, { video });
      return;
    }

    if (method === 'GET' && pathname === '/api/analytics/factory') {
      const episodeId = url.searchParams.get('episodeId') || undefined;
      const platform = parsePlatform(url.searchParams.get('platform'));
      const withStats = url.searchParams.get('stats') !== '0';
      sendJson(res, 200, {
        platform,
        publishes: await fetchFactoryPublishes({
          ...(episodeId ? { episodeId } : {}),
          platform,
          withStats
        })
      });
      return;
    }

    const factoryMatch = pathname.match(/^\/api\/analytics\/factory\/([^/]+)$/);
    if (method === 'GET' && factoryMatch) {
      const episodeId = decodeURIComponent(factoryMatch[1]!);
      const platform = parsePlatform(url.searchParams.get('platform'));
      sendJson(res, 200, {
        platform,
        publishes: await fetchFactoryPublishes({ episodeId, platform, withStats: true })
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/analytics/overview') {
      const platform = parsePlatform(url.searchParams.get('platform'));
      sendJson(res, 200, await fetchMultiPlatformOverview(platform));
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Analytics request failed'
    });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `${HOST}:${PORT}`;
    const url = new URL(req.url || '/', `http://${host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    const served = await serveStatic(url.pathname, res);
    if (!served) sendText(res, 404, 'Not found');
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Publish Analytics → http://${HOST}:${PORT}`);
  console.log(`API overview: http://${HOST}:${PORT}/api/analytics/overview?platform=all`);
  console.log(`Filter: ?platform=youtube|instagram|facebook|all`);
  console.log(`CLI: npm run analytics:channel | analytics:factory -- --platform instagram`);
});
