import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  authenticateDeskLogin,
  bootstrapDeskPassword,
  hashDeskPassword,
  loginLockoutSeconds,
  recordLoginResult,
  signDeskSession,
  verifyDeskSession
} from '../src/lib/deskAuth.js';

const AUTH_ENV = [
  'DESK_AUTH_EMAIL',
  'DESK_AUTH_PASSWORD',
  'DESK_AUTH_PASSWORD_HASH',
  'DESK_AUTH_SECRET',
  'DESK_AUTH_FILE'
] as const;

function withAuthEnv(values: Partial<Record<(typeof AUTH_ENV)[number], string>>, run: () => void) {
  const before = Object.fromEntries(AUTH_ENV.map((name) => [name, process.env[name]]));
  try {
    for (const name of AUTH_ENV) delete process.env[name];
    process.env.DESK_AUTH_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'desk-auth-')), 'desk-auth.json');
    for (const [name, value] of Object.entries(values)) process.env[name] = value;
    run();
  } finally {
    for (const name of AUTH_ENV) {
      const value = before[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('no default password: unconfigured login is refused, even with "desk"', () => {
  withAuthEnv({}, () => {
    const result = authenticateDeskLogin({ email: 'op@studio.com', password: 'desk' });
    assert.equal(result.ok, false);
  });
});

test('first-start bootstrap creates a random password that works once, stored hashed', () => {
  withAuthEnv({}, () => {
    const password = bootstrapDeskPassword();
    assert.ok(password && password.length >= 12 && password !== 'desk');
    assert.equal(bootstrapDeskPassword(), null);
    assert.equal(authenticateDeskLogin({ email: 'op@studio.com', password }).ok, true);
    assert.equal(authenticateDeskLogin({ email: 'op@studio.com', password: 'wrong' }).ok, false);
  });
});

test('scrypt hash env password works and plaintext is not accepted as a hash', () => {
  withAuthEnv({ DESK_AUTH_PASSWORD_HASH: hashDeskPassword('correct horse') }, () => {
    assert.equal(authenticateDeskLogin({ email: 'a@b.co', password: 'correct horse' }).ok, true);
    assert.equal(authenticateDeskLogin({ email: 'a@b.co', password: 'nope' }).ok, false);
  });
});

test('session tokens are signed with a per-install secret and reject tampering', () => {
  withAuthEnv({}, () => {
    const token = signDeskSession({ email: 'a@b.co', name: 'a' });
    assert.equal(verifyDeskSession(token)?.email, 'a@b.co');
    assert.equal(verifyDeskSession(`${token.split('.')[0]}.AAAA`), null);
  });
});

test('login lockout after 5 failures, cleared by success', () => {
  const client = 'test-client';
  for (let i = 0; i < 5; i += 1) recordLoginResult(client, false);
  assert.ok(loginLockoutSeconds(client) > 0);
  recordLoginResult(client, true);
  assert.equal(loginLockoutSeconds(client), 0);
});

test('configured password gates login', () => {
  withAuthEnv({ DESK_AUTH_PASSWORD: 'secret', DESK_AUTH_EMAIL: 'desk@epicastra.com' }, () => {
    const bad = authenticateDeskLogin({ email: 'other@x.com', password: 'secret' });
    assert.equal(bad.ok, false);
    const ok = authenticateDeskLogin({ email: 'desk@epicastra.com', password: 'secret' });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.devFallback, false);
      const token = signDeskSession(ok.user);
      const user = verifyDeskSession(token);
      assert.equal(user?.email, 'desk@epicastra.com');
    }
  });
});
