import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { encodeAppPackage } from '../packages/app-sdk/encode.js';
import { sha256 } from '../packages/app-sdk/format.js';
import { AppComponentHost } from '../build/server/platform/apps/componentHost.js';
import { installRendererPackage, installBundledApps } from '../build/server/platform/apps/packageInstaller.js';
import { FileCatsAppRegistry } from '../build/server/platform/apps/registry.js';
import { resolveCatsAppStoragePathsFromChatState } from '../build/server/platform/apps/paths.js';
import { parseAppComponents } from '../build/server/shared/catsAppComponents.js';
import { createFileProcessRecordRegistry } from '../build/server/platform/process/processRegistry.js';

const boot = { nonce: 'a'.repeat(32), locale: 'zh-TW', theme: 'light' };
const fixture = (version = '0.1.0', extra = {}) => {
  const components = { schemaVersion: 1, primaryFrontend: 'main',
    frontends: [{ id: 'main', entrypoint: 'ui/main.html' }, { id: 'history', entrypoint: 'ui/history.html' }],
    services: [{ id: 'api', entrypoint: 'service.mjs', routes: [{ path: '/api', methods: ['GET', 'POST'], exposure: 'private' }] },
      { id: 'mcp', entrypoint: 'service.mjs', dependsOn: ['api'], routes: [{ path: '/mcp', methods: ['POST'], exposure: 'external' }] }],
    workers: [{ id: 'worker', entrypoint: 'worker.mjs', dependsOn: ['api'] }], data: { schemaVersion: 1 }, ...extra.components };
  const manifest = { schemaVersion: 1, id: extra.id ?? 'test.ask', displayName: 'Fixture', version,
    category: 'user-app', trustTier: 'local-user', publisher: { name: 'Fixture' },
    compatibility: { catsPlatform: '^0.6.0', appSdk: '^1.3.0' }, components,
    permissions: ['ui.route', 'ui.lobby', 'storage.appData'], contributions: {
      lobbyApps: [{ id: 'main', title: 'Fixture', routePath: `/apps/${extra.id ?? 'test.ask'}` }] } };
  const service = `import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
    export async function start(c){return {async handle(req,res){
      if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;await writeFile(path.join(c.dataDir,'answer.txt'),body);res.end('saved');}
      else res.end(await readFile(path.join(c.dataDir,'answer.txt'),'utf8').catch(()=> 'empty'));
    }}}`;
  const files = [
    { path: 'ui/main.html', data: Buffer.from('<html><head></head><body>Main</body></html>') },
    { path: 'ui/history.html', data: Buffer.from('<html><head></head><body>History</body></html>') },
    { path: 'service.mjs', data: Buffer.from(extra.service ?? service) },
    { path: 'worker.mjs', data: Buffer.from(`import {writeFile} from 'node:fs/promises';import path from 'node:path';export async function start(c){await writeFile(path.join(c.dataDir,'worker.txt'),'started');return {close(){}}}`) },
    ...(extra.files ?? []),
  ];
  const bytes = encodeAppPackage({ manifest, files });
  return { bytes, pin: { id: manifest.id, version, sha256: sha256(bytes) }, components };
};

