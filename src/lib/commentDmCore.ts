import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CommentDmConfig } from './brands.js';

export type IncomingComment = {
  platform: 'instagram' | 'facebook';
  /** IG business user id or Facebook Page id that owns the media. */
  accountId: string;
  commentId: string;
  text: string;
  fromId?: string | undefined;
  fromName?: string | undefined;
};

export function commentMatches(config: CommentDmConfig, text: string): boolean {
  if (!config.enabled) return false;
  if (!config.keywords.length) return true;
  const lower = text.toLowerCase();
  return config.keywords.some((k) => k.trim() && lower.includes(k.trim().toLowerCase()));
}

/** Returns null when no link has a url yet (never DM an empty message). */
export function buildDmText(config: CommentDmConfig, name?: string): string | null {
  const links = config.links.filter((l) => l.url.trim());
  if (!links.length) return null;
  const head = config.message.replace(/\{name\}/g, name?.trim() || 'there').trim();
  return [head, ...links.map((l) => `${l.label}: ${l.url.trim()}`)].join('\n');
}

/** Meta signs the raw body: `X-Hub-Signature-256: sha256=<hmac>` with the app secret. */
export function verifyMetaSignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Flatten an Instagram `comments` or Facebook `feed` webhook payload into comments. */
export function parseCommentWebhook(body: unknown): IncomingComment[] {
  const out: IncomingComment[] = [];
  const root = body as { object?: string; entry?: unknown[] };
  if (!root || !Array.isArray(root.entry)) return out;
  for (const raw of root.entry) {
    const entry = raw as { id?: string; changes?: { field?: string; value?: any }[] };
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      if (root.object === 'instagram' && change.field === 'comments' && v.id && entry.id) {
        out.push({
          platform: 'instagram',
          accountId: String(entry.id),
          commentId: String(v.id),
          text: String(v.text ?? ''),
          fromId: v.from?.id ? String(v.from.id) : undefined,
          fromName: v.from?.username
        });
      } else if (
        root.object === 'page' &&
        change.field === 'feed' &&
        v.item === 'comment' &&
        v.verb === 'add' &&
        v.comment_id &&
        entry.id
      ) {
        out.push({
          platform: 'facebook',
          accountId: String(entry.id),
          commentId: String(v.comment_id),
          text: String(v.message ?? ''),
          fromId: v.from?.id ? String(v.from.id) : undefined,
          fromName: v.from?.name
        });
      }
    }
  }
  return out;
}

