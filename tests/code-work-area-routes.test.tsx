import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { routeCodeWorkAreasApi } from '../src/products/code/api/workAreaRoutes.ts';
import { createCodeWorkAreasService, type CodeWorkAreasService } from '../src/products/code/state/workAreas.ts';
import { workAreaContext, runtimeInspection } from './fixtures/workAreas.ts';

async function serve(t: test.TestContext, service?: CodeWorkAreasService) {
  const server = createServer(async (request, response) => {
    if (!await routeCodeWorkAreasApi({ request, response, method: request.method ?? 'GET',
      url: new URL(request.url!, 'http://localhost'), dependencies: { workAreas: service } })) {
      response.writeHead(404); response.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/api/code/conversations/conversation-a/work-areas`;
}

test('Code JSON and SSE routes expose the same bounded projection and abort on client close', async t => {
  const context = workAreaContext();
  let streamAborted = false;
  const service = createCodeWorkAreasService({ inspector: { read: async () => context }, runtime: {
    observeSession: async () => runtimeInspection(context),
    streamSession: async (_id, _event, options) => new Promise<void>(resolve => {
      options!.signal!.addEventListener('abort', () => { streamAborted = true; resolve(); }, { once: true });
    }),
  } });
  const url = await serve(t, service);
  const json = await (await fetch(url)).json();
  const abort = new AbortController();
  const response = await fetch(url, { headers: { accept: 'text/event-stream' }, signal: abort.signal });
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  let text = '';
  while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
  assert.match(text, /^event: work_areas\n/);
  assert.deepEqual(JSON.parse(text.split('data: ')[1].trim()), json);
  abort.abort(); await reader.cancel().catch(() => {});
  const deadline = Date.now() + 3000;
  while (!streamAborted && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(streamAborted, true);
});

test('Code route rejects unavailable, non-Code, foreign and revoked conversations', async t => {
  assert.equal((await fetch(await serve(t))).status, 503);
  const context = workAreaContext();
  const service = createCodeWorkAreasService({ inspector: { read: async () => structuredClone(context) }, runtime: {
    observeSession: async () => runtimeInspection(context), streamSession: async () => {},
  } });
  const url = await serve(t, service);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  assert.equal((await fetch(url.replace('conversation-a', 'foreign'))).status, 404);
  context.origin = 'work'; assert.equal((await fetch(url)).status, 404);
  context.origin = 'code'; context.owned = false;
  assert.equal((await fetch(url, { headers: { accept: 'text/event-stream' } })).status, 404);
  context.owned = true;
  let release!: () => void; let started = false;
  const payload = runtimeInspection(context);
  const delayed = createCodeWorkAreasService({ inspector: { read: async () => structuredClone(context) }, runtime: {
    observeSession: async () => { started = true; await new Promise<void>(resolve => { release = resolve; }); return payload; },
    streamSession: async () => {},
  } });
  const request = fetch(await serve(t, delayed));
  while (!started) await new Promise(resolve => setTimeout(resolve, 5));
  context.owned = false; release();
  assert.equal((await request).status, 404);
});

test('a live subscription limit returns a typed unavailable event after headers', async t => {
  const url = await serve(t, { authorized: async () => true, read: async () => null,
    watch: async () => { throw new Error('work_area_watch_limit'); } });
  const response = await fetch(url, { headers: { accept: 'text/event-stream' } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'event: work_areas_unavailable\ndata: null\n\n');
});
