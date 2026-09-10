#!/usr/bin/env node
// Integration-only: built App archive + real host surface/route + fixture runtime.
// Usage: node --import tsx scripts/testing/check-usage-app.mts --apps-lock <path>
// Requires CATS_TEST_PLAYWRIGHT_MODULE (absolute module file) and CATS_TEST_BROWSER_EXECUTABLE.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { resolveAppLock } from '#cats-app-package';
import { installRendererPackage } from '../../src/platform/apps/packageInstaller.js';
import { FileCatsAppRegistry } from '../../src/platform/apps/registry.js';
import { resolveCatsAppStoragePathsFromChatState } from '../../src/platform/apps/paths.js';
import { projectUsageSnapshot } from '../../src/runtime/usageSnapshot.js';
import { toPlatformInstalledAppDescriptor } from '../../src/platform/apps/envelope.js';
import { routeRequest } from '../../src/app/server/requestRouter.js';
import type { ResolvedServerDependencies } from '../../src/app/server/contracts.js';
import { loadConfig } from '../../src/config.js';
import { createDefaultCoreState } from '../../src/core/model/index.js';
import { MemoryCoreStore } from '../../src/core/store.js';
import { createEmptyPlatformAuthState, createFirstAdminLocalAuthState, MemoryPlatformAuthStore } from '../../src/platform/auth/index.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write('Usage: node --import tsx scripts/testing/check-usage-app.mts --apps-lock <path> [--renderer-root <built renderer directory>] [--electron] [--check-loading-recovery]\nRequires CATS_TEST_PLAYWRIGHT_MODULE and CATS_TEST_BROWSER_EXECUTABLE; no real user state is read.\n');
  process.exit(0);
}
const lockPath = args[args.indexOf('--apps-lock') + 1];
const rendererRoot = args.includes('--renderer-root') ? path.resolve(args[args.indexOf('--renderer-root') + 1]!) : null;
if (args.includes('--electron') && args.includes('--check-loading-recovery')) {
  throw new Error('Loading fault injection requires Chromium/Edge. Run Electron functional checks without --check-loading-recovery.');
}
if (args.indexOf('--apps-lock') < 0 || !lockPath || !process.env.CATS_TEST_PLAYWRIGHT_MODULE || !process.env.CATS_TEST_BROWSER_EXECUTABLE) throw new Error('App lock and isolated browser test inputs are required.');
const root = await mkdtemp(path.join(tmpdir(), 'cats-usage-browser-'));
const chatStatePath = path.join(root, 'state', 'chat-state.local.json');
const apps = await resolveAppLock(path.resolve(lockPath));
const usage = apps.find((app) => app.id === 'cats.usage' && app.version === '0.1.0');
if (!usage) throw new Error('This smoke fixture targets Usage 0.1.0.');
await installRendererPackage({ chatStatePath, bytes: usage.bytes, pin: usage, source: 'local-package', enable: true });
const registry = new FileCatsAppRegistry({ registryPath: resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath });
const bundle = rendererRoot ? null : await build({ entryPoints: [fileURLToPath(new URL('./usage-app-smoke-renderer.tsx', import.meta.url))], bundle: true,
  format: 'esm', platform: 'browser', write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const js = bundle?.outputFiles[0]!.contents;
const installed = (await registry.getInstalledApp(usage.id))!;
const hostEnvelope = {
  app: { name: 'cats-platform', stage: 'phase-2-shell', runtimeBoundary: 'cats-runtime' },
  products: [], installedApps: [toPlatformInstalledAppDescriptor(installed)],
  desktop: { startAtLogin: false, openWindowOnStartup: true, systemTrayEnabled: true,
    mobilePairing: { enabled: false, transport: 'tailscale', installId: null, displayName: null } },
  language: { uiLanguagePreference: 'zh-TW' },
  lobby: { animationMode: 'reduced', cats: [] },
  runtime: { baseUrl: 'http://127.0.0.1', reachable: true, status: 'ok', service: 'cats-runtime' },
  runtimeSetup: { source: 'runtime', bootstrapRequired: false, status: 'ready', stateStatus: 'ready', summary: 'Ready',
    scannedAt: null, lastManualScanAt: null, appliedAt: null, providerCount: 0, availableCount: 0,
    providersReadyToApply: [], providersNeedingAttention: [], suggestedProviders: [], canRunManualScan: true, canApply: false, error: null },
  metadata: { generatedAt: new Date().toISOString(), host: '127.0.0.1', port: 0 },
  bootstrapAttemptId: null, scopeId: 'isolated-usage-smoke', setupCompleteAt: new Date().toISOString(),
  ownerDisplayName: 'Test', ownerAvatarColor: null, ownerAvatarUrl: null, lastProductSurface: null, guideCat: null,
};
let offline = false; let epoch = 'fixture-epoch'; let stale = false; let reads = 0;
const timestamp = () => new Date().toISOString();
const totals = (totalTokens: number | null, currency = 'USD') => ({ observations: totalTokens === null ? 0 : 1,
  inputTokens: totalTokens === null ? null : Math.floor(totalTokens * 0.8), outputTokens: totalTokens === null ? null : Math.ceil(totalTokens * 0.2),
  totalTokens, costs: totalTokens === null ? [] : [{ currency, amount: 0.12, observations: 1 }],
  confidence: { reported: totalTokens === null ? 0 : 1, aggregated: 0, estimated: 0, unknown: 0 }, lastObservedAt: timestamp() });
const runtimeClient = { async getUsageSnapshot() {
  reads++; if (offline) throw new Error('Fixture offline');
  const observedAt = new Date(Date.now() - (stale ? 600_000 : 30_000)).toISOString();
  const targets = ['claude', 'codex', 'copilot'].map((provider, index) => ({ provider, instance: 'default', backend: 'cli', usage: totals(index === 2 ? null : 12500 + index * 1000, index ? 'EUR' : 'USD'), guardrails: [],
    quota: { status: index === 2 ? 'unsupported' : 'available', freshness: stale ? 'stale' : 'fresh', source: index === 0 ? 'claude.rate_limit_event' : index === 1 ? 'codex.account/rateLimits/updated' : null,
      observedAt: index === 2 ? null : observedAt, accountId: null, accountLinkage: 'unverified', automaticRefresh: false,
      windows: index === 2 ? [] : [{ id: index ? 'primary' : 'five_hour', unit: 'percent', usedPercent: index ? 60 : 25, remainingPercent: index ? 40 : 75,
        resetsAt: new Date(Date.now() + (stale ? -60_000 : 3_600_000)).toISOString(), windowMinutes: 300 }] } }));
  return { schemaVersion: 1, generatedAt: timestamp(), runtime: { status: 'available', epoch },
    coverage: { mode: 'memory', scope: 'runtime_observed_results', startedAt: observedAt, retainedRecords: 2, droppedRecords: 0, droppedQuotaTargets: 0, truncated: false, historyAvailable: false },
    totals: { ...totals(26000), costs: [{ currency: 'USD', amount: 0.12 }, { currency: 'EUR', amount: 0.12 }] }, targets,
    sessions: targets.slice(0, 2).map((target, index) => ({ ...target, sessionId: `fixture-session-${index + 1}` })), incidents: [], guardrails: [] };
} };
const sessionSecret = 'isolated-usage-smoke-session-secret';
const auth = await createFirstAdminLocalAuthState({ state: createEmptyPlatformAuthState(), displayName: 'Test',
  identifier: 'test@example.test', password: 'isolated-fixture-password', sessionSecret, sessionTtlMs: 600_000 });
const core = createDefaultCoreState(); core.setupCompleteAt = new Date().toISOString();
const dependencies = { shared: {
  config: loadConfig({ CATS_HOME_DIR: root, CATS_PLATFORM_DIR: root, CATS_CHAT_STATE_PATH: chatStatePath,
    CATS_AUTH_SESSION_SECRET: sessionSecret }),
  coreStore: new MemoryCoreStore(core), authStore: new MemoryPlatformAuthStore(auth.state),
  runtimeClient: { getUsageSnapshot: async () => projectUsageSnapshot(await runtimeClient.getUsageSnapshot()) },
}, chat: {}, work: {}, code: {} } as unknown as ResolvedServerDependencies;
// Use the same temp path as the package installer regardless of config environment aliases.
dependencies.shared.config.chatStatePath = chatStatePath;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (rendererRoot && url.pathname === '/api/app-shell') {
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(hostEnvelope)); return;
    }
    if (url.pathname === '/smoke.js') { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(js); return; }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname.startsWith('/api/apps/')) { await routeRequest(request, response, dependencies); return; }
      response.writeHead(404); response.end(); return;
    }
    if (rendererRoot) {
      const asset = url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : 'index.html';
      const assetPath = path.resolve(rendererRoot, asset);
      if (!assetPath.startsWith(`${rendererRoot}${path.sep}`)) { response.writeHead(404); response.end(); return; }
      const contentType = asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html';
      response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
      response.end(await readFile(assetPath)); return;
    }
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f5f2"><div id="root"></div><script type="module" src="/smoke.js"></script></body></html>');
  } catch { response.writeHead(500); response.end('Fixture failure'); }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No fixture port');
