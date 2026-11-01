/**
 * Vercel function: Instagram comment → DM private reply.
 * Stateless — secrets come from Vercel env vars, links from config/brands/tech-instagram.json.
 * Env: META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET, INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID,
 *      optional INSTAGRAM_API_BASE (default https://graph.instagram.com; use https://graph.facebook.com for Page-token login).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import brand from '../config/brands/tech-instagram.json' with { type: 'json' };
import {
  buildDmText,
  commentMatches,
  parseCommentWebhook,
  verifyMetaSignature
} from '../src/lib/commentDmCore.js';

async function rawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

function reply(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET') {
    const ok =
      process.env.META_WEBHOOK_VERIFY_TOKEN &&
      url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === process.env.META_WEBHOOK_VERIFY_TOKEN;
    return reply(res, ok ? 200 : 403, ok ? url.searchParams.get('hub.challenge') || '' : 'Forbidden');
  }
  if (req.method !== 'POST') return reply(res, 405, 'Method not allowed');

  const secret = process.env.META_APP_SECRET;
  const raw = await rawBody(req);
  if (!secret || !verifyMetaSignature(raw, req.headers['x-hub-signature-256'] as string | undefined, secret)) {
    return reply(res, 403, 'Bad signature');
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_USER_ID;
  const config = brand.commentDm;
  if (!token || !igUserId || !config) return reply(res, 200, 'not configured');
  const base = (process.env.INSTAGRAM_API_BASE || 'https://graph.instagram.com').replace(/\/$/, '');
  const version = process.env.META_GRAPH_VERSION || 'v21.0';

  // Serverless freezes after the response, so finish the DMs before replying (Meta allows a few seconds).
  for (const c of parseCommentWebhook(JSON.parse(raw.toString('utf8')))) {
    if (c.platform !== 'instagram' || c.accountId !== igUserId || c.fromId === igUserId) continue;
    if (!commentMatches(config, c.text)) continue;
    const text = buildDmText(config, c.fromName);
    if (!text) continue;
    const r = await fetch(`${base}/${version}/${igUserId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipient: { comment_id: c.commentId }, message: { text } })
    });
    // Duplicate retries from Meta get rejected by Meta itself (one private reply per comment).
    if (!r.ok) console.error(`[comment-dm] ${c.commentId}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  reply(res, 200, 'ok');
}
