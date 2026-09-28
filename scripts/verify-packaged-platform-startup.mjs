#!/usr/bin/env node
// Start the shipped Platform in an isolated copy, outside checkout dependencies.
// Usage: node scripts/verify-packaged-platform-startup.mjs --resources <directory>
// Uses temporary state and loopback ports, an unavailable Runtime fixture, and
// the current Node executable. Does not start provider CLIs or install Desktop.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

export async function verifyPackagedPlatformStartup(resourcesRoot, {
  command = process.execPath, timeoutMs = 20_000, shutdownTimeoutMs = 5_000,
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-packaged-startup-'));
  const runtime = createServer((_request, response) => {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end('{"error":"isolated startup fixture: Runtime unavailable"}');
  });
  let child;
  let closed;
  let timer;
  let output = '';
  try {
    // TEMP/TMPDIR may itself point into a checkout or through a junction.
    // Refuse any physical ancestor that could satisfy an omitted dependency.
    for (let ancestor = await realpath(root); ; ancestor = path.dirname(ancestor)) {
      let canBorrow = false;
      try { await access(path.join(ancestor, 'node_modules')); canBorrow = true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      assert.equal(canBorrow, false, 'Startup isolation requires a TEMP/TMPDIR with no ancestor node_modules');
      if (path.dirname(ancestor) === ancestor) break;
    }
    const appRoot = path.join(root, 'app-sidecar');
    // Running directly under release/ can silently resolve a missing package
    // from the development checkout's ancestor node_modules and falsely pass.
    await cp(path.join(resourcesRoot, 'app-sidecar'), appRoot, { recursive: true });
    const version = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8')).version;
    const cwd = path.join(root, 'cwd');
    await mkdir(cwd);
    const runtimePort = await listen(runtime);
    const reservation = createServer();
    const appPort = await listen(reservation);
    await new Promise((resolve) => reservation.close(resolve));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|SYSTEMDRIVE|TEMP|TMP|TMPDIR|LANG|LC_.*)$/i.test(key)));
    Object.assign(env, {
      HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root,
      XDG_CONFIG_HOME: root, XDG_DATA_HOME: root, XDG_CACHE_HOME: root,
      ELECTRON_RUN_AS_NODE: '1', CATS_HOST: '127.0.0.1', CATS_PORT: String(appPort),
      CATS_PLATFORM_DIR: path.join(root, 'state/platform'),
      CATS_DESKTOP_DIR: path.join(root, 'state/desktop'),
      CATS_RUNTIME_DIR: path.join(root, 'state/runtime'),
      CATS_PLATFORM_PACKAGE_ROOT: appRoot,
      CATS_RUNTIME_PACKAGE_ROOT: path.resolve(resourcesRoot, 'cats-runtime'),
      CATS_RUNTIME_BASE_URL: `http://127.0.0.1:${runtimePort}`,
      CATS_APP_BUNDLE_PATH: path.join(appRoot, 'official-apps/bundle.lock.json'),
    });
    const ready = await new Promise((resolve, reject) => {
      child = spawn(command, [path.join(appRoot, 'build/server/index.js'),
        '--startup-mode=app-managed', '--managed-by=cats-packaging-check', '--ready-output=json'],
      { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      closed = new Promise((done) => child.once('close', done));
      let pending = '';
      const collect = (chunk) => { output = (output + chunk.toString()).slice(-32_768); };
      child.stderr.on('data', collect);
      child.stdout.on('data', (chunk) => {
        collect(chunk);
        pending += chunk.toString();
        const lines = pending.split(/\r?\n/);
        pending = lines.pop().slice(-32_768);
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.event === 'app.ready' && event.service === 'cats-platform' && event.ready === true) resolve(event);
          } catch { /* Startup can include ordinary diagnostic lines. */ }
        }
      });
      child.once('error', reject);
      child.once('close', (code) => reject(new Error(`Packaged Platform exited before readiness (${code}):\n${output}`)));
      timer = setTimeout(() => reject(new Error(`Packaged Platform readiness timed out:\n${output}`)), timeoutMs);
    });
    clearTimeout(timer);
    assert.equal(ready.pid, child.pid, 'Readiness must belong to the spawned sidecar');
    assert.equal(ready.version, version);
    const response = await fetch(`http://127.0.0.1:${appPort}/health`, { signal: AbortSignal.timeout(5_000) });
    assert.equal(response.status, 200, `Packaged Platform health failed:\n${output}`);
    const health = await response.json();
    assert.equal(health.service, 'cats-platform');
    assert.equal(health.startup.pid, child.pid);
    assert.equal(health.readiness.ready, true);
    assert.equal(health.version, version);
    return { platformStartup: true, version, isolatedState: true, runtime: 'unavailable-fixture' };
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) {
      child.stdin.end();
      // stdin end requests the real Platform's graceful shutdown. SIGTERM is
      // also handled by Platform, so use SIGKILL if that shutdown gets stuck.
      const killTimer = setTimeout(() => child.kill('SIGKILL'), shutdownTimeoutMs);
      await closed;
      clearTimeout(killTimer);
    }
    if (closed) await closed;
    runtime.closeAllConnections();
    await new Promise((resolve) => runtime.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('Usage: verify-packaged-platform-startup.mjs --resources <directory>');
  else if (process.argv.length !== 4 || process.argv[2] !== '--resources') {
    console.error('Expected --resources <directory>. Use --help.'); process.exitCode = 1;
  } else verifyPackagedPlatformStartup(path.resolve(process.argv[3]))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
