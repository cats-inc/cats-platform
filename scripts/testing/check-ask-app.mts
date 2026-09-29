#!/usr/bin/env node
// Built Ask package + actual App surface/IPC, temporary registry, real Node services and Electron clipboard.
// Usage: node --import tsx scripts/testing/check-ask-app.mts --apps-lock <path>
// Requires CATS_TEST_PLAYWRIGHT_MODULE and CATS_TEST_BROWSER_EXECUTABLE (Electron).
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { resolveAppLock } from '#cats-app-package';
import { AppComponentHost } from '../../src/platform/apps/componentHost.js';
import { installRendererPackage } from '../../src/platform/apps/packageInstaller.js';
import { routeAppPackageApi } from '../../src/app/server/appPackageRoutes.js';

const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('Usage: node --import tsx scripts/testing/check-ask-app.mts --apps-lock <path>'); process.exit(0); }
const lockPath = args[args.indexOf('--apps-lock') + 1];
if (args.indexOf('--apps-lock') < 0 || !lockPath || !process.env.CATS_TEST_PLAYWRIGHT_MODULE
  || !process.env.CATS_TEST_BROWSER_EXECUTABLE) throw new Error('App lock, Playwright module and Electron executable required.');
const root = await mkdtemp(path.join(tmpdir(), 'cats-ask-electron-'));
const chatStatePath = path.join(root, 'state', 'chat-state.local.json');
const host = new AppComponentHost({ chatStatePath, ownerId: 'desktop-owner' });
let server: ReturnType<typeof createServer> | undefined;
let browser: { close(): Promise<void>; firstWindow(): Promise<any>; evaluate(fn: any): Promise<any> } | undefined;
try {
const selected = (await resolveAppLock(path.resolve(lockPath))).find(app => app.id === 'cats.ask');
if (!selected) throw new Error('Select a built cats.ask package.');
await installRendererPackage({ chatStatePath, bytes: selected.bytes, pin: selected, source: 'local-package', enable: true, componentHost: host });
const key = randomBytes(32).toString('hex');
const bundle = await build({ entryPoints: [fileURLToPath(new URL('./ask-app-smoke-renderer.tsx', import.meta.url))],
  bundle: true, format: 'esm', platform: 'browser', write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (await host.route(request, response, origin)) return;
    if (url.pathname.startsWith('/api/')) {
      await routeAppPackageApi({ request, response, url, method: request.method ?? 'GET',
        dependencies: { config: { chatStatePath }, appComponents: host, desktopAppsKey: key } }); return;
    }
    if (url.pathname === '/fixture.js') { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(bundle.outputFiles[0].contents); return; }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
  })().catch(() => { response.writeHead(500).end(); });
});
await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture port.');
const origin = `http://127.0.0.1:${address.port}`;
const { _electron } = await import(pathToFileURL(process.env.CATS_TEST_PLAYWRIGHT_MODULE).href);
await mkdir(path.join(root, 'electron'), { recursive: true });
browser = await _electron.launch({ executablePath: process.env.CATS_TEST_BROWSER_EXECUTABLE,
  env: { ...process.env, CATS_ASK_SMOKE_PROFILE: path.join(root, 'electron'), CATS_ASK_SMOKE_ORIGIN: origin,
    CATS_ASK_SMOKE_KEY: key, CATS_ASK_SMOKE_PRELOAD: path.resolve('build/desktop/preload.cjs'),
    CATS_ASK_SMOKE_VALIDATOR: path.resolve('build/desktop/appRequests.js') },
  args: [fileURLToPath(new URL('./ask-app-smoke-electron.cjs', import.meta.url))] });
  const page = await browser!.firstWindow();
  const capture = async (name: string) => {
    const png = await browser!.evaluate(async ({ BrowserWindow }: typeof import('electron')) =>
      {
        const content = BrowserWindow.getAllWindows()[0].webContents;
        // A hidden window can still contain the previous compositor frame.
        await content.capturePage(undefined, { stayHidden: true, stayAwake: true });
        await new Promise(resolve => setTimeout(resolve, 100));
        return (await content.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64');
      });
    await writeFile(path.join(root, name), Buffer.from(png, 'base64'));
  };
  const errors: string[] = []; page.on('pageerror', (error: Error) => errors.push(error.message));
  const frame = page.frameLocator('iframe[title="Ask"]');
  await frame.getByRole('button', { name: 'Ask Grok Bot', exact: false }).waitFor();
  await capture('ask-home.png');
  await frame.getByRole('button', { name: 'Ask Grok Bot', exact: false }).click();
  await frame.getByRole('textbox', { name: '你的問題' }).fill('Cats Ask fixture：請總結三篇測試書籤');
  await frame.getByRole('button', { name: '建立問題', exact: true }).click();
  await frame.getByRole('heading', { name: '交給 Grok Bot' }).waitFor();
  await capture('ask-question.png');
  // Capture the fixture's deployment metadata, not a browser profile/session or real user secret.
  const appFrame = page.frames().find((item: { url(): string }) => item.url().includes('/apps/cats.ask/ui/'))!;
  assert.equal(await page.locator('iframe[title="Ask"]').getAttribute('sandbox'), 'allow-scripts');
  const isolated = await appFrame.evaluate(() => {
    let cookie = false; let storage = false; let host = false;
    try { document.cookie; } catch { cookie = true; }
    try { localStorage.getItem('host'); } catch { storage = true; }
    try { parent.document.body; } catch { host = true; }
    return { cookie, storage, parent: host };
  });
  assert.deepEqual(isolated, { cookie: true, storage: true, parent: true });
  const deployment = await appFrame.evaluate(() => (globalThis as unknown as { catsAppConnection: { baseUrl: string; headers: Record<string, string> } }).catsAppConnection);
  const api = async (route: string, body?: unknown) => {
    const response = await fetch(new URL(route.replace(/^\//, ''), new URL(deployment.baseUrl, origin)), { headers: { ...deployment.headers, 'content-type': 'application/json' },
      ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok); return response.json();
  };
  const question = (await api('/api/questions')).questions[0];
  const connection = await api('/api/connection');
  const prepared = await api(`/api/questions/${question.id}/prepare`, {});
  const attempt = { requestId: prepared.requestId, attemptId: prepared.attemptId, attemptToken: prepared.attemptToken };
  const external = `${origin}/apps/cats.ask`;
  const rpc = async (method: string, params: unknown) => {
    const response = await fetch(`${external}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${connection.token}`,
      'content-type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }) });
    assert.equal(response.status, 200); return response.json();
  };
  await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fixture', version: '1.0.0' } });
  const fetched = await rpc('tools/call', { name: 'cats_get_question', arguments: attempt });
  assert.equal(fetched.result.structuredContent.question, question.question);
  await page.locator('#toggle').click(); // Background work survives closing the frontend.
  const content = { outcome: 'partial', answer: 'Cats Ask fixture 中文回答\n第二行 <script>malicious()</script>',
    sources: [{ title: '測試來源', url: 'https://example.com/post' }], limitations: '測試資料，沒有收藏時間戳。', evidence: 'Fixture connector only' };
  const submitted = await rpc('tools/call', { name: 'cats_submit_answer', arguments: { ...attempt, response: content } });
  assert.equal(submitted.result.structuredContent.accepted, true);
  await page.locator('#toggle').click();
  await frame.getByRole('button', { name: /Cats Ask fixture：/ }).click();
  await frame.getByRole('button', { name: '複製回答', exact: true }).waitFor();
  assert.equal(await frame.locator('.answer-body').first().textContent(), content.answer);
  assert.equal(await frame.locator('script').count(), 2, 'answer text never creates script nodes');
  await frame.getByRole('button', { name: '複製回答', exact: true }).click();
  await frame.getByRole('status').filter({ hasText: '已複製' }).waitFor();
  await page.locator('#paste-target').focus(); await page.keyboard.press('Control+V');
  const copied = await page.locator('#paste-target').inputValue();
  assert.ok(copied.startsWith(content.answer)); assert.ok(copied.includes('https://example.com/post'));
  await capture('ask-answer.png');
  // A failed host clipboard write must not show a success message.
  await page.evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText() { throw new DOMException('Denied', 'NotAllowedError'); } } })");
  await frame.getByRole('button', { name: '複製回答', exact: true }).click();
  await frame.getByRole('status').filter({ hasText: '無法寫入剪貼簿' }).waitFor();
  await frame.getByRole('button', { name: '以這個問題重新提問', exact: true }).click();
  if (await frame.locator('details.card').getAttribute('open') === null) await frame.locator('details.card > summary').click();
  await frame.getByRole('button', { name: '開啟 Cats 遠端連線設定', exact: true }).click();
  await page.waitForURL('**/settings/remote-access');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, platform: process.platform, electron: true,
    installedArchive: selected.sha256, reopen: true, mcp: true, clipboard: true, clipboardDenial: true,
    opaqueIsolation: true, hostSettingsNavigation: true, evidenceRoot: root }));
} finally {
  await Promise.allSettled([browser?.close(), host.close()]);
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  // Keep screenshots only, remove temporary private registry/data/profile.
  for (const name of ['apps', 'electron', 'state']) await rm(path.join(root, name), { recursive: true, force: true });
}