const { chromium, _electron } = await import(pathToFileURL(process.env.CATS_TEST_PLAYWRIGHT_MODULE).href);
const electronMode = args.includes('--electron');
await mkdir(path.join(root, 'electron-profile'), { recursive: true });
const browser = electronMode
  ? await _electron.launch({ executablePath: process.env.CATS_TEST_BROWSER_EXECUTABLE,
    env: { ...process.env, CATS_USAGE_SMOKE_PROFILE_DIR: path.join(root, 'electron-profile') },
    args: [fileURLToPath(new URL('./usage-app-smoke-electron.cjs', import.meta.url))] })
  : await chromium.launch({ executablePath: process.env.CATS_TEST_BROWSER_EXECUTABLE, headless: true });
try {
  const page = electronMode ? await browser.firstWindow()
    : await browser.newPage({ viewport: { width: 1440, height: 1200 }, locale: 'zh-TW' });
  await page.context().addCookies([{ name: 'cats_session', value: auth.session.token, url: `http://127.0.0.1:${address.port}` }]);
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}${rendererRoot ? '/apps/cats.usage' : ''}`);
  const frame = page.frameLocator('iframe[title="Usage"]');
  try { await frame.getByText('75%', { exact: true }).waitFor({ timeout: 15_000 }); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ errors, body: await page.locator('body').innerText(), secure: await page.evaluate(() => isSecureContext) })}\n`);
    throw error;
  }
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
  process.stdout.write('Usage iframe rendered and received the fixture snapshot.\n');
  assert.equal(await frame.getByText('尚未支援', { exact: true }).count(), 1);
  assert.equal(await frame.locator('.stat .cost').innerText(), 'USD 0.12\nEUR 0.12');
  const innerFrame = page.frames().find((candidate: { parentFrame(): unknown }) => candidate.parentFrame() !== null);
  assert.ok(innerFrame);
  await innerFrame.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const frameBounds = await page.locator('iframe').boundingBox();
  assert.ok(frameBounds && frameBounds.width >= 800 && frameBounds.height >= 520, 'Dashboard has a usable desktop viewport');
  const screenshotDir = path.resolve('build', 'usage-smoke'); await mkdir(screenshotDir, { recursive: true });
  if (!electronMode) {
    // Viewport/frame captures keep the opaque iframe's paint surface intact.
    // Chromium full-page resizing can mispaint that surface even with correct DOM bounds.
    await page.screenshot({ path: path.join(screenshotDir, 'usage-desktop.png') });
    await page.locator('iframe').screenshot({ path: path.join(screenshotDir, 'usage-frame.png') });
  }
  await frame.locator('#provider').selectOption('copilot');
  assert.equal(await frame.locator('.stat').first().locator('strong').innerText(), '—');
  await frame.locator('#provider').selectOption('claude');
  assert.equal(await frame.locator('.provider').count(), 1);
  assert.equal(await frame.locator('tbody tr').count(), 1);
  await frame.locator('#provider').selectOption('');
  const refresh = async () => {
    // The real host deliberately permits at most one UI request per second.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const before = reads;
    await frame.getByRole('button', { name: '重新整理', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('iframe') !== null);
    for (let attempt = 0; reads === before && attempt < 30; attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(reads > before, 'Refresh reached the real host route');
  };
  offline = true; await refresh();
  await frame.getByText('Runtime 無法連線 · 以下保留最後快照', { exact: true }).waitFor();
  assert.equal(await frame.getByText('75%', { exact: true }).count(), 1);
  offline = false; stale = true; await refresh();
  await frame.getByText('已過預定重設時間，等待供應商新回報', { exact: true }).first().waitFor();
  assert.equal(await frame.getByText('75%', { exact: true }).count(), 1);
  epoch = 'fixture-restarted'; await refresh();
  await frame.getByText('Runtime 已重新啟動，本次用量觀測區間已重設。', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  if (!electronMode) await page.screenshot({ path: path.join(screenshotDir, 'usage-mobile.png'), fullPage: true });
  assert.equal(await innerFrame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await innerFrame.evaluate(() => { try { return !!parent.document.body; } catch { return false; } }), false);
  assert.equal(await innerFrame.evaluate(async () => { try { await fetch('/api/apps'); return true; } catch { return false; } }), false);
  await registry.updateAppState('cats.usage', { installState: 'disabled' });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await frame.getByRole('button', { name: '重新整理', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  await registry.updateAppState('cats.usage', { installState: 'enabled' });
  offline = false; stale = false;
  if (rendererRoot) {
    await page.getByRole('button', { name: '返回大廳', exact: true }).click();
    await page.getByRole('button', { name: /Usage/ }).click();
    await page.frameLocator('iframe[title="Usage"]').getByText('75%', { exact: true }).waitFor();
  }
  if (args.includes('--check-loading-recovery')) {
    await page.clock.install();
    const rendererPattern = '**/api/apps/cats.usage/renderer?*';
    let releaseRequest!: () => void;
    await page.route(rendererPattern, async (route: any) => {
      await new Promise<void>((resolve) => { releaseRequest = resolve; });
      await route.abort().catch(() => {}); // The host timeout may already have aborted it.
    });
    await page.goto(`http://127.0.0.1:${address.port}${rendererRoot ? '/apps/cats.usage' : ''}`);
    await page.getByRole('status').filter({ hasText: '載入 Usage' }).waitFor();
    await page.clock.fastForward(15_001);
    await page.getByRole('alert').filter({ hasText: '載入逾時' }).waitFor();
    await page.screenshot({ path: path.join(screenshotDir, 'usage-loading-timeout.png') });
    await page.unroute(rendererPattern);
    releaseRequest();
    await page.getByRole('button', { name: '重新載入', exact: true }).click();
    await page.frameLocator('iframe[title="Usage"]').getByText('75%', { exact: true }).waitFor();
    await page.route(rendererPattern, async (route: any) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...await response.json(), sdk: '' } });
    });
    await page.goto(`http://127.0.0.1:${address.port}${rendererRoot ? '/apps/cats.usage' : ''}`);
    await page.locator('iframe[title="Usage"]').waitFor();
    await page.clock.fastForward(15_001);
    await page.getByRole('alert').filter({ hasText: '載入逾時' }).waitFor();
    assert.equal(await page.locator('iframe').count(), 0);
    await page.unroute(rendererPattern);
    await page.getByRole('button', { name: '重新載入', exact: true }).click();
    await page.frameLocator('iframe[title="Usage"]').getByText('75%', { exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  process.stdout.write(`${JSON.stringify({ ok: true, reads, rendererRoot, electronMode, loadingRecovery: args.includes('--check-loading-recovery'),
    app: { id: usage.id, version: usage.version, sha256: usage.sha256 }, screenshotDir: electronMode ? null : screenshotDir, isolatedRegistry: root }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
