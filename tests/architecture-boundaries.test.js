import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

async function* walkSourceFiles(rootDirectory) {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const resolvedPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      yield* walkSourceFiles(resolvedPath);
      continue;
    }
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) {
      continue;
    }
    yield resolvedPath;
  }
}

test('platform orchestrator dispatch stays behind an injected channel router seam', async () => {
  const source = await readFile(
    new URL('../src/platform/orchestration/dispatch.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /\bchannelRouter\b/u);
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/model\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/runtimeActions\.js/u,
  );
});

test('app server wires the chat orchestrator adapter into platform orchestration', async () => {
  const source = await readFile(
    new URL('../src/app/server/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /chatOrchestratorChannelRouter/u);
  assert.match(source, /orchestratorChannelRouter/u);
});

test('platform orchestrator planner stays behind an injected planner surface seam', async () => {
  const source = await readFile(
    new URL('../src/platform/orchestration/planner.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /\bplannerSurface\b/u);
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/model\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/mentionRouter\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/roomRouting\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/shared\/operatorLoop\.js/u,
  );
  assert.doesNotMatch(
    source,
    /shared\/app-shell\.js/u,
  );
});

test('platform orchestrator contracts own their operator-loop view types', async () => {
  const source = await readFile(
    new URL('../src/platform/orchestration/contracts.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export interface OrchestratorOperatorView/u);
  assert.match(source, /export interface OrchestratorRunInspectorView/u);
  assert.match(source, /export interface OrchestratorChannelView/u);
  assert.match(source, /export interface OrchestratorParticipantExecutionLease/u);
  assert.doesNotMatch(
    source,
    /products\/chat\/shared\/operatorLoop\.js/u,
  );
  assert.doesNotMatch(
    source,
    /\bChatChannelView\b/u,
  );
  assert.doesNotMatch(
    source,
    /\bChatChannelCat\b/u,
  );
  assert.doesNotMatch(
    source,
    /\bParticipantExecutionLease\b/u,
  );
  assert.doesNotMatch(
    source,
    /shared\/app-shell\.js/u,
  );
  assert.match(source, /export interface OrchestratorStateView/u);
  assert.match(source, /export interface OrchestratorDispatchResult/u);
});

test('shared room-routing contracts are extracted from chat api contracts', async () => {
  const chatContracts = await readFile(
    new URL('../src/products/chat/api/contracts.ts', import.meta.url),
    'utf8',
  );
  const appShell = await readFile(
    new URL('../src/shared/app-shell.ts', import.meta.url),
    'utf8',
  );

  assert.match(chatContracts, /shared\/roomRouting\.js/u);
  assert.doesNotMatch(
    chatContracts,
    /export interface RoomRoutingState/u,
  );
  assert.match(appShell, /from '\.\/roomRouting\.js'/u);
});

test('chat and server internals do not import the app-shell compatibility barrel', async () => {
  const srcRootPath = fileURLToPath(new URL('../src', import.meta.url));
  const sourceRoots = [
    new URL('../src/products/chat', import.meta.url),
    new URL('../src/server/routes', import.meta.url),
    new URL('../src/shared/channelPaths.ts', import.meta.url),
  ];

  for (const sourceRoot of sourceRoots) {
    if (sourceRoot.pathname.endsWith('.ts')) {
      const source = await readFile(sourceRoot, 'utf8');
      assert.doesNotMatch(source, /shared\/app-shell(?:\.js|\.ts)?/u);
      continue;
    }

    for await (const filePath of walkSourceFiles(fileURLToPath(sourceRoot))) {
      const relativePath = path.relative(srcRootPath, filePath);
      const source = await readFile(filePath, 'utf8');
      assert.doesNotMatch(
        source,
        /shared\/app-shell(?:\.js|\.ts)?/u,
        `unexpected app-shell import in ${relativePath}`,
      );
    }
  }
});

test('chat internals use the product channel-paths module instead of the shared compatibility shim', async () => {
  const productChatPath = fileURLToPath(new URL('../src/products/chat', import.meta.url));

  for await (const filePath of walkSourceFiles(productChatPath)) {
    const relativePath = path.relative(productChatPath, filePath);
    const source = await readFile(filePath, 'utf8');
    assert.doesNotMatch(
      source,
      /(?:\.\.\/){3,}shared\/channelPaths(?:\.js|\.ts)?/u,
      `unexpected shared channelPaths import in ${relativePath}`,
    );
  }
});

test('runtimeActions consumes dedicated room-routing workflow helpers instead of defining them inline', async () => {
  const runtimeActions = await readFile(
    new URL('../src/products/chat/state/runtimeActions.ts', import.meta.url),
    'utf8',
  );
  const workflowModule = await readFile(
    new URL('../src/products/chat/state/roomRoutingRuntime.ts', import.meta.url),
    'utf8',
  );

  assert.match(runtimeActions, /roomRoutingRuntime\.js/u);
  assert.doesNotMatch(runtimeActions, /function createWorkflowTurn\(/u);
  assert.doesNotMatch(runtimeActions, /function addWorkflowCheckpoint\(/u);
  assert.match(workflowModule, /export function createWorkflowTurn/u);
  assert.match(workflowModule, /export function addWorkflowCheckpoint/u);
});

test('store consumes dedicated room-routing snapshot normalization instead of defining it inline', async () => {
  const storeSource = await readFile(
    new URL('../src/products/chat/state/store.ts', import.meta.url),
    'utf8',
  );
  const snapshotModule = await readFile(
    new URL('../src/products/chat/state/roomRoutingSnapshot.ts', import.meta.url),
    'utf8',
  );

  assert.match(storeSource, /roomRoutingSnapshot\.js/u);
  assert.doesNotMatch(storeSource, /function normalizeRoomRouting\(/u);
  assert.doesNotMatch(storeSource, /function normalizeRoomWorkflowTurn\(/u);
  assert.match(snapshotModule, /export function normalizeRoomRouting/u);
});

test('platform consumes room-routing types from the shared roomRouting module', async () => {
  const orchestratorContracts = await readFile(
    new URL('../src/platform/orchestration/contracts.ts', import.meta.url),
    'utf8',
  );
  const telegramBridge = await readFile(
    new URL('../src/platform/transports/telegram/bridge.ts', import.meta.url),
    'utf8',
  );

  assert.match(orchestratorContracts, /shared\/roomRouting\.js/u);
  assert.match(telegramBridge, /shared\/roomRouting\.js/u);
});

test('platform memory service stays behind a chat memory surface seam', async () => {
  const source = await readFile(
    new URL('../src/platform/memory/service.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /\bMemoryChatSurface\b/u);
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/model\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/store\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/companionBoxStore\.js/u,
  );
});

test('app server wires the chat memory adapter into platform memory', async () => {
  const source = await readFile(
    new URL('../src/app/server/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /createChatMemorySurface/u);
  assert.match(source, /createCatsMemoryService/u);
});

test('chat owns the companion canonical-sync adapter instead of platform memory', async () => {
  const source = await readFile(
    new URL('../src/products/chat/state/companionMemoryAdapter.ts', import.meta.url),
    'utf8',
  );
  const memoryIndex = await readFile(
    new URL('../src/platform/memory/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /CompanionBoxStore/u);
  assert.match(source, /CatsMemoryService/u);
  assert.doesNotMatch(
    memoryIndex,
    /createMemoryAwareCompanionBoxStore/u,
  );
});

test('platform runtime maintenance only depends on the memory-owned companion surface', async () => {
  const source = await readFile(
    new URL('../src/platform/memory/runtimeMaintenance.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /\bMemoryCompanionSurface\b/u);
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/companionBoxStore\.js/u,
  );
});

test('platform memory owns companion projection types instead of importing chat companion contracts', async () => {
  const contracts = await readFile(
    new URL('../src/platform/memory/contracts.ts', import.meta.url),
    'utf8',
  );
  const extraction = await readFile(
    new URL('../src/platform/memory/extraction.ts', import.meta.url),
    'utf8',
  );
  const retrieval = await readFile(
    new URL('../src/platform/memory/retrieval.ts', import.meta.url),
    'utf8',
  );

  assert.match(contracts, /export interface MemoryCompanionSourceRecord/u);
  assert.match(contracts, /export interface MemoryCompanionDerivedRecord/u);
  assert.match(contracts, /export interface MemoryCompanionMemoryRecord/u);
  assert.doesNotMatch(
    contracts,
    /products\/chat\/companion\/contracts\.js/u,
  );
  assert.doesNotMatch(
    extraction,
    /products\/chat\/companion\/contracts\.js/u,
  );
  assert.doesNotMatch(
    retrieval,
    /products\/chat\/companion\/contracts\.js/u,
  );
});

test('platform telegram bridge stays behind an injected room bridge seam', async () => {
  const source = await readFile(
    new URL('../src/platform/transports/telegram/bridge.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /\broomBridge\b/u);
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/model\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/runtimeActions\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/memoryLayers\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/store\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/companionBoxStore\.js/u,
  );
  assert.doesNotMatch(
    source,
    /shared\/app-shell\.js/u,
  );
  assert.match(source, /export interface TelegramRoomBridgeState/u);
});

test('platform telegram polling stays behind an injected room bridge seam', async () => {
  const source = await readFile(
    new URL('../src/platform/transports/telegram/polling.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /\broomBridge\b/u);
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/store\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/state\/companionBoxStore\.js/u,
  );
});

test('app server wires the chat telegram bridge adapter into platform transports', async () => {
  const source = await readFile(
    new URL('../src/app/server/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /createChatTelegramRoomBridge/u);
  assert.match(source, /telegramRoomBridge/u);
});
