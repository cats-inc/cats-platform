import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createLinuxDesktopRelaunch } from '../build/desktop/linuxRelaunch.js';

async function waitForFile(path) {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await delay(20);
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

for (const restrict of [false, true]) {
  test(`Linux relaunch preserves privilege state and waits for exit (restricted=${restrict})`, {
    skip: process.platform !== 'linux',
    timeout: 15_000,
  }, async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'cats relaunch '));
    const readyPath = join(root, 'ready.json');
    const resultPath = join(root, 'result.jsonl');
    const parentPath = join(root, 'parent.mjs');
    const replacementPath = join(root, 'replacement with spaces.mjs');
    const moduleUrl = new URL('../build/desktop/linuxRelaunch.js', import.meta.url).href;
    const originalArgs = ['--literal=$HOME;echo nope', "quotes'\"", 'two words'];
    let parent;
    try {
      await writeFile(replacementPath, `
        import { appendFileSync, readFileSync } from 'node:fs';
        let parentState = 'gone';
        try { parentState = readFileSync('/proc/' + process.argv[2] + '/status', 'utf8')
          .match(/^State:\\s*(\\w)/m)[1]; } catch {}
        appendFileSync(${JSON.stringify(resultPath)}, JSON.stringify({
          parentState, args: process.argv.slice(3), nodeMode: process.env.ELECTRON_RUN_AS_NODE,
          nnp: readFileSync('/proc/self/status', 'utf8').match(/^NoNewPrivs:\\s*(\\d)/m)[1],
        }) + '\\n');
      `);
      await writeFile(parentPath, `
        import { readFileSync, writeFileSync } from 'node:fs';
        import { createLinuxDesktopRelaunch } from ${JSON.stringify(moduleUrl)};
        const relaunch = createLinuxDesktopRelaunch({
          executable: process.execPath,
          args: [${JSON.stringify(replacementPath)}, String(process.pid),
            ...${JSON.stringify(originalArgs)}],
          logger: console.error,
        });
        relaunch(); relaunch();
        writeFileSync(${JSON.stringify(readyPath)}, JSON.stringify({
          nnp: readFileSync('/proc/self/status', 'utf8').match(/^NoNewPrivs:\\s*(\\d)/m)[1],
        }));
        process.stdin.resume();
        process.stdin.once('data', () => process.exit(0));
      `);
      parent = spawn(restrict ? 'setpriv' : process.execPath,
        restrict ? ['--no-new-privs', process.execPath, parentPath] : [parentPath],
        { stdio: ['pipe', 'ignore', 'pipe'], signal: context.signal });
      const exited = once(parent, 'exit');
      let stderr = '';
      parent.stderr.on('data', (chunk) => { stderr += chunk; });
      const before = JSON.parse(await waitForFile(readyPath));
      if (restrict) assert.equal(before.nnp, '1');
      await delay(100);
      await assert.rejects(readFile(resultPath), { code: 'ENOENT' });
      parent.stdin.write('exit');
      assert.deepEqual(await exited, [0, null], stderr);
      const result = JSON.parse((await waitForFile(resultPath)).trim());
      assert.ok(['gone', 'Z'].includes(result.parentState), result.parentState);
      assert.equal(result.nnp, before.nnp);
      assert.deepEqual(result.args, originalArgs);
      assert.equal(result.nodeMode, undefined);
      await delay(100);
      assert.equal((await readFile(resultPath, 'utf8')).trim().split('\n').length, 1);
      assert.equal(stderr, '');
    } finally {
      if (parent && parent.exitCode === null) parent.kill();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('a failed Linux relaunch helper is reported and may be retried', async () => {
  const messages = [];
  const relaunch = createLinuxDesktopRelaunch({
    executable: join(tmpdir(), 'cats-nonexistent-relaunch-executable'),
    args: [],
    logger: (message) => messages.push(message),
  });
  relaunch();
  for (let attempt = 0; messages.length < 1 && attempt < 100; attempt += 1) await delay(10);
  assert.match(messages[0], /helper launch failed:.*ENOENT/u);
  relaunch();
  for (let attempt = 0; messages.length < 2 && attempt < 100; attempt += 1) await delay(10);
  assert.equal(messages.length, 2);
});
