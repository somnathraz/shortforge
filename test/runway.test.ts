import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {
  estimateRunwayCostUsd,
  generateRunwayClip,
  runwayClipSeconds
} from '../src/providers/runway.js';
import { RunwayVideoProvider, defaultVideoProviderName, resolveVideoProvider } from '../src/providers/videoGeneration.js';

const ENV = [
  'RUNWAY_API_KEY', 'RUNWAY_VIDEO_MODEL', 'RUNWAY_DURATIONS', 'RUNWAY_POLL_MS', 'RUNWAY_RATIO',
  'VIDEO_PROVIDER', 'AI_VIDEO_PROVIDER', 'WAN_COMFY_SSH_HOST', 'COMFYUI_URL'
] as const;

async function withEnv<T>(values: Partial<Record<(typeof ENV)[number], string>>, run: () => Promise<T> | T): Promise<T> {
  const before = Object.fromEntries(ENV.map((name) => [name, process.env[name]]));
  try {
    for (const name of ENV) delete process.env[name];
    Object.assign(process.env, values);
    return await run();
  } finally {
    for (const name of ENV) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
}

test('clip length rounds narration up and snaps to what the model allows', async () => {
  await withEnv({}, () => {
    assert.equal(runwayClipSeconds(4.2), 5); // gen4_turbo: any 2–10
    assert.equal(runwayClipSeconds(0.4), 2);
    assert.equal(runwayClipSeconds(14), 10);
    assert.equal(runwayClipSeconds(6.1, 'gen4.5'), 10); // other models: 5 or 10
    assert.equal(runwayClipSeconds(3, 'gen4.5'), 5);
  });
  await withEnv({ RUNWAY_DURATIONS: '4,6,8' }, () => {
    assert.equal(runwayClipSeconds(5), 6);
    assert.equal(runwayClipSeconds(30), 8);
  });
});

test('cost estimate uses official credits/sec at $0.01 per credit', () => {
  assert.equal(estimateRunwayCostUsd(5, 'gen4_turbo'), 0.25);
  assert.equal(estimateRunwayCostUsd(10, 'gen4.5'), 1.2);
  assert.equal(estimateRunwayCostUsd(5, 'some-new-model'), undefined);
});

test('Runway is the default only when keyed and no GPU host is configured', async () => {
  await withEnv({ RUNWAY_API_KEY: 'k' }, () => assert.equal(defaultVideoProviderName(), 'runway'));
  await withEnv({ RUNWAY_API_KEY: 'k', WAN_COMFY_SSH_HOST: 'gpu.example' }, () =>
    assert.equal(defaultVideoProviderName(), 'wan-comfyui'));
  await withEnv({}, () => assert.equal(defaultVideoProviderName(), 'wan-comfyui'));
  await withEnv({ RUNWAY_API_KEY: 'k', VIDEO_PROVIDER: 'wan' }, () => assert.equal(defaultVideoProviderName(), 'wan'));
  assert.ok(resolveVideoProvider('runway') instanceof RunwayVideoProvider);
});

test('generate: POST → poll until SUCCEEDED → download, with the documented request shape', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'runway-'));
  const image = path.join(dir, 'still.png');
  await sharp({ create: { width: 640, height: 1136, channels: 3, background: '#335' } }).png().toFile(image);

  const calls: Array<{ url: string; method: string; body?: Record<string, unknown>; headers: Record<string, string> }> = [];
  let polls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    calls.push({
      url, method,
      headers: (init?.headers || {}) as Record<string, string>,
      ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {})
    });
    if (url.endsWith('/image_to_video')) return Response.json({ id: 'task-1' });
    if (url.endsWith('/tasks/task-1')) {
      polls += 1;
      return Response.json(
        polls < 2 ? { id: 'task-1', status: 'RUNNING', progress: 0.5 }
          : { id: 'task-1', status: 'SUCCEEDED', output: ['https://cdn.example/out.mp4'] }
      );
    }
    if (url === 'https://cdn.example/out.mp4') return new Response(new Uint8Array([1, 2, 3, 4]));
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const out = path.join(dir, 'clips', 'scene-1.mp4');
    const progress: number[] = [];
    const queued: string[] = [];
    await withEnv({ RUNWAY_API_KEY: 'test-key', RUNWAY_POLL_MS: '1' }, async () => {
      const result = await generateRunwayClip({
        imagePath: image,
        prompt: 'slow push-in, the lamp flickers',
        outputPath: out,
        durationSeconds: 4.2,
        onQueued: ({ taskId }) => void queued.push(taskId),
        onProgress: ({ percent }) => void progress.push(percent)
      });
      assert.equal(result, out);
    });
    assert.deepEqual([...(await readFile(out))], [1, 2, 3, 4]);
    assert.deepEqual(queued, ['task-1']);
    assert.deepEqual(progress, [50]);

    const post = calls.find((call) => call.method === 'POST')!;
    assert.equal(post.url, 'https://api.dev.runwayml.com/v1/image_to_video');
    assert.equal(post.headers.Authorization, 'Bearer test-key');
    assert.equal(post.headers['X-Runway-Version'], '2024-11-06');
    assert.equal(post.body!.model, 'gen4_turbo');
    assert.equal(post.body!.ratio, '720:1280');
    assert.equal(post.body!.duration, 5);
    assert.equal(post.body!.promptText, 'slow push-in, the lamp flickers');
    assert.match(String(post.body!.promptImage), /^data:image\/jpeg;base64,/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('errors are readable: bad key, no credits, failed task', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'runway-'));
  const image = path.join(dir, 'still.png');
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#fff' } }).png().toFile(image);
  const realFetch = globalThis.fetch;
  const run = (reply: () => Response) => {
    globalThis.fetch = (async () => reply()) as typeof fetch;
    return withEnv({ RUNWAY_API_KEY: 'k', RUNWAY_POLL_MS: '1' }, () =>
      generateRunwayClip({ imagePath: image, prompt: 'x', outputPath: path.join(dir, 'o.mp4') }));
  };
  try {
    await assert.rejects(run(() => Response.json({ error: 'nope' }, { status: 401 })), /rejected the API key/);
    await assert.rejects(run(() => Response.json({ error: 'You do not have enough credits' }, { status: 400 })), /out of credits/);
    let step = 0;
    globalThis.fetch = (async () =>
      ++step === 1 ? Response.json({ id: 't' }) : Response.json({ id: 't', status: 'FAILED', failure: 'content moderation' })) as typeof fetch;
    await assert.rejects(
      withEnv({ RUNWAY_API_KEY: 'k', RUNWAY_POLL_MS: '1' }, () =>
        generateRunwayClip({ imagePath: image, prompt: 'x', outputPath: path.join(dir, 'o.mp4') })),
      /failed: content moderation/
    );
    await assert.rejects(
      withEnv({}, () => generateRunwayClip({ imagePath: image, prompt: 'x', outputPath: path.join(dir, 'o.mp4') })),
      /RUNWAY_API_KEY is not set/
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
