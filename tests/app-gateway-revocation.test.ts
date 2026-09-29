import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createAppGateway } from '../src/platform/apps/componentGateway.ts';
import type { AppProcess } from '../src/platform/apps/componentProcess.ts';

test('closing a gateway cancels requests still awaiting authorization before they reach a component', async t => {
  let authorize: ((value: boolean) => void) | undefined;
  let calls = 0;
  let allowImmediate = false;
  let bridgeAuthorize: ((value: boolean) => void) | undefined;
  const component = createServer((_request, response) => { calls++; response.end('should not run'); });
  await new Promise<void>(resolve => component.listen(0, '127.0.0.1', resolve));
  const address = component.address(); assert.ok(address && typeof address !== 'string');
  const gateway = await createAppGateway({ appId: 'test.ask', version: '0.1.0',
    authorized: () => allowImmediate ? Promise.resolve(true) : new Promise(resolve => { authorize = resolve; }),
    files: new Map(), processes: new Map([['mcp', { url: `http://127.0.0.1:${address.port}`, key: 'fixture' } as AppProcess]]),
    components: { schemaVersion: 1, primaryFrontend: 'main', frontends: [{ id: 'main', entrypoint: 'main.html' }],
      services: [{ id: 'mcp', entrypoint: 'service.mjs', dependsOn: [], routes: [{ path: '/mcp', methods: ['POST'], exposure: 'external' }] }],
      workers: [], data: { schemaVersion: 1 } } });
  const server = createServer((request, response) => { void gateway.handle(request, response, 'https://cats.example'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await gateway.close(); component.closeAllConnections(); server.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => component.close(() => resolve())), new Promise<void>(resolve => server.close(() => resolve()))]);
  });
  const bound = server.address(); assert.ok(bound && typeof bound !== 'string');
  const response = fetch(`http://127.0.0.1:${bound.port}/apps/test.ask/mcp`, { method: 'POST', headers: { Authorization: 'Bearer ' + 'f'.repeat(64) } });
  while (!authorize) await new Promise(resolve => setTimeout(resolve, 5));
  allowImmediate = true;
  gateway.open(undefined, { nonce: 'n'.repeat(32) }, 'owner',
    { subject: 'owner', authorized: () => new Promise(resolve => { bridgeAuthorize = resolve; }) });
  const bridge = gateway.authorizeBridge('n'.repeat(32));
  while (!bridgeAuthorize) await new Promise(resolve => setTimeout(resolve, 5));
  await gateway.close(); authorize(true); bridgeAuthorize(true);
  assert.equal((await response).status, 409); assert.equal(calls, 0);
  assert.equal(await bridge, false);
});
