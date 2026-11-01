import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  buildDmText,
  commentMatches,
  parseCommentWebhook,
  verifyMetaSignature
} from '../src/lib/commentDmCore.js';

const config = {
  enabled: true,
  keywords: ['repo', 'link'],
  message: 'Hey {name}!',
  links: [
    { label: 'Website', url: 'https://example.com' },
    { label: 'GitHub repo', url: 'https://github.com/x/y' }
  ]
};

test('keyword matching is case-insensitive; empty keywords match all', () => {
  assert.equal(commentMatches(config, 'Send the REPO pls'), true);
  assert.equal(commentMatches(config, 'nice video'), false);
  assert.equal(commentMatches({ ...config, keywords: [] }, 'nice video'), true);
  assert.equal(commentMatches({ ...config, enabled: false }, 'repo'), false);
});

test('dm text includes both links and skips empty urls', () => {
  assert.equal(buildDmText(config, 'sam'), 'Hey sam!\nWebsite: https://example.com\nGitHub repo: https://github.com/x/y');
  assert.equal(buildDmText({ ...config, links: [{ label: 'Website', url: '' }] }), null);
});

test('parses instagram comment webhook', () => {
  const out = parseCommentWebhook({
    object: 'instagram',
    entry: [{ id: '123', changes: [{ field: 'comments', value: { id: 'c1', text: 'repo?', from: { id: '9', username: 'sam' } } }] }]
  });
  assert.deepEqual(out.map((c) => [c.platform, c.accountId, c.commentId, c.fromName]), [['instagram', '123', 'c1', 'sam']]);
});

test('verifies meta signature', () => {
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.equal(verifyMetaSignature(body, sig, 's3cret'), true);
  assert.equal(verifyMetaSignature(body, sig, 'wrong'), false);
  assert.equal(verifyMetaSignature(body, undefined, 's3cret'), false);
});
