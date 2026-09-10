import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { sha256, readBrowserSdk } from '#cats-app-package';
import { bundleServer } from '../scripts/bundle-server.mjs';
import { installRendererPackage } from '../build/server/platform/apps/packageInstaller.js';

test('bundled sidecar serves an installed renderer using the shipped SDK, not bundle-relative browser.js', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-bundled-sdk-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appRoot = path.join(root, 'app-sidecar');
  const outfile = path.join(appRoot, 'build/server/renderer-route.js');
  const chatStatePath = path.join(root, 'profile/state/chat-state.local.json');
  await mkdir(path.dirname(outfile), { recursive: true });
  await cp(new URL('../package.json', import.meta.url), path.join(appRoot, 'package.json'));
  await cp(new URL('../packages/app-sdk', import.meta.url), path.join(appRoot, 'packages/app-sdk'), { recursive: true });
  // Run the production bundler and execute its output from the actual sidecar
  // layout. Importing source modules would hide import.meta.url relocation bugs.
  await bundleServer({
    entryPoint: fileURLToPath(new URL('../build/server/app/server/appPackageRoutes.js', import.meta.url)),
    outfile,
  });
  const { routeAppPackageApi } = await import(pathToFileURL(outfile).href);
  const manifest = {
    schemaVersion: 1, id: 'cats.usage', displayName: 'Usage', version: '0.1.0',
    category: 'user-app', trustTier: 'system', publisher: { name: 'Test' },
    compatibility: { catsPlatform: '^0.2.1', appSdk: '1.x' },
    entrypoints: { renderer: 'renderer/index.html' },
    contributions: { lobbyApps: [{ id: 'usage', title: 'Usage', routePath: '/apps/cats.usage' }] },
    permissions: ['ui.route', 'ui.lobby', 'runtime.telemetry.read'],
  };
  const html = '<html><head></head><body>Usage</body></html>';
  const bytes = gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'cats-app', manifest,
    files: [{ path: 'renderer/index.html', base64: Buffer.from(html).toString('base64') }],
  })));
  await installRendererPackage({ chatStatePath, bytes, source: 'desktop-bundle', enable: true,
    pin: { id: manifest.id, version: manifest.version, sha256: sha256(bytes) } });
  let status = 0; let body = '';
  const response = { writeHead(value) { status = value; }, end(value) { body = value; } };
  await routeAppPackageApi({ request: Readable.from([]), response, method: 'GET',
    url: new URL('http://localhost/api/apps/cats.usage/renderer?version=0.1.0'),
    dependencies: { config: { chatStatePath } },
  });
  assert.equal(status, 200, body);
  assert.equal(JSON.parse(body).html, html);
  assert.equal(JSON.parse(body).sdk, await readBrowserSdk());
});
