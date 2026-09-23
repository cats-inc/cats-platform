import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

// Run on a Linux desktop: CATS_TEST_ELECTRON_RELAUNCH=1 node --test
// tests/desktop-linux-relaunch-electron.test.js (after npm run build:host).
// Both apps use a disposable profile; no installed Cats state is accessed.
const enabled = process.platform === 'linux' && process.env.CATS_TEST_ELECTRON_RELAUNCH === '1';

for (const restricted of [false, true]) {
  test(`Electron relaunch preserves privileges and releases the profile lock (${restricted})`, {
    skip: !enabled,
    timeout: 15_000,
  }, async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'cats electron relaunch '));
    const resultPath = join(root, 'result.jsonl');
    const relaunchModule = new URL('../build/desktop/linuxRelaunch.js', import.meta.url).href;
    const updaterModule = new URL('../build/desktop/linuxUpdater.js', import.meta.url).href;
    const electron = createRequire(import.meta.url)('electron');
    const args = ['--literal=$HOME;echo nope', '繁體中文 with spaces', "quotes'\""];
    let child;
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({
        name: 'cats-relaunch-test', version: '0.4.0', main: 'main.cjs',
      }));
      await writeFile(join(root, 'main.cjs'), `
        const { app } = require('electron');
        const { appendFileSync, readFileSync } = require('node:fs');
        app.setPath('userData', ${JSON.stringify(join(root, 'profile'))});
        const second = process.argv.includes('--second');
        const lock = app.requestSingleInstanceLock();
        if (!lock) { console.error('profile lock unavailable'); app.exit(2); }
        app.whenReady().then(async () => {
          const { createLinuxDesktopRelaunch } = await import(${JSON.stringify(relaunchModule)});
          const { LinuxDesktopUpdater } = await import(${JSON.stringify(updaterModule)});
          const updater = new LinuxDesktopUpdater(createLinuxDesktopRelaunch({
            executable: process.execPath,
            args: [${JSON.stringify(root)}, '--second', ...${JSON.stringify(args)}],
            logger: console.error,
          }));
          appendFileSync(${JSON.stringify(resultPath)}, JSON.stringify({
            second, lock, executor: updater.httpExecutor?.constructor.name,
            electron: process.versions.electron,
            nnp: readFileSync('/proc/self/status', 'utf8').match(/^NoNewPrivs:\\s*(\\d)/m)[1],
            args: second ? process.argv.slice(process.argv.indexOf('--second') + 1) : [],
            nodeMode: process.env.ELECTRON_RUN_AS_NODE,
          }) + '\\n');
          if (!second) { updater.app.relaunch(); updater.app.relaunch(); }
          app.quit();
        }).catch(error => { console.error(error); app.exit(3); });
      `);
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      child = spawn(restricted ? 'setpriv' : electron,
        restricted ? ['--no-new-privs', electron, root] : [root],
        { env, stdio: ['ignore', 'ignore', 'pipe'], signal: context.signal });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      assert.deepEqual(await once(child, 'exit'), [0, null], stderr);
      let rows = [];
      for (let attempt = 0; attempt < 250; attempt += 1) {
        rows = (await readFile(resultPath, 'utf8')).trim().split('\n').map(JSON.parse);
        if (rows.length === 2) break;
        await delay(20);
      }
      assert.equal(rows.length, 2, stderr);
      assert.equal(rows[0].second, false);
      assert.equal(rows[1].second, true);
      assert.equal(rows[0].lock, true);
      assert.equal(rows[1].lock, true);
      assert.equal(rows[0].executor, 'ElectronHttpExecutor');
      assert.equal(rows[1].executor, 'ElectronHttpExecutor');
      const runnerNnp = (await readFile('/proc/self/status', 'utf8'))
        .match(/^NoNewPrivs:\s*(\d)/m)[1];
      assert.equal(rows[0].nnp, restricted ? '1' : runnerNnp);
      assert.equal(rows[1].nnp, rows[0].nnp);
      context.diagnostic(`Electron ${rows[0].electron}: NNP ${rows[0].nnp} -> ${rows[1].nnp}`);
      assert.deepEqual(rows[1].args, args);
      assert.equal(rows[1].nodeMode, undefined);
      await delay(100);
      assert.equal((await readFile(resultPath, 'utf8')).trim().split('\n').length, 2);
    } finally {
      if (child && child.exitCode === null) child.kill();
      await rm(root, { recursive: true, force: true });
    }
  });
}
