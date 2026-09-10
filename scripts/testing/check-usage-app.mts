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
import { routeAppPackageApi } from '../../src/app/server/appPackageRoutes.js';
import { FileCatsAppRegistry } from '../../src/platform/apps/registry.js';
import { resolveCatsAppStoragePathsFromChatState } from '../../src/platform/apps/paths.js';
import { projectUsageSnapshot } from '../../src/runtime/usageSnapshot.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write('Usage: node --import tsx scripts/testing/check-usage-app.mts --apps-lock <path>\nRequires CATS_TEST_PLAYWRIGHT_MODULE and CATS_TEST_BROWSER_EXECUTABLE; no real user state is read.\n');
  process.exit(0);
}
const lockPath = args[args.indexOf('--apps-lock') + 1];
if (args.indexOf('--apps-lock') < 0 || !lockPath || !process.env.CATS_TEST_PLAYWRIGHT_MODULE || !process.env.CATS_TEST_BROWSER_EXECUTABLE) throw new Error('App lock and isolated browser test inputs are required.');
const root = await mkdtemp(path.join(tmpdir(), 'cats-usage-browser-'));
const chatStatePath = path.join(root, 'state', 'chat-state.local.json');
const apps = await resolveAppLock(path.resolve(lockPath));
const usage = apps.find((app) => app.id === 'cats.usage' && app.version === '0.1.0');
if (!usage) throw new Error('This smoke fixture targets Usage 0.1.0.');
await installRendererPackage({ chatStatePath, bytes: usage.bytes, pin: usage, source: 'local-package', enable: true });
const registry = new FileCatsAppRegistry({ registryPath: resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath });
const bundle = await build({ entryPoints: [fileURLToPath(new URL('./usage-app-smoke-renderer.tsx', import.meta.url))], bundle: true,
  format: 'esm', platform: 'browser', write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const js = bundle.outputFiles[0]!.contents;
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
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/smoke.js') { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(js); return; }
    if (url.pathname.startsWith('/api/')) {
      // Authentication is covered by auth-gate tests. This listener uses only throwaway fixtures.
      if (await routeAppPackageApi({ request, response, method: request.method ?? 'GET', url, dependencies: { config: { chatStatePath },
        runtimeClient: { getUsageSnapshot: async () => projectUsageSnapshot(await runtimeClient.getUsageSnapshot()) } } })) return;
      response.writeHead(404); response.end(); return;
    }
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f5f2"><div id="root"></div><script type="module" src="/smoke.js"></script></body></html>');
  } catch { response.writeHead(500); response.end('Fixture failure'); }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No fixture port');
const { chromium } = await import(pathToFileURL(process.env.CATS_TEST_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ executablePath: process.env.CATS_TEST_BROWSER_EXECUTABLE, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, locale: 'zh-TW' });
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  const frame = page.frameLocator('iframe[title="Usage"]');
  await frame.getByText('75%', { exact: true }).waitFor();
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
  assert.equal(await frame.getByText('尚未支援', { exact: true }).count(), 1);
  assert.equal(await frame.locator('.stat .cost').innerText(), 'USD 0.12\nEUR 0.12');
  const innerFrame = page.frames().find((candidate: { parentFrame(): unknown }) => candidate.parentFrame() !== null);
  assert.ok(innerFrame);
  await innerFrame.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const screenshotDir = path.resolve('build', 'usage-smoke'); await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, 'usage-desktop.png'), fullPage: true });
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
  await page.screenshot({ path: path.join(screenshotDir, 'usage-mobile.png'), fullPage: true });
  assert.equal(await innerFrame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await innerFrame.evaluate(() => { try { return !!parent.document.body; } catch { return false; } }), false);
  assert.equal(await innerFrame.evaluate(async () => { try { await fetch('/api/apps'); return true; } catch { return false; } }), false);
  await registry.updateAppState('cats.usage', { installState: 'disabled' });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await frame.getByRole('button', { name: '重新整理', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.deepEqual(errors, []);
  process.stdout.write(`${JSON.stringify({ ok: true, reads, app: { id: usage.id, version: usage.version, sha256: usage.sha256 }, screenshotDir, isolatedRegistry: root }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
