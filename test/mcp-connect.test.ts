import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { mcpClientSetups, testMcpServer } from '../src/ui-server/mcpConnect.js';

test('ChatGPT and Codex have separate supported connection instructions', () => {
  const clients = mcpClientSetups();
  const codex = clients.find((client) => client.id === 'codex')!;
  const chatgpt = clients.find((client) => client.id === 'chatgpt')!;
  assert.equal(codex.kind, 'toml');
  assert.match(codex.text, /\[mcp_servers.mythology-factory\]/);
  assert.equal(chatgpt.kind, 'command');
  assert.match(chatgpt.text, /sample_mcp_stdio_local/);
  assert.match(chatgpt.steps.join(' '), /Connection: Tunnel/);
  assert.doesNotMatch(chatgpt.text, /\[mcp_servers/);
});

test('real server completes stdio initialization and tool discovery', async () => {
  const result = await testMcpServer();
  assert.equal(result.ok, true, result.error);
  assert.ok(result.tools.some((tool) => tool.name === 'list_brands'));
  assert.ok(result.tools.some((tool) => tool.name === 'import_episode_script'));
});

test('generated Claude launcher works outside the project and calls a tool', async () => {
  const setup = mcpClientSetups().find((client) => client.id === 'claude-desktop')!;
  const entry = JSON.parse(setup.text).mcpServers['mythology-factory'];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(entry.command, entry.args, { cwd: '/tmp', stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    let stderr = '';
    const timer = setTimeout(() => finish(new Error(`Launcher timed out: ${stderr}`)), 15_000);
    let settled = false;
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error); else resolve();
    }
    function send(value: unknown) { child.stdin.write(JSON.stringify(value) + '\n'); }
    child.on('error', finish);
    child.on('exit', (code) => { if (!settled) finish(new Error(`Launcher exited ${code}: ${stderr}`)); });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (message.error) throw new Error(message.error.message);
          if (message.id === 1) {
            send({ jsonrpc: '2.0', method: 'notifications/initialized' });
            send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_brands', arguments: {} } });
          } else if (message.id === 2) {
            assert.equal(message.result.isError, undefined);
            assert.ok(message.result.content.some((item: { text?: string }) => item.text?.includes('epicastra')));
            finish();
          }
        } catch (error) { finish(error as Error); }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'connection-regression', version: '1' } } });
  });
});
