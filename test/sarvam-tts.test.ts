import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkSarvamText } from '../src/providers/sarvamTts.js';

test('chunkSarvamText keeps short text as one chunk', () => {
  assert.deepEqual(chunkSarvamText('जिस रात कृष्ण का जन्म हुआ।'), ['जिस रात कृष्ण का जन्म हुआ।']);
});

test('chunkSarvamText splits long Hindi on sentence boundaries', () => {
  const sentence = 'यह एक लंबी पंक्ति है जो बार बार दोहराई जाती है। ';
  const text = sentence.repeat(80);
  assert.ok(text.length > 2400);
  const chunks = chunkSarvamText(text, 2400);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 2400));
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim().length > 0, true);
});
