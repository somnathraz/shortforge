/**
 * Everything the Desk's "Connect AI" card needs: copy-paste config for each AI app, which
 * providers are configured, and a real end-to-end check that spawns the MCP server.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './paths.js';

export const MCP_SERVER_NAME = 'mythology-factory';

export type McpClientSetup = {
  id: 'claude-code' | 'claude-desktop' | 'cursor' | 'other';
  label: string;
  /** Where the snippet goes (or "terminal"). */
  location: string;
  kind: 'command' | 'json';
  text: string;
  steps: string[];
};

export type McpTool = { name: string; title?: string; description?: string };

/** Launch line that works from apps with no working-directory setting (Claude Desktop, Cursor). */
function launcher(): { command: string; args: string[] } {
  const node = process.execPath;
  if (process.platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', `cd /d "${ROOT}" && "${node}" --import tsx src\\mcp\\server.ts`]
    };
  }
  return {
    command: '/bin/sh',
    args: ['-c', `cd "${ROOT}" && "${node}" --import tsx src/mcp/server.ts`]
  };
}

function jsonConfig(): string {
  const { command, args } = launcher();
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { command, args } } }, null, 2);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function mcpClientSetups(): McpClientSetup[] {
  const { command, args } = launcher();
  const home = os.homedir();
  const desktopConfig =
    process.platform === 'darwin'
      ? path.join(home, 'Library/Application Support/Claude/claude_desktop_config.json')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA || home, 'Claude', 'claude_desktop_config.json')
        : path.join(home, '.config/Claude/claude_desktop_config.json');

  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      location: 'terminal',
      kind: 'command',
      text: `claude mcp add ${MCP_SERVER_NAME} -- ${[command, ...args].map(shellQuote).join(' ')}`,
      steps: [
        'Run this once in any terminal.',
        'Or just open this project folder in Claude Code: it finds .mcp.json and asks you to approve the server.',
        'Type /mcp in Claude Code to confirm it says connected.'
      ]
    },
    {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      location: desktopConfig,
      kind: 'json',
      text: jsonConfig(),
      steps: [
        'Claude Desktop → Settings → Developer → Edit Config.',
        'Merge this into the file (keep any servers you already have).',
        'Quit and reopen Claude Desktop; the tools appear under the plug icon in the chat box.'
      ]
    },
    {
      id: 'cursor',
      label: 'Cursor',
      location: path.join(home, '.cursor/mcp.json'),
      kind: 'json',
      text: jsonConfig(),
      steps: [
        'Cursor → Settings → MCP → Add new MCP server (or edit the file).',
        'Paste this, save, and switch the server on.'
      ]
    },
    {
      id: 'other',
      label: 'Any other app',
      location: 'the app\'s MCP settings',
      kind: 'json',
      text: jsonConfig(),
      steps: [
        'Any MCP client that supports local (stdio) servers works.',
        'Command and arguments are in the JSON above; nothing else is needed.'
      ]
    }
  ];
}

const KEYS: Array<{ id: string; label: string; env: string[]; powers: string }> = [
  { id: 'gemini', label: 'Gemini', env: ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'], powers: 'scene images, script drafts' },
  { id: 'runway', label: 'Runway', env: ['RUNWAY_API_KEY'], powers: 'scene video (no GPU)' },
  { id: 'elevenlabs', label: 'ElevenLabs', env: ['ELEVENLABS_API_KEY'], powers: 'voice, sound effects' },
  { id: 'openrouter', label: 'OpenRouter / Groq / OpenAI', env: ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY'], powers: 'script drafts, titles' }
];

/** Which provider keys are present (booleans only — never the values). */
export function providerReadiness() {
  return KEYS.map((key) => ({
    id: key.id,
    label: key.label,
    powers: key.powers,
    configured: key.env.some((name) => Boolean(process.env[name]?.trim()))
  }));
}

export const MCP_EXAMPLE_PROMPTS = [
  'List my pipelines and episodes, then write a new 45-second script about <topic> and save it as a draft.',
  'Show the image prompts for my latest episode and tighten any that are vague.',
  'Check that my Instagram and YouTube connections are healthy.',
  'Do a dry-run publish of my newest episode to Instagram and tell me what would be posted.',
  'How did my last five posts perform? Summarise views, likes and comments by platform.'
];

/** Spawns the real MCP server and lists its tools over stdio — proves the setup works. */
export function testMcpServer(timeoutMs = 25_000): Promise<{ ok: boolean; tools: McpTool[]; error?: string; ms: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/mcp/server.ts'], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let buffer = '';
    let stderr = '';
    let settled = false;
    const finish = (result: { ok: boolean; tools: McpTool[]; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve({ ...result, ms: Date.now() - started });
    };
    const timer = setTimeout(
      () => finish({ ok: false, tools: [], error: `MCP server did not answer within ${timeoutMs / 1000}s. ${stderr.slice(-300)}` }),
      timeoutMs
    );
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => finish({ ok: false, tools: [], error: error.message }));
    child.on('exit', (code) => finish({ ok: false, tools: [], error: `MCP server exited (${code}). ${stderr.slice(-300)}` }));
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line) as { id?: number; result?: { tools?: McpTool[] } };
          if (message.id === 1) {
            send({ jsonrpc: '2.0', method: 'notifications/initialized' });
            send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
          } else if (message.id === 2) {
            const tools = (message.result?.tools || []).map((tool) => ({
              name: tool.name,
              ...(tool.title ? { title: tool.title } : {}),
              ...(tool.description ? { description: tool.description } : {})
            }));
            finish({ ok: tools.length > 0, tools, ...(tools.length ? {} : { error: 'Server started but exposes no tools' }) });
          }
        } catch {
          // ignore non-JSON noise
        }
      }
    });
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'desk-connect-check', version: '1' } }
    });
  });
}
