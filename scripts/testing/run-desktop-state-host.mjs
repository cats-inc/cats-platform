/**
 * Run built Desktop state acceptance under Node and/or the installed Electron.
 * Usage: node scripts/testing/run-desktop-state-host.mjs [--host=node|electron|all]
 * Build the server first. All tests import the existing isolated Cats-home preload.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const selected = process.argv.find(value => value.startsWith('--host='))?.slice(7) ?? 'all';
if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/testing/run-desktop-state-host.mjs [--host=node|electron|all] (after build:server)');
} else {
  if (!['node', 'electron', 'all'].includes(selected)) throw new Error('host must be node, electron or all');
  const tests = (await readdir(resolve(root, 'tests'))).filter(name => /^desktop-state-.*\.test\.js$/u.test(name))
    .sort().map(name => resolve(root, 'tests', name));
  if (!tests.length) throw new Error('No Desktop state acceptance tests found');
  for (const host of selected === 'all' ? ['node', 'electron'] : [selected]) {
    const command = host === 'electron' ? createRequire(import.meta.url)('electron') : process.execPath;
    const args = ['--import', './scripts/testing/isolate-cats-home.mjs', '--test', '--test-isolation=none', ...tests];
    const code = await new Promise((done, reject) => {
      const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: 'inherit',
        env: { ...process.env, ...(host === 'electron' ? { ELECTRON_RUN_AS_NODE: '1' } : {}) } });
      child.once('error', reject); child.once('close', value => done(value ?? 1));
    });
    if (code !== 0) { process.exitCode = code; break; }
  }
}
