import { type BrandId } from '../lib/brands.js';
import { resolveFacebookCredentials, resolveInstagramCredentials } from './metaUpload.js';
import type { IncomingComment } from '../lib/commentDm.js';

/** Private reply: one DM to the author of a comment, within 7 days of the comment. */
export async function sendPrivateReply(
  brandId: BrandId,
  comment: IncomingComment,
  text: string
): Promise<void> {
  let url: string;
  let token: string;
  if (comment.platform === 'instagram') {
    const creds = resolveInstagramCredentials(brandId);
    if (!creds) throw new Error(`Instagram not connected for ${brandId}`);
    url = `${creds.graphBase}/${creds.userId}/messages`;
    token = creds.token;
  } else {
    const creds = resolveFacebookCredentials(brandId);
    if (!creds) throw new Error(`Facebook not connected for ${brandId}`);
    const version = process.env.META_GRAPH_VERSION?.trim() || 'v21.0';
    url = `https://graph.facebook.com/${version}/${creds.pageId}/messages`;
    token = creds.token;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { comment_id: comment.commentId }, message: { text } })
  });
  if (!res.ok) throw new Error(`Private reply failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
}
