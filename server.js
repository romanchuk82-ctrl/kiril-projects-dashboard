import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync(new URL('./node_modules/@modelcontextprotocol/sdk/package.json', import.meta.url))) {
  console.log('[bootstrap] Installing production dependencies…');
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

await import('./server.source.js');
