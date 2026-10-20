import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDefaultCoreState, upsertCoreTask, upsertCoreArtifact, upsertCoreRun } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { buildCodeWorkspaceListProjection, buildCodeWorkspaceDetailProjection } from '../src/products/code/api/projection.ts';
import { applyCodespaceAction, codespaceRemovalBlockers } from '../src/products/code/state/codespaceManagement.ts';
import { routeCodeWorkspaceApi } from '../src/products/code/api/workspaceRoutes.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { buildPersistedChatSnapshot } from '../src/products/chat/state/core-snapshot/index.ts';

function fixture() {
  let core = upsertCoreTask(createDefaultCoreState(), { id: 'code-task', title: 'Build report', status: 'completed', metadata: {
    planning: { productHint: 'code' }, codeWorkspace: { workspacePath: 'C:/owner/repository', workspaceKind: 'user_selected', ownershipState: 'owner_selected' },
  } }).core;
  core = upsertCoreArtifact(core, { id: 'report', title: 'Report', kind: 'report', taskId: 'code-task', path: 'report.md', status: 'ready' }).core;
  const workspace = buildCodeWorkspaceListProjection(core, 'all').workspaces[0];
  assert.ok(workspace);
  return { core, id: workspace.id };
}

test('owner controls pin/archive/restore independently and removal keeps source work and survives snapshot rebuild', async () => {
  const { core, id } = fixture();
  const store = new MemoryChatStore(buildPersistedChatSnapshot(createDefaultChatState(), core));
  let next = await store.readCore();
  assert.equal(buildCodeWorkspaceDetailProjection(next, id)?.workspace.management?.pinned, false);
  for (const action of ['pin', 'unpin', 'archive', 'restore', 'remove'] as const) {
    next = await store.updateCore(current => applyCodespaceAction(current, id, { action, revision: current.ownerLifecycle?.revision ?? 0 }));
  }
  assert.equal(buildCodeWorkspaceListProjection(next).workspaces.length, 0);
  assert.equal(buildCodeWorkspaceListProjection(next, 'removed').workspaces.length, 1);
  assert.equal(next.tasks.length, core.tasks.length);
  assert.equal(next.artifacts[0].path, 'report.md');
  await store.write(await store.read());
  next = await store.readCore();
  assert.equal(buildCodeWorkspaceListProjection(next).workspaces.length, 0);
  next = await store.updateCore(current => applyCodespaceAction(current, id, { action: 'restore', revision: current.ownerLifecycle!.revision }));
  assert.equal(buildCodeWorkspaceListProjection(next).workspaces[0].id, id);
});

test('source disappearance retains a restorable folder registration and rename does not alter its identity', () => {
  const { core, id } = fixture();
  let next = applyCodespaceAction(core, id, { action: 'rename', label: 'My project', revision: 0 });
  next = { ...next, tasks: [], artifacts: [] };
  const workspace = buildCodeWorkspaceDetailProjection(next, id)!.workspace;
  assert.equal(workspace.title, 'My project');
  assert.equal(workspace.path, 'C:/owner/repository');
  assert.equal(workspace.source, 'owner_selected');
});

test('active runs and previews block removal, stale or malformed commands cannot mutate intent', () => {
  const { core, id } = fixture();
  const running = upsertCoreRun(core, { id: 'running', title: 'Active attempt', taskId: 'code-task', status: 'running' }).core;
  assert.throws(() => applyCodespaceAction(running, id, { action: 'remove', revision: 0 }), /Stop active work/);
  const previews = { listLeases: () => [{ workspaceRef: { rootPath: 'C:/owner/repository' }, surface: { kind: 'code_codespace', surfaceId: id }, status: 'ready', previewId: 'p' }] };
  assert.equal(codespaceRemovalBlockers(core, id, previews as never).length, 1);
  assert.throws(() => applyCodespaceAction(core, id, { action: 'remove', revision: 10 }), /Refresh/);
  assert.throws(() => applyCodespaceAction(core, id, null as never), /required/);
  assert.equal(core.ownerLifecycle, undefined);
});

test('folder registration API validates existing paths and revisions without creating directories', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-codespace-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new MemoryCoreStore();
  const server = createServer(async (request, response) => {
    const handled = await routeCodeWorkspaceApi({ request, response, method: request.method!, url: new URL(request.url!, 'http://localhost'), dependencies: { coreStore: store } as never });
    if (!handled) { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = (server.address() as { port: number }).port;
  const register = (folder: string, revision: number) => fetch(`http://127.0.0.1:${port}/api/code/codespaces/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: folder, revision }) });
  assert.equal((await register(path.join(dir, 'missing'), 0)).status, 400);
  assert.equal((await register(dir, 1)).status, 409);
  assert.equal((await register(dir, 0)).status, 200);
  assert.equal(buildCodeWorkspaceListProjection(await store.readCore()).workspaces[0].path, dir);
});
