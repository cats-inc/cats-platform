import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createServer as createNetServer, connect } from 'node:net';
import { request } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ingressServiceUrl } from '#cats-app-package';
import { createPlatformIngressListener } from '../src/platform/apps/ingressBoundary.ts';
import { startAppProcess } from '../src/platform/apps/componentProcess.ts';

const token = 'fixture-private-ngrok-token-12345';
async function fixture(t: TestContext, holdClose: boolean) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-ingress-worker-'));
  const boundary = await createPlatformIngressListener({ port: 0, origin: () => 'https://fixture.example',
    ready: async () => true, dispatch: async (req, res) => {
      let size = 0; for await (const part of req) size += Buffer.byteLength(part);
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ size, route: req.url }));
    } });
  const entrypoint = path.join(root, 'fixture.mjs');
  const moduleUrl = ingressServiceUrl.href;
  await writeFile(entrypoint, `import {start as realStart} from ${JSON.stringify(moduleUrl)};
export async function start(context) {
  if(context.ingress.authtoken!==${JSON.stringify(token)}) throw new Error('Missing IPC credential');
  return realStart(context,{forward:async()=>({url:()=> 'https://fixture.example', close:async()=>{
    process.send({type:'fixture-closing'});
    if(${holdClose}) await new Promise(resolve=>process.on('message',message=>{if(message?.type==='fixture-release')resolve();}));
  }})});
}`);
  let inherited = '';
  const spawn = cp.spawn;
  const capture = t.mock.method(cp, 'spawn', (...args: Parameters<typeof spawn>) => {
    const value = (args[2] as { env?: NodeJS.ProcessEnv } | undefined)?.env?.CATS_APP_COMPONENT;
    if (value) inherited = value;
    return spawn(...args);
  });
  syncBuiltinESMExports();
  let worker: Awaited<ReturnType<typeof startAppProcess>> | undefined;
  t.after(async () => { boundary.revoke(); await worker?.stop(); await boundary.close(); await rm(root, { recursive: true, force: true }); });
  try { worker = await startAppProcess({ kind: 'ingress', entrypoint,
    context: { appId: 'cats.platform', componentId: 'ingress', dataDir: root, services: {},
      ingress: { target: boundary.target, authtoken: token } }, onIngressSocket: socket => boundary.accept(socket) }); }
  finally { capture.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(inherited.includes(token), false);
  return { worker, boundary };
}
function post(base: string, body: string) {
  return new Promise<{ size: number; route: string }>((resolve, reject) => {
    const req = request(base + '/apps/fixture/mcp', { method: 'POST', headers: {
      Host: 'fixture.example', 'content-length': Buffer.byteLength(body), Connection: 'close',
    } }, res => { let text = ''; res.setEncoding('utf8'); res.on('data', part => { text += part; });
      res.on('end', () => { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } }); });
    req.once('error', reject); req.end(body);
  });
}
async function occupied(port: number) {
  const server = createNetServer();
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return false; }
  catch (error) { assert.equal((error as NodeJS.ErrnoException).code, 'EADDRINUSE'); return true; }
  finally { if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('worker-owned forwarding preserves fast HTTP bodies over private socket IPC and keeps secrets out of env', { timeout: 30_000 }, async t => {
  const { worker } = await fixture(t, false); assert.ok(worker.url);
  const body = 'fixture中文'.repeat(1024);
  const replies = await Promise.all(Array.from({ length: 12 }, () => post(worker.url!, body)));
  for (const reply of replies) { assert.equal(reply.size, Buffer.byteLength(body)); assert.equal(reply.route, '/apps/fixture/mcp'); }
});

test('worker keeps its forwarding target reserved until SDK cleanup or process exit', { timeout: 30_000 }, async t => {
  const { worker, boundary } = await fixture(t, true); assert.ok(worker.url);
  const port = Number(new URL(worker.url).port);
  const closing = new Promise<void>(resolve => worker.child.on('message', value => {
    if ((value as { type?: string })?.type === 'fixture-closing') resolve();
  }));
  boundary.revoke(); const stopping = worker.stop(); await closing;
  assert.equal(await occupied(port), true);
  worker.child.send!({ type: 'fixture-release' }, () => {});
  await stopping; assert.equal(await occupied(port), false);
});

test('parent IPC loss cannot release a live forwarder target for another process to reuse', { timeout: 30_000 }, async t => {
  const { worker } = await fixture(t, true); assert.ok(worker.url);
  const port = Number(new URL(worker.url).port);
  const exited = new Promise(resolve => worker.child.once('exit', resolve));
  worker.child.disconnect();
  assert.equal(await occupied(port), true);
  await exited; assert.equal(await occupied(port), false);
});

test('resetting rejected clients during cleanup cannot crash the forwarding worker', { timeout: 30_000 }, async t => {
  const { worker, boundary } = await fixture(t, true); assert.ok(worker.url);
  const port = Number(new URL(worker.url).port);
  const closing = new Promise<void>(resolve => worker.child.on('message', value => {
    if ((value as { type?: string })?.type === 'fixture-closing') resolve();
  }));
  boundary.revoke(); const stopping = worker.stop(); await closing;
  for (let i = 0; i < 16; i++) await new Promise<void>((resolve, reject) => {
    const client = connect(port, '127.0.0.1', () => { client.resetAndDestroy(); resolve(); });
    client.on('error', reject);
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(worker.child.exitCode, null); assert.equal(await occupied(port), true);
  worker.child.send!({ type: 'fixture-release' }, () => {});
  await stopping;
});