async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-components-'));
  const chatStatePath = path.join(root, 'state', 'chat-state.local.json');
  const host = new AppComponentHost({ chatStatePath, ownerId: 'owner', readinessTimeoutMs: 10_000 });
  const server = createServer((request, response) => {
    void host.route(request, response, host.testOrigin).then(handled => {
      if (!handled) response.writeHead(404).end();
    }).catch(() => response.writeHead(500).end());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  host.testOrigin = `http://127.0.0.1:${server.address().port}`;
  const registry = new FileCatsAppRegistry({ registryPath: resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath });
  t.after(async () => { await host.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const install = (input, enable = true) => installRendererPackage({ ...input, chatStatePath, source: 'local-package', enable, componentHost: host });
  return { host, registry, install, root, chatStatePath };
}

async function view(host, frontend, appId = 'test.ask', authority) {
  const surface = await host.open(appId, '0.1.0', boot, 'owner', frontend, authority);
  const url = new URL(surface.url, host.testOrigin).href;
  const response = await fetch(url); assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /sandbox allow-scripts;/);
  const html = await response.text();
  const token = /Bearer ([a-f0-9]{64})/.exec(html)?.[1]; assert.ok(token);
  return { ...surface, url, origin: `${host.testOrigin}/apps/${appId}`, html, headers: { Authorization: `Bearer ${token}` } };
}

test('one App runs two frontends, two services and a worker; native HTTP and revocation', async t => {
  const { host, registry, install } = await setup(t); await install(fixture());
  assert.equal((await registry.listInstalledApps()).length, 1);
  assert.deepEqual(host.status('test.ask').components, ['api', 'mcp', 'worker']);
  const main = await view(host); const history = await view(host, 'history');
  assert.equal(main.origin, history.origin); assert.match(history.html, /History/);
  assert.equal((await fetch(main.url)).status, 403, 'launch tickets are single use');
  assert.equal((await fetch(`${main.origin}/api`)).status, 401);
  assert.equal((await fetch(`${main.origin}/api`, { headers: { ...main.headers, Origin: 'http://other-app.invalid' } })).status, 403);
  assert.equal((await fetch(`${main.origin}/api`, { method: 'POST', headers: main.headers, body: 'answer 中文' })).status, 200);
  assert.equal(await (await fetch(`${history.origin}/api`, { headers: history.headers })).text(), 'answer 中文');
  const outside = main.origin;
  assert.equal((await fetch(`${outside}/api`, { headers: { Authorization: 'Bearer mcp-only' } })).status, 401);
  assert.equal((await fetch(`${outside}/mcp`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${outside}/_cats/open/anything`, { headers: main.headers })).status, 404);
  await assert.rejects(host.open('test.ask', '0.1.0', boot, 'other-owner'), /owner/);
  await host.setEnabled('test.ask', false);
  assert.equal((await fetch(`${main.origin}/api`, { headers: main.headers })).status, 404);
  assert.equal(host.status('test.ask').running, false);
  await host.setEnabled('test.ask', true);
  const reopened = await view(host);
  assert.equal(await (await fetch(`${reopened.origin}/api`, { headers: reopened.headers })).text(), 'answer 中文');
});

test('disabled install executes no worker; uninstall and reinstall retains App data', async t => {
  const { host, registry, install, root } = await setup(t); const pkg = fixture();
  const disabled = await install(pkg, false); assert.equal(host.status('test.ask').running, false);
  const data = path.join(root, 'apps', 'data', 'test.ask', 'generations', disabled.dataGeneration);
  assert.deepEqual(await readdir(data), []);
  await host.setEnabled('test.ask', true); const main = await view(host);
  await fetch(`${main.origin}/api`, { method: 'POST', headers: main.headers, body: 'keep' });
  await assert.rejects(host.remove('test.ask', true), /purge/);
  assert.equal((await registry.getInstalledApp('test.ask')).dataGeneration, disabled.dataGeneration);
  await host.remove('test.ask', false);
  const tombstone = (await registry.readState()).apps[0]; assert.equal(tombstone.installState, 'uninstalled');
  const restored = await install(pkg); assert.equal(restored.dataGeneration, disabled.dataGeneration);
  const reopened = await view(host); assert.equal(await (await fetch(`${reopened.origin}/api`, { headers: reopened.headers })).text(), 'keep');
});

test('two Apps share one origin with isolated grants and independent disable; owner revocation invalidates views', async t => {
  const { host, install } = await setup(t);
  await install(fixture()); await install(fixture('0.1.0', { id: 'test.other' }));
  let active = true;
  const first = await view(host, undefined, 'test.ask', { subject: 'owner', authorized: async () => active });
  const second = await view(host, undefined, 'test.other');
  assert.equal(new URL(first.url).origin, new URL(second.url).origin);
  assert.equal((await fetch(second.origin + '/api', { headers: first.headers })).status, 401);
  assert.equal((await fetch(first.origin + '/mcp', { method: 'POST', headers: first.headers })).status, 401);
  const preflight = await fetch(first.origin + '/api', { method: 'OPTIONS', headers: { Origin: 'null',
    'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'null');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  active = false;
  assert.equal((await fetch(first.origin + '/api', { headers: first.headers })).status, 401);
  await host.setEnabled('test.ask', false);
  assert.equal((await fetch(second.origin + '/api', { headers: second.headers })).status, 200);
  assert.equal((await fetch(first.origin + '/api', { headers: first.headers })).status, 404);
});

test('bundled component install shares host; concurrent close awaits every slow child and restart restores data', async t => {
  const { host, root, chatStatePath, registry } = await setup(t);
  const pkg = fixture('0.1.0', { service: `import {writeFile} from 'node:fs/promises';import path from 'node:path';
    export async function start(c){return {handle(req,res){res.end('ok')},async close(){
      await new Promise(r=>setTimeout(r,180));await writeFile(path.join(c.dataDir,c.componentId+'.closed'),'yes');
    }}}` });
  const artifact = 'test.ask-0.1.0.catsapp'; await writeFile(path.join(root, artifact), pkg.bytes);
  const lock = path.join(root, 'apps.lock.json');
  await writeFile(lock, JSON.stringify({ schemaVersion: 1, apps: [{ ...pkg.pin, artifact }] }));
  await installBundledApps(chatStatePath, lock, host);
  const record = await registry.getInstalledApp('test.ask');
  const first = host.close(); const second = host.close();
  assert.equal(first, second); await second;
  for (const id of ['api', 'mcp']) assert.equal(await readFile(path.join(root, 'apps', 'data', 'test.ask', 'generations', record.dataGeneration, id+'.closed'), 'utf8'), 'yes');
  const restarted = new AppComponentHost({ chatStatePath, ownerId: 'owner' });
  t.after(() => restarted.close()); await restarted.restore();
  assert.equal(restarted.status('test.ask').running, true);
  assert.equal((await registry.getInstalledApp('test.ask')).dataGeneration, record.dataGeneration);
  await restarted.close();
});

test('failed migration and readiness preserve active generation; successful upgrade snapshots and switches', async t => {
  const { host, registry, install, root } = await setup(t); const old = await install(fixture());
  const main = await view(host); await fetch(`${main.origin}/api`, { method: 'POST', headers: main.headers, body: 'original' });
  const bad = fixture('0.2.0', { components: { data: { schemaVersion: 2, migration: 'migrate.mjs' } }, files: [
    { path: 'migrate.mjs', data: Buffer.from(`export async function migrate(){throw new Error('fail')}`) }] });
  await assert.rejects(install(bad)); assert.equal((await registry.getInstalledApp('test.ask')).dataGeneration, old.dataGeneration);
  const good = fixture('0.2.1', { components: { data: { schemaVersion: 2, migration: 'migrate.mjs' } }, files: [
    { path: 'migrate.mjs', data: Buffer.from(`import {writeFile} from 'node:fs/promises';import path from 'node:path';export async function migrate(c){await writeFile(path.join(c.dataDir,'answer.txt'),'upgraded')}`) }] });
  const upgraded = await install(good); assert.notEqual(upgraded.dataGeneration, old.dataGeneration);
  const dataRoot = path.join(root, 'apps', 'data', 'test.ask', 'generations');
  assert.equal(await readFile(path.join(dataRoot, old.dataGeneration, 'answer.txt'), 'utf8'), 'original');
  assert.equal(await readFile(path.join(dataRoot, upgraded.dataGeneration, 'answer.txt'), 'utf8'), 'upgraded');
  const stuck = fixture('0.2.2', { components: { data: { schemaVersion: 2 } }, service: 'export async function start(){await new Promise(()=>{})}' });
  await assert.rejects(install(stuck)); assert.equal((await registry.getInstalledApp('test.ask')).dataGeneration, upgraded.dataGeneration);
});

test('component contracts reject cycles, missing dependencies, path escapes and route overlaps', () => {
  const { components } = fixture();
  for (const mutate of [
    x => { x.services[0].dependsOn = ['worker']; }, x => { x.services[0].dependsOn = ['missing']; },
    x => { x.frontends[0].entrypoint = '../outside.html'; }, x => { x.services[1].routes[0].path = '/api'; },
    x => { x.workers[0].id = 'api'; },
  ]) { const value = structuredClone(components); mutate(value); assert.throws(() => parseAppComponents(value)); }
});

test('disabling the App interrupts declared streams and revokes the origin', { timeout: 20_000 }, async t => {
  const { host, install } = await setup(t);
  await install(fixture('0.1.0', { components: { workers: [], services: [
    { id: 'api', entrypoint: 'service.mjs', routes: [{ path: '/api', methods: ['GET'], exposure: 'private' }] }] },
    service: `export async function start(){return {handle(req,res){
      res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: ready\\n\\n');
      const timer=setInterval(()=>res.write(': keepalive\\n\\n'),1000);res.on('close',()=>clearInterval(timer));
    }}}` }));
  const surface = await view(host);
  const response = await fetch(`${surface.origin}/api`, { headers: surface.headers });
  const reader = response.body.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value), /ready/);
  const ended = reader.read().then(result => result.done, () => true);
  await host.setEnabled('test.ask', false); assert.equal(await ended, true);
});

test('a repeatedly crashing component stops after two automatic restarts', async t => {
  const { host, install, root } = await setup(t);
  const record = await install(fixture('0.1.0', { components: { workers: [], services: [
    { id: 'api', entrypoint: 'service.mjs', routes: [{ path: '/api', methods: ['GET'], exposure: 'private' }] }] },
    service: `import {appendFile} from 'node:fs/promises';import path from 'node:path';
      export async function start(c){await appendFile(path.join(c.dataDir,'starts'),'x');
      setTimeout(()=>process.exit(1),300);return {handle(req,res){res.end('ok')}}}` }));
  const deadline = Date.now() + 35_000;
  while (!host.status('test.ask').error && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(host.status('test.ask').error ?? '', /repeated/);
  assert.equal(host.status('test.ask').running, false);
  assert.equal(await readFile(path.join(root, 'apps', 'data', 'test.ask', 'generations', record.dataGeneration, 'starts'), 'utf8'), 'xxx');
});

// PLAN-115 P1: stopping an App ends what its components started. The grandchild
// is detached on Windows (non-detached ones already end with the component
// through Node's kill-on-close job) and stays in the component's process group
// on POSIX, where the operating system would otherwise reparent and keep it.
const grandchildService = `import {spawn} from 'node:child_process';import {writeFile} from 'node:fs/promises';import path from 'node:path';
  export async function start(c){
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1e6)'],{stdio:'ignore',detached:process.platform==='win32'});
    await writeFile(path.join(c.dataDir,c.componentId+'-'+Date.now()+'.pid'),String(child.pid));
    return {handle(req,res){if(req.url==='/api/crash'){res.end('bye');setTimeout(()=>process.exit(1),50);return;}res.end('ok')}}}`;
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(check, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the process state.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function grandchildPids(dataDir) {
  const names = (await readdir(dataDir).catch(() => [])).filter(name => name.endsWith('.pid')).sort();
  return Promise.all(names.map(async name => Number(await readFile(path.join(dataDir, name), 'utf8'))));
}
const singleService = { workers: [], services: [
  { id: 'api', entrypoint: 'service.mjs', routes: [{ path: '/api', methods: ['GET'], exposure: 'private' }] }] };

test('disable, remove and a crash restart end the processes a component started', { timeout: 90_000 }, async t => {
  const { host, install, root } = await setup(t);
  const record = await install(fixture('0.1.0', { components: singleService, service: grandchildService }));
  const dataDir = path.join(root, 'apps', 'data', 'test.ask', 'generations', record.dataGeneration);
  await until(async () => (await grandchildPids(dataDir)).length === 1);
  const [first] = await grandchildPids(dataDir);
  t.after(() => { for (const pid of [first]) { try { process.kill(pid, 'SIGKILL'); } catch {} } });
  assert.equal(alive(first), true);
  await host.setEnabled('test.ask', false);
  await until(() => !alive(first));

  await host.setEnabled('test.ask', true);
  await until(async () => (await grandchildPids(dataDir)).length === 2);
  const second = (await grandchildPids(dataDir)).find(pid => pid !== first);
  const main = await view(host);
  assert.equal(await (await fetch(`${main.origin}/api/crash`, { headers: main.headers })).text(), 'bye');
  await until(async () => (await grandchildPids(dataDir)).length === 3, 30_000);
  await until(() => !alive(second));
  const third = (await grandchildPids(dataDir)).find(pid => pid !== first && pid !== second);
  assert.equal(alive(third), true, 'the restarted component runs its own subprocess');

  await host.remove('test.ask', false);
  await until(() => !alive(third));
});

test('the next host start ends component trees a crashed host left running', { timeout: 60_000 }, async t => {
  const { chatStatePath } = await setup(t);
  const recordPath = path.join(path.dirname(resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath), 'component-processes.json');
  const startedAt = Date.now();
  // A stand-in component: its own group on POSIX, with a grandchild that survives it.
  const script = `const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e6)'],`
    + `{stdio:'ignore',detached:process.platform==='win32'});process.stdout.write(String(c.pid));setInterval(()=>{},1e6)`;
  const component = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    detached: process.platform !== 'win32' });
  const grandchild = await new Promise(resolve => component.stdout.once('data', chunk => resolve(Number(String(chunk)))));
  t.after(() => { for (const pid of [component.pid, grandchild]) { try { process.kill(pid, 'SIGKILL'); } catch {} } });
  createFileProcessRecordRegistry(recordPath).record({ id: 'test.ask/api/crashed', processId: component.pid, startedAt });
  process.kill(component.pid, 'SIGKILL');
  await until(() => !alive(component.pid));
  assert.equal(alive(grandchild), true, 'the crash left the grandchild running');

  const next = new AppComponentHost({ chatStatePath, ownerId: 'owner', readinessTimeoutMs: 10_000 });
  t.after(() => next.close());
  await next.restore();
  await until(() => !alive(grandchild));
  assert.deepEqual(JSON.parse(await readFile(recordPath, 'utf8')), []);
});
