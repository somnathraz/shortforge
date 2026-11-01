import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PackagingLanguageSchema } from '../src/schema/packaging.js';
import { runWithBrand } from '../src/lib/brands.js';
import {
  persistInstagramVaultTokens,
  persistYoutubeVaultTokens,
  signInstagramOAuthState,
  verifyInstagramOAuthState
} from '../src/lib/publishConnections.js';
import { publishConnectionSetup } from '../src/ui-server/connections.js';
import { resolveYoutubeCredentials } from '../src/providers/youtubeUpload.js';

const CONNECTION_ENV = [
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
  'META_ACCESS_TOKEN',
  'FACEBOOK_PAGE_ACCESS_TOKEN',
  'FACEBOOK_PAGE_ID',
  'INSTAGRAM_BUSINESS_ACCOUNT_ID',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_USER_ID',
  'INSTAGRAM_API_BASE',
  'INSTAGRAM_APP_ID',
  'INSTAGRAM_APP_SECRET',
  'MF_CONNECTIONS_DIR'
] as const;

function withConnectionEnv(
  values: Partial<Record<(typeof CONNECTION_ENV)[number], string>>,
  run: () => void
) {
  const before = Object.fromEntries(CONNECTION_ENV.map((name) => [name, process.env[name]]));
  const tempDir = mkdtempSync(path.join(tmpdir(), 'mf-connections-'));
  try {
    for (const name of CONNECTION_ENV) delete process.env[name];
    process.env.MF_CONNECTIONS_DIR = tempDir;
    for (const [name, value] of Object.entries(values)) process.env[name] = value;
    run();
  } finally {
    for (const name of CONNECTION_ENV) {
      const value = before[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('delivery pack accepts Hindi and English only', () => {
  assert.equal(PackagingLanguageSchema.parse('hi'), 'hi');
  assert.equal(PackagingLanguageSchema.parse('en'), 'en');
  assert.throws(() => PackagingLanguageSchema.parse('fr'));
});

test('connection setup reports missing env instead of a publish success', () => {
  withConnectionEnv({}, () => {
    const connections = publishConnectionSetup('epicastra');
    assert.equal(connections.length, 3);
    assert.ok(connections.every((connection) => connection.state === 'setup_required'));
    assert.match(connections[0]!.message, /Missing YOUTUBE_CLIENT_ID/);
    assert.match(connections[1]!.message, /INSTAGRAM_/);
    assert.match(connections[2]!.message, /FACEBOOK_PAGE_ID|Page token/);
  });
});

test('tech pipeline lists YouTube, Instagram, and Facebook connections', () => {
  withConnectionEnv({}, () => {
    const connections = runWithBrand('tech-instagram', () =>
      publishConnectionSetup('tech-instagram')
    );
    assert.deepEqual(
      connections.map((item) => item.platform),
      ['youtube', 'instagram', 'facebook']
    );
    assert.ok(connections.every((item) => item.brandId === 'tech-instagram'));
  });
});

test('configured accounts remain unchecked until the explicit connection test', () => {
  withConnectionEnv(
    {
      YOUTUBE_CLIENT_ID: 'client',
      YOUTUBE_CLIENT_SECRET: 'secret',
      YOUTUBE_REFRESH_TOKEN: 'refresh',
      META_ACCESS_TOKEN: 'token',
      FACEBOOK_PAGE_ID: 'page',
      INSTAGRAM_BUSINESS_ACCOUNT_ID: 'instagram'
    },
    () => {
      const connections = publishConnectionSetup('epicastra');
      assert.ok(connections.every((connection) => connection.state === 'unchecked'));
      assert.ok(connections.every((connection) => connection.missing.length === 0));
    }
  );
});

test('Instagram Login env marks Instagram as configured without Meta Page token', () => {
  withConnectionEnv(
    {
      INSTAGRAM_ACCESS_TOKEN: 'ig-token',
      INSTAGRAM_USER_ID: '17841400000000000',
      INSTAGRAM_API_BASE: 'https://graph.instagram.com'
    },
    () => {
      const connections = publishConnectionSetup('epicastra');
      const instagram = connections.find((item) => item.platform === 'instagram');
      assert.equal(instagram?.state, 'unchecked');
      assert.deepEqual(instagram?.missing, []);
      const facebook = connections.find((item) => item.platform === 'facebook');
      assert.equal(facebook?.state, 'setup_required');
    }
  );
});

test('tech pipeline does not inherit EpicAstra env tokens', () => {
  withConnectionEnv(
    {
      INSTAGRAM_APP_ID: 'app',
      INSTAGRAM_APP_SECRET: 'secret',
      INSTAGRAM_ACCESS_TOKEN: 'epic-ig-token',
      INSTAGRAM_USER_ID: '111',
      META_ACCESS_TOKEN: 'epic-page-token',
      FACEBOOK_PAGE_ID: 'epic-page',
      YOUTUBE_CLIENT_ID: 'client',
      YOUTUBE_CLIENT_SECRET: 'secret',
      YOUTUBE_REFRESH_TOKEN: 'epic-yt'
    },
    () => {
      const connections = runWithBrand('tech-instagram', () =>
        publishConnectionSetup('tech-instagram')
      );
      const ig = connections.find((item) => item.platform === 'instagram');
      const fb = connections.find((item) => item.platform === 'facebook');
      const yt = connections.find((item) => item.platform === 'youtube');
      assert.equal(ig?.state, 'setup_required');
      assert.equal(fb?.state, 'setup_required');
      assert.equal(yt?.state, 'setup_required');
      assert.match(ig?.message || '', /Authorize Instagram/);
      assert.match(yt?.message || '', /Authorize YouTube/);
    }
  );
});

test('per-brand Instagram vault does not leak across pipelines', () => {
  withConnectionEnv(
    {
      INSTAGRAM_APP_ID: 'app',
      INSTAGRAM_APP_SECRET: 'secret'
    },
    () => {
      persistInstagramVaultTokens({
        brandId: 'epicastra',
        accessToken: 'token-a',
        userId: '111',
        accountName: 'myth'
      });
      persistInstagramVaultTokens({
        brandId: 'tech-instagram',
        accessToken: 'token-b',
        userId: '222',
        accountName: 'tech'
      });

      const epic = publishConnectionSetup('epicastra').find((item) => item.platform === 'instagram');
      const tech = publishConnectionSetup('tech-instagram').find(
        (item) => item.platform === 'instagram'
      );
      assert.equal(epic?.accountName, 'myth');
      assert.equal(tech?.accountName, 'tech');
      assert.equal(epic?.state, 'unchecked');
      assert.equal(tech?.state, 'unchecked');
    }
  );
});

test('Instagram OAuth state is brand-bound and verified', () => {
  withConnectionEnv({ INSTAGRAM_APP_SECRET: 'test-secret' }, () => {
    const state = signInstagramOAuthState({ brandId: 'tech-instagram' });
    const parsed = verifyInstagramOAuthState(state);
    assert.equal(parsed.brandId, 'tech-instagram');
    assert.throws(() => verifyInstagramOAuthState('not-valid'));
  });
});

test('per-brand YouTube vault does not leak across pipelines', () => {
  withConnectionEnv(
    {
      YOUTUBE_CLIENT_ID: 'client',
      YOUTUBE_CLIENT_SECRET: 'secret'
    },
    () => {
      persistYoutubeVaultTokens({
        brandId: 'epicastra',
        refreshToken: 'refresh-epic',
        accountName: 'EpicAstra'
      });
      persistYoutubeVaultTokens({
        brandId: 'tech-instagram',
        refreshToken: 'refresh-tech',
        accountName: 'Tech Reels'
      });

      const epic = resolveYoutubeCredentials('epicastra');
      const tech = resolveYoutubeCredentials('tech-instagram');
      assert.equal(epic?.refreshToken, 'refresh-epic');
      assert.equal(tech?.refreshToken, 'refresh-tech');
      assert.equal(epic?.accountName, 'EpicAstra');
      assert.equal(tech?.accountName, 'Tech Reels');

      const epicConn = publishConnectionSetup('epicastra').find((item) => item.platform === 'youtube');
      const techConn = publishConnectionSetup('tech-instagram').find(
        (item) => item.platform === 'youtube'
      );
      assert.equal(epicConn?.accountName, 'EpicAstra');
      assert.equal(techConn?.accountName, 'Tech Reels');
      assert.equal(epicConn?.state, 'unchecked');
      assert.equal(techConn?.state, 'unchecked');
    }
  );
});
