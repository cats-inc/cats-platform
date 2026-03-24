import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
