import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { sha256 } from '#cats-app-package';
import { verifyDesktopAppBundle } from '../scripts/verify-desktop-app-bundle.mjs';

test('installer verifier checks shipped bytes and source-free offline activation, rejecting omissions and corruption', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-installer-verifier-'));
  try {
    const resources = path.join(root, 'resources');
    const appRoot = path.join(resources, 'app-sidecar');
    const bundleRoot = path.join(appRoot, 'official-apps');
    await mkdir(bundleRoot, { recursive: true });
    await mkdir(path.join(appRoot, 'build/server'), { recursive: true });
    await mkdir(path.join(appRoot, 'config'), { recursive: true });
    await cp(new URL('../package.json', import.meta.url), path.join(appRoot, 'package.json'));
    await cp(new URL('../packages/app-sdk', import.meta.url), path.join(appRoot, 'packages/app-sdk'), { recursive: true });
    await writeFile(path.join(appRoot, 'build/server/index.js'), 'export {};');
    await writeFile(path.join(appRoot, 'config/provider-capability-bootstrap.yaml.example'), '{}');
    const manifest = {
      schemaVersion: 1, id: 'cats.usage', displayName: 'Usage', version: '0.1.0',
      category: 'user-app', trustTier: 'system', publisher: { name: 'Test' },
      compatibility: { catsPlatform: '^0.2.1', appSdk: '1.x' },
      entrypoints: { renderer: 'renderer/index.html' },
      contributions: { lobbyApps: [{ id: 'usage', title: 'Usage', routePath: '/apps/cats.usage' }] },
      permissions: ['ui.route', 'ui.lobby', 'runtime.telemetry.read'],
    };
    const bytes = gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'cats-app', manifest,
      files: [{ path: 'renderer/index.html', base64: Buffer.from('<html><head></head><body>Usage</body></html>').toString('base64') }],
    })));
    const apps = [{ id: manifest.id, version: manifest.version, sha256: sha256(bytes), artifact: 'cats.usage-0.1.0.catsapp' }];
    const lock = JSON.stringify({ schemaVersion: 1, apps });
    const expectedLock = path.join(root, 'expected.lock.json');
    const bundledLock = path.join(bundleRoot, 'bundle.lock.json');
    const archive = path.join(bundleRoot, apps[0].artifact);
    await writeFile(expectedLock, lock);
    await writeFile(bundledLock, lock);
    await writeFile(path.join(resources, 'desktop-package-plan.json'), JSON.stringify({ apps }));
    await writeFile(archive, bytes);
    assert.equal((await verifyDesktopAppBundle(resources, expectedLock)).offlineActivation, true);
    await writeFile(bundledLock, JSON.stringify({ schemaVersion: 1, apps: [] }));
    await assert.rejects(verifyDesktopAppBundle(resources, expectedLock), /exact App set/);
    await writeFile(bundledLock, lock);
    await writeFile(archive, 'corrupt');
    await assert.rejects(verifyDesktopAppBundle(resources, expectedLock), /SHA-256/);
    assert.equal(await readFile(expectedLock, 'utf8'), lock);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
