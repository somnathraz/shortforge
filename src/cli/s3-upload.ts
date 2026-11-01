#!/usr/bin/env node
/**
 * Upload a local MP4 to S3/R2 for Instagram Reels (public HTTPS URL).
 *
 * Usage:
 *   npm run publish:s3-upload -- --video output/final/episode.mp4 --episode yogmaya-krishna-birth-swap-001
 *   npm run publish:s3-upload -- --video path.mp4 --episode my-id --key short.mp4
 */
import '../lib/loadEnv.js';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { uploadPublicMp4 } from '../lib/s3PublishMedia.js';

const args = process.argv.slice(2);

function valueFor(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const videoRaw = valueFor('--video');
  if (!videoRaw) {
    throw new Error(
      'Usage: npm run publish:s3-upload -- --video <path.mp4> [--episode <episodeId>] [--key short.mp4]'
    );
  }
  const videoPath = path.resolve(videoRaw);
  await access(videoPath);
  const key = valueFor('--key');
  const episodeId = valueFor('--episode');
  const force = args.includes('--force');
  const uploaded = await uploadPublicMp4({
    localPath: videoPath,
    force,
    ...(key ? { key } : {}),
    ...(episodeId ? { episodeId } : {})
  });
  console.log(
    uploaded.reused
      ? `Reused existing s3://${uploaded.bucket}/${uploaded.key}`
      : `Uploaded s3://${uploaded.bucket}/${uploaded.key}`
  );
  if (uploaded.episodeId) console.log(`Episode folder: ${uploaded.episodeId}`);
  console.log(`Public URL:\n${uploaded.url}`);
  console.log('\nFor a one-shot Instagram publish, you can set:');
  console.log(`PUBLISH_VIDEO_PUBLIC_URL=${uploaded.url}`);
  console.log('(Or leave unset — publish will auto-upload under reels/<episodeId>/short.mp4.)');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
