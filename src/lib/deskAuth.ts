/**
 * Desk operator login (single local operator). Session tokens are HMAC-signed.
 *
 * Credentials, in priority order:
 *   DESK_AUTH_PASSWORD_HASH  scrypt hash (`npm run desk:password` prints one)
 *   DESK_AUTH_PASSWORD       plain password in .env
 *   data/desk-auth.json      password hash generated on first start (printed once)
 * There is no default password. Optional DESK_AUTH_EMAIL locks the login email.
 * The session-signing secret is DESK_AUTH_SECRET or a random per-install value
 * stored (0600) in data/desk-auth.json.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export type DeskSessionUser = {
  email: string;
  name: string;
};

export type DeskSessionPayload = DeskSessionUser & {
  exp: number;
  nonce: string;
};

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

type DeskAuthFile = { secret?: string; passwordHash?: string };

function authFilePath(): string {
  return path.resolve(trimEnv('DESK_AUTH_FILE') || 'data/desk-auth.json');
}

function readAuthFile(): DeskAuthFile {
  try {
    const file = authFilePath();
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as DeskAuthFile) : {};
  } catch {
    return {};
  }
}

function writeAuthFile(value: DeskAuthFile): void {
  const file = authFilePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(file, 0o600);
}

function authSecret(): string {
  const fromEnv = trimEnv('DESK_AUTH_SECRET');
  if (fromEnv) return fromEnv;
  const stored = readAuthFile();
  if (stored.secret) return stored.secret;
  const secret = randomBytes(32).toString('hex');
  writeAuthFile({ ...stored, secret });
  return secret;
}

/** `scrypt$<salt hex>$<hash hex>` */
export function hashDeskPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function checkPassword(password: string): boolean | null {
  const hash = trimEnv('DESK_AUTH_PASSWORD_HASH');
  if (hash) return verifyPasswordHash(password, hash);
  const plain = trimEnv('DESK_AUTH_PASSWORD');
  if (plain) return safeEqual(password, plain);
  const stored = readAuthFile().passwordHash;
  if (stored) return verifyPasswordHash(password, stored);
  return null;
}

/**
 * First start with no configured credentials: create a random password, store only its
 * hash, and return the plaintext so the caller can print it once.
 */
export function bootstrapDeskPassword(): string | null {
  if (checkPassword('') !== null) return null;
  const password = randomBytes(12).toString('base64url');
  writeAuthFile({ ...readAuthFile(), passwordHash: hashDeskPassword(password) });
  return password;
}

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; first: number }>();

/** Returns seconds to wait if this client is locked out, else 0. */
export function loginLockoutSeconds(client: string, now = Date.now()): number {
  const entry = failures.get(client);
  if (!entry) return 0;
  if (now - entry.first > LOCKOUT_MS) {
    failures.delete(client);
    return 0;
  }
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.first + LOCKOUT_MS - now) / 1000) : 0;
}

export function recordLoginResult(client: string, ok: boolean, now = Date.now()): void {
  if (ok) {
    failures.delete(client);
    return;
  }
  const entry = failures.get(client);
  if (!entry || now - entry.first > LOCKOUT_MS) failures.set(client, { count: 1, first: now });
  else entry.count += 1;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

export function deskAuthConfigured(): boolean {
  return checkPassword('') !== null;
}

export function deskAuthStatus(): {
  configured: boolean;
  emailHint?: string;
  devFallback: boolean;
} {
  const email = trimEnv('DESK_AUTH_EMAIL');
  const configured = deskAuthConfigured();
  return {
    configured,
    ...(email ? { emailHint: email.replace(/(.{2}).+(@.+)/, '$1…$2') } : {}),
    // Kept for the UI; the shared default password no longer exists.
    devFallback: false
  };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authenticateDeskLogin(input: {
  email: string;
  password: string;
}): { ok: true; user: DeskSessionUser; devFallback: boolean } | { ok: false; error: string } {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  if (!password) {
    return { ok: false, error: 'Password is required.' };
  }

  const expectedEmail = trimEnv('DESK_AUTH_EMAIL')?.toLowerCase();
  const passwordOk = checkPassword(password);
  if (passwordOk === null) {
    return {
      ok: false,
      error: 'No Desk password is set. Restart the server to generate one, or set DESK_AUTH_PASSWORD.'
    };
  }
  const emailOk = !expectedEmail || safeEqual(email, expectedEmail);
  if (!passwordOk || !emailOk) return { ok: false, error: 'Invalid email or password.' };

  return {
    ok: true,
    devFallback: false,
    user: {
      email: expectedEmail || email,
      name: (expectedEmail || email).split('@')[0] || 'Operator'
    }
  };
}

export function signDeskSession(user: DeskSessionUser): string {
  const payload: DeskSessionPayload = {
    email: user.email,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: randomBytes(8).toString('hex')
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', authSecret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyDeskSession(token: string | null | undefined): DeskSessionUser | null {
  if (!token?.trim()) return null;
  const [body, sigPart] = token.trim().split('.');
  if (!body || !sigPart) return null;
  try {
    const expected = createHmac('sha256', authSecret()).update(body).digest();
    const actual = fromB64url(sigPart);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as DeskSessionPayload;
    if (!payload.email || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: payload.email, name: payload.name || payload.email.split('@')[0] || 'Operator' };
  } catch {
    return null;
  }
}
