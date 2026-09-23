import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// CATS_TEST_ELECTRON_PLATFORM_SHELL=1 node --test --test-isolation=none
// tests/desktop-platform-shell-electron.test.js (after npm run build:host).
// Uses a synthetic local server and a disposable profile, never installed Cats.
test('Electron cold start restores tray products from its persisted browser session', {
  skip: process.env.CATS_TEST_ELECTRON_PLATFORM_SHELL !== '1',
  timeout: 30_000,
}, async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'cats tray session '));
  const completed = '2026-09-24T00:00:00Z';
  const server = createServer((request, response) => {
    if (request.url === '/sign-in') {
      response.writeHead(200, {
        'set-cookie': 'cats_session=fixture-session; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
        'content-type': 'text/html',
      });
      response.end('<p>Synthetic sign-in fixture</p>');
      return;
    }
    const authenticated = request.headers.cookie === 'cats_session=fixture-session';
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(authenticated ? {
      setupCompleteAt: completed,
      products: ['Chat', 'Work', 'Code'].map((name) => ({
        id: name.toLowerCase(), productName: `Cats ${name}`, routePrefix: `/${name.toLowerCase()}`,
        installState: 'installed', setup: { selectable: true },
      })),
    } : { auth: { authenticated: false }, setup: { completeAt: completed } }));
  });
  let child;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const electron = createRequire(import.meta.url)('electron');
    const resultPath = join(root, 'result.json');
    for (const phase of ['seed', 'restart']) {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      child = spawn(electron, [
        fileURLToPath(new URL('./fixtures/desktop-platform-shell-electron.cjs', import.meta.url)),
        join(root, 'profile'), baseUrl,
        new URL('../build/desktop/platformShellReader.js', import.meta.url).href,
        new URL('../build/desktop/trayMenu.js', import.meta.url).href,
        resultPath, phase,
      ], { env, stdio: ['ignore', 'ignore', 'pipe'], signal: context.signal });
      let stderr = '';
      child.stderr.on('data', (data) => { stderr += data; });
      assert.deepEqual(await once(child, 'exit'), [0, null], stderr);
    }
    const result = JSON.parse(await readFile(resultPath, 'utf8'));
    assert.deepEqual(result.coldStart, ['Open Chat', 'Open Work', 'Open Code']);
    assert.equal(result.refreshed, true);
    assert.equal(result.oldTransportProductsAbsent, true);
    assert.deepEqual(result.signedOut, []);
    assert.deepEqual(result.signedInAgain, result.coldStart);
    context.diagnostic(`Electron ${result.electron}: persisted session -> 3 shortcuts; logout -> 0; login -> 3`);
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await once(child, 'exit').catch(() => {});
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
