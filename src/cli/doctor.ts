#!/usr/bin/env node
/** Setup check for new installs: npm run doctor */
import '../lib/loadEnv.js';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { BRAND_IDS, getBrand } from '../lib/brands.js';
import { deskAuthConfigured } from '../lib/deskAuth.js';

type Level = 'ok' | 'info' | 'warn' | 'error';
const results: Array<{ level: Level; text: string }> = [];
const report = (level: Level, text: string) => results.push({ level, text });
const hasEnv = (...names: string[]) => names.some((name) => Boolean(process.env[name]?.trim()));
const onPath = (command: string) => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0;

const major = Number(process.versions.node.split('.')[0]);
report(major >= 20 ? 'ok' : 'error', `Node ${process.versions.node}${major >= 20 ? '' : ' — Node 20+ is required'}`);

for (const tool of ['ffmpeg', 'ffprobe']) {
  report(
    onPath(tool) ? 'ok' : 'error',
    onPath(tool) ? `${tool} found` : `${tool} not found — install ffmpeg (macOS: brew install ffmpeg · Ubuntu: apt install ffmpeg · Windows: winget install ffmpeg)`
  );
}

report(existsSync('.env') ? 'ok' : 'warn', existsSync('.env') ? '.env present' : '.env missing — run: cp .env.example .env');
report(
  existsSync('ui/dist/index.html') ? 'ok' : 'warn',
  existsSync('ui/dist/index.html') ? 'Desk UI is built' : 'Desk UI not built — run: npm run ui:build'
);

// Scripts need one LLM: a key, or a local Ollama.
const llmKeys = ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'NVIDIA_API_KEY'];
let ollama = false;
try {
  const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  ollama = (await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(1500) })).ok;
} catch {
  // not running
}
if (hasEnv(...llmKeys) || ollama) {
  report('ok', `Script writing: ${hasEnv(...llmKeys) ? 'API key set' : 'local Ollama running'}`);
} else {
  report('error', 'Script writing: no LLM. Set GOOGLE_AI_API_KEY (free tier works) or another key in .env, or run Ollama. (Or let Claude write scripts via MCP — see "Connect AI" in the Desk.)');
}

report(
  hasEnv('GOOGLE_AI_API_KEY', 'GEMINI_API_KEY') ? 'ok' : 'info',
  hasEnv('GOOGLE_AI_API_KEY', 'GEMINI_API_KEY')
    ? 'Images: Gemini'
    : 'Images: no Gemini key — the free Pollinations provider works, with lower quality'
);
report(
  hasEnv('ELEVENLABS_API_KEY', 'SARVAM_API_KEY') ? 'ok' : 'info',
  hasEnv('ELEVENLABS_API_KEY', 'SARVAM_API_KEY') ? 'Voice: premium provider key set' : 'Voice: free Edge TTS (no key). Add ELEVENLABS_API_KEY for better voices'
);

if (hasEnv('RUNWAY_API_KEY')) report('ok', 'Scene video: Runway (hosted, no GPU)');
else if (hasEnv('WAN_COMFY_SSH_HOST', 'COMFYUI_URL')) report('ok', 'Scene video: Wan via ComfyUI (self-hosted GPU)');
else report('info', 'Scene video: not configured — episodes render as pan/zoom stills. For motion, set RUNWAY_API_KEY (docs/video-providers.md)');

report(
  deskAuthConfigured() ? 'ok' : 'info',
  deskAuthConfigured() ? 'Desk login: password configured' : 'Desk login: a random password is generated and printed the first time you run npm run ui'
);

const pipelines = BRAND_IDS.map((id) => `${id} (${getBrand(id).kind})`).join(', ');
report('ok', `Pipelines: ${pipelines}  — add your own with: npm run pipeline:new`);

const vaultDir = path.resolve('data/connections');
const connected = existsSync(vaultDir) ? readdirSync(vaultDir).filter((f) => f.endsWith('.json')).length : 0;
report('info', connected ? `Publishing: ${connected} pipeline(s) have saved connections` : 'Publishing: no accounts connected yet — Desk → Publish (docs/publish-setup.md)');

const icon: Record<Level, string> = { ok: '[ok]  ', info: '[info]', warn: '[warn]', error: '[FAIL]' };
console.log('Shortforge doctor\n');
for (const { level, text } of results) console.log(`${icon[level]} ${text}`);
const errors = results.filter((r) => r.level === 'error').length;
console.log(errors ? `\n${errors} problem(s) to fix before you start.` : '\nReady. Start the studio with: npm run ui');
process.exit(errors ? 1 : 0);
