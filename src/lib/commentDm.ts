import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type BrandId, type CommentDmConfig, BRAND_IDS, getBrand } from './brands.js';
import { getFacebookVaultEntry, getInstagramVaultEntry } from './publishConnections.js';

export * from './commentDmCore.js';
import type { IncomingComment } from './commentDmCore.js';

/** Which pipeline owns this IG user / Page id (matched against the connection vault). */
export function brandForAccount(platform: 'instagram' | 'facebook', accountId: string): BrandId | null {
  for (const id of BRAND_IDS) {
    const entry = platform === 'instagram' ? getInstagramVaultEntry(id) : getFacebookVaultEntry(id);
    const own = platform === 'instagram' ? (entry as any)?.userId : (entry as any)?.pageId;
    if (own && String(own) === accountId) return id;
  }
  return null;
}

export function commentDmConfig(brandId: BrandId): CommentDmConfig | undefined {
  return getBrand(brandId).commentDm;
}

function logFile(brandId: BrandId): string {
  return path.join(process.cwd(), 'data', 'dm-log', `${brandId}.json`);
}

/** Meta allows one private reply per comment; remember what we answered. */
export function hasReplied(brandId: BrandId, commentId: string): boolean {
  const file = logFile(brandId);
  if (!existsSync(file)) return false;
  try {
    return (JSON.parse(readFileSync(file, 'utf8')) as string[]).includes(commentId);
  } catch {
    return false;
  }
}

export function markReplied(brandId: BrandId, commentId: string): void {
  const file = logFile(brandId);
  mkdirSync(path.dirname(file), { recursive: true });
  let ids: string[] = [];
  try {
    if (existsSync(file)) ids = JSON.parse(readFileSync(file, 'utf8')) as string[];
  } catch {
    ids = [];
  }
  ids.push(commentId);
  writeFileSync(file, JSON.stringify(ids.slice(-5000)));
}
