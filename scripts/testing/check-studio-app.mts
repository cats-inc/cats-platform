#!/usr/bin/env node
// Isolated package/SDK/host browser acceptance. Never starts a provider CLI.
// Usage: node --import tsx scripts/testing/check-studio-app.mts --apps-lock <path> --image <jpeg>
// Requires CATS_TEST_PLAYWRIGHT_MODULE and CATS_TEST_BROWSER_EXECUTABLE.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { resolveAppLock } from '#cats-app-package';
import { installRendererPackage } from '../../src/platform/apps/packageInstaller.js';
import { routeRequest } from '../../src/app/server/requestRouter.js';
import type { ResolvedServerDependencies } from '../../src/app/server/contracts.js';
import type { RuntimeImageJob, RuntimeImageRequest } from '../../src/runtime/images.js';
import { loadConfig } from '../../src/config.js';
import { createDefaultCoreState } from '../../src/core/model/index.js';
import { MemoryCoreStore } from '../../src/core/store.js';
import { createEmptyPlatformAuthState, createFirstAdminLocalAuthState, MemoryPlatformAuthStore } from '../../src/platform/auth/index.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write('Usage: node --import tsx scripts/testing/check-studio-app.mts --apps-lock <path> --image <jpeg>\nRequires CATS_TEST_PLAYWRIGHT_MODULE and CATS_TEST_BROWSER_EXECUTABLE. Uses isolated fixture state; no provider CLI calls.\n');
  process.exit(0);
}
const option = (name: string) => { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}`); return path.resolve(args[index + 1]!); };
const apps = await resolveAppLock(option('--apps-lock'));
const studio = apps.find((app) => app.id === 'cats.studio');
if (!studio || !process.env.CATS_TEST_PLAYWRIGHT_MODULE || !process.env.CATS_TEST_BROWSER_EXECUTABLE) throw new Error('Studio package and browser inputs required');
const image = await readFile(option('--image'));
const output = { mimeType: 'image/jpeg' as const, bytes: image.length, width: 1024, height: 1024, sha256: createHash('sha256').update(image).digest('hex') };
const root = await mkdtemp(path.join(tmpdir(), 'cats-studio-browser-'));
const chatStatePath = path.join(root, 'state', 'chat-state.local.json');
for (const app of apps) await installRendererPackage({ chatStatePath, bytes: app.bytes, pin: app, source: 'local-package', enable: true });
const bundle = await build({ entryPoints: [fileURLToPath(new URL('./studio-app-smoke-renderer.tsx', import.meta.url))], bundle: true,
  format: 'esm', platform: 'browser', write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const sessionSecret = 'isolated-studio-browser-secret';
const auth = await createFirstAdminLocalAuthState({ state: createEmptyPlatformAuthState(), displayName: 'Test',
  identifier: 'test@example.test', password: 'isolated-fixture-password', sessionSecret, sessionTtlMs: 600_000 });
const core = createDefaultCoreState(); core.setupCompleteAt = new Date().toISOString();
const receipts = new Map<string, RuntimeImageJob>();
let submissions = 0; let cancelled = 0; let offline = false; let pending = false;
const runtimeClient = {
  async getImageCapabilities() {
    if (offline) throw new Error('Fixture offline');
    return { schemaVersion: 1, operation: 'image.generate', aspectRatio: '1:1', maxPromptLength: 2000,
      maxImageBytes: 8 * 1024 * 1024, targets: [{ provider: 'grok', instance: 'native', agentModel: 'fixture-no-cli' }] };
  },
  async submitImageJob(input: RuntimeImageRequest) {
    submissions++; const now = new Date().toISOString();
    const job: RuntimeImageJob = { ...input, schemaVersion: 1, provider: 'grok', agentModel: 'fixture-no-cli',
      status: pending ? 'running' : 'succeeded', createdAt: now, updatedAt: now, error: null, output: pending ? null : output };
    receipts.set(job.id, job); return job;
  },
  async getImageJob(id: string) { return receipts.get(id)!; },
  async cancelImageJob(id: string) { cancelled++; const job = receipts.get(id)!; job.status = 'cancelled'; job.error = 'cancelled'; return job; },
  async getImageBytes() { return image; },
};
const dependencies = { shared: {
  config: loadConfig({ CATS_HOME_DIR: root, CATS_PLATFORM_DIR: root, CATS_CHAT_STATE_PATH: chatStatePath, CATS_AUTH_SESSION_SECRET: sessionSecret }),
  coreStore: new MemoryCoreStore(core), authStore: new MemoryPlatformAuthStore(auth.state), runtimeClient,
}, chat: {}, work: {}, code: {} } as unknown as ResolvedServerDependencies;
dependencies.shared.config.chatStatePath = chatStatePath;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/smoke.js') { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(bundle.outputFiles[0]!.contents); return; }
    if (url.pathname.startsWith('/api/')) { await routeRequest(request, response, dependencies); return; }
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/smoke.js"></script></body></html>');
  } catch { response.writeHead(500); response.end('Fixture failure'); }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture listener unavailable');
const { chromium } = await import(pathToFileURL(process.env.CATS_TEST_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ executablePath: process.env.CATS_TEST_BROWSER_EXECUTABLE, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, locale: 'zh-TW', acceptDownloads: true });
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.context().addCookies([{ name: 'cats_session', value: auth.session.token, url: `http://127.0.0.1:${address.port}` }]);
  const url = `http://127.0.0.1:${address.port}/?appVersion=${studio.version}`;
  await page.goto(url);
  const frame = page.frameLocator('iframe[title="Studio"]');
  await frame.locator('#target option[value="native"]').waitFor({ state: 'attached' });
  assert.equal(submissions, 0, 'Opening Studio cannot generate an image');
  assert.equal(await frame.locator('#generate').isDisabled(), true);
  await frame.locator('#prompt').fill('Isolated fixture image — never sent to a CLI');
  await frame.locator('#generate').click();
  try { await frame.getByRole('button', { name: '下載', exact: true }).waitFor({ timeout: 20_000 }); }
  catch (error) { process.stderr.write(JSON.stringify({ submissions, errors, body: await frame.locator('body').innerText(), tasks: (await dependencies.shared.coreStore.readCore()).tasks }) + '\n'); throw error; }
  await frame.locator('.sample-badge').filter({ hasText: '已保存' }).waitFor();
  assert.equal(submissions, 1);
  const preview = await frame.locator('#sample-image').evaluate((element: HTMLImageElement) => ({ width: element.naturalWidth, src: element.src }));
  assert.equal(preview.width, 1024); assert.ok(preview.src.startsWith('blob:'));
  await frame.locator('#expand').click(); await frame.locator('#image-dialog[open]').waitFor();
  await frame.getByRole('button', { name: '關閉預覽' }).click();
  assert.equal(await frame.locator('#image-dialog').getAttribute('open'), null);
  const downloadEvent = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下載', exact: true }).click();
  const download = await downloadEvent;
  assert.deepEqual(await readFile(await download.path()), image);
  const screenshotDir = path.resolve('tmp', 'studio-acceptance'); await mkdir(screenshotDir, { recursive: true });
  await frame.locator('h1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, 'studio-desktop.png') });
  offline = true; await page.reload();
  await frame.getByText('生成服務暫時無法連線，已保存的作品仍可查看及下載。', { exact: true }).waitFor();
  await frame.locator('.sample-badge').filter({ hasText: '已保存' }).waitFor();
  assert.equal(await frame.getByRole('button', { name: '下載', exact: true }).count(), 1);
  assert.equal(submissions, 1, 'Reload/offline reads cannot repeat generation');
  offline = false; pending = true; await page.reload();
  await frame.locator('#target option[value="native"]').waitFor({ state: 'attached' });
  await frame.locator('#prompt').fill('Isolated pending fixture'); await frame.locator('#generate').click();
  await frame.getByRole('button', { name: '取消', exact: true }).click();
  await frame.locator('#jobs').getByText(/已取消/).waitFor();
  assert.equal(submissions, 2); assert.ok(cancelled > 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await frame.locator('h1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, 'studio-narrow.png'), fullPage: true });
  const innerFrame = page.frames().find((candidate: { parentFrame(): unknown }) => candidate.parentFrame() !== null)!;
  assert.equal(await innerFrame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await innerFrame.evaluate(() => { try { return !!parent.document.body; } catch { return false; } }), false);
  assert.equal(await innerFrame.evaluate(async () => { try { await fetch('/api/apps'); return true; } catch { return false; } }), false);
  await frame.getByRole('button', { name: '返回 Cats Home' }).click(); await page.getByText('Returned to lobby').waitFor();
  assert.deepEqual(errors, []);
  process.stdout.write(`${JSON.stringify({ ok: true, submissions, cancelled, cliCalls: 0, app: { id: studio.id, version: studio.version, sha256: studio.sha256 }, screenshotDir, isolatedRegistry: root }, null, 2)}\n`);
} finally { await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
