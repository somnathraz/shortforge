import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const configPath = process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library/Application Support/Claude/claude_desktop_config.json')
  : process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'Claude/claude_desktop_config.json')
    : path.join(os.homedir(), '.config/Claude/claude_desktop_config.json');
const quote = (value) => `'${value.replace(/'/g, `'\\''`)}'`;
const entry = process.platform === 'win32'
  ? { command: 'cmd', args: ['/c', `cd /d "${root}" && "${process.execPath}" --import tsx src\\mcp\\server.ts`] }
  : { command: '/bin/sh', args: ['-c', `cd ${quote(root)} && ${quote(process.execPath)} --import tsx src/mcp/server.ts`] };

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ configPath, mcpServers: { 'mythology-factory': entry } }, null, 2));
} else {
  const previous = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
  const config = previous ? JSON.parse(previous) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      (config.mcpServers != null && (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)))) {
    throw new Error('Invalid Claude config; left unchanged');
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const backup = previous ? `${configPath}.backup-${Date.now()}` : null;
  if (backup) fs.writeFileSync(backup, previous, { mode: 0o600, flag: 'wx' });
  config.mcpServers = { ...config.mcpServers, 'mythology-factory': entry };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (JSON.stringify(saved.mcpServers['mythology-factory']) !== JSON.stringify(entry)) throw new Error('Readback failed');
  console.log(JSON.stringify({ configured: true, configPath, backup, server: 'mythology-factory' }));
}
