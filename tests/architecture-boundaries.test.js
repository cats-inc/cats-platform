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

test('app server dependency resolver wires the chat orchestrator adapter into platform orchestration', async () => {
  const source = await readFile(
    new URL('../src/app/server/dependencies.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /chatOrchestratorChannelRouter/u);
  assert.match(source, /orchestratorChannelRouter/u);
});

test('app server composes dedicated dependency and routing modules instead of owning route assembly inline', async () => {
  const source = await readFile(
    new URL('../src/app/server/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /resolveServerDependencies/u);
  assert.match(source, /reconcilePollingOnStartup/u);
  assert.match(source, /routeRequest/u);
  assert.doesNotMatch(source, /async function routeRequest/u);
  assert.doesNotMatch(source, /async function reconcilePollingOnStartup/u);
  assert.doesNotMatch(source, /function createDefaultTelegramRelay/u);
});

test('app server request router owns shell, provider, transport, and static-route assembly', async () => {
  const source = await readFile(
    new URL('../src/app/server/requestRouter.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /routeCoreApi/u);
  assert.match(source, /routeChatApi/u);
  assert.match(source, /handleProviderRegistry/u);
  assert.match(source, /handleTelegramWebhook/u);
  assert.match(source, /tryServeWebAsset/u);
});

test('app server dependency resolver wires the chat task-execution locator into core lifecycle routes', async () => {
  const source = await readFile(
    new URL('../src/app/server/dependencies.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /createChatTaskExecutionLocator/u);
  assert.match(source, /taskExecutionLocator/u);
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
    /products\/chat\/state\/room-routing\/index\.js/u,
  );
  assert.doesNotMatch(
    source,
    /products\/chat\/shared\/operator-loop\/index\.js/u,
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
    /products\/chat\/shared\/operator-loop\/index\.js/u,
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

test('platform orchestrator execution is a thin facade over dedicated execution plan modules', async () => {
  const executionModule = await readFile(
    new URL('../src/platform/orchestration/execution/index.ts', import.meta.url),
    'utf8',
  );
  const sharedModule = await readFile(
    new URL('../src/platform/orchestration/execution/shared.ts', import.meta.url),
    'utf8',
  );
  const preDispatchModule = await readFile(
    new URL('../src/platform/orchestration/execution/preDispatch.ts', import.meta.url),
    'utf8',
  );
  const workflowModule = await readFile(
    new URL('../src/platform/orchestration/execution/workflow.ts', import.meta.url),
    'utf8',
  );

  assert.match(executionModule, /preDispatch\.js/u);
  assert.match(executionModule, /workflow\.js/u);
  assert.match(executionModule, /shared\.js/u);
  assert.doesNotMatch(executionModule, /function buildApprovalGate\(/u);
  assert.doesNotMatch(executionModule, /function buildEventStep\(/u);
  assert.match(sharedModule, /export function buildApprovalGate/u);
  assert.match(preDispatchModule, /export function buildPreDispatchExecutionPlan/u);
  assert.match(workflowModule, /export function buildExecutionPlanFromChannel/u);
});

test('chat operator loop composes dedicated metadata and action helper modules', async () => {
  const operatorLoopModule = await readFile(
    new URL('../src/products/chat/shared/operator-loop/index.ts', import.meta.url),
    'utf8',
  );
  const metadataModule = await readFile(
    new URL('../src/products/chat/shared/operator-loop/metadata.ts', import.meta.url),
    'utf8',
  );
  const actionsModule = await readFile(
    new URL('../src/products/chat/shared/operator-loop/actions.ts', import.meta.url),
    'utf8',
  );

  assert.match(operatorLoopModule, /metadata\.js/u);
  assert.match(operatorLoopModule, /actions\.js/u);
  assert.match(operatorLoopModule, /types\.js/u);
  assert.doesNotMatch(operatorLoopModule, /function readMetadataRecord\(/u);
  assert.doesNotMatch(operatorLoopModule, /function buildIncidentActions\(/u);
  assert.match(metadataModule, /export function readMetadataRecord/u);
  assert.match(metadataModule, /export function resolveCooldownLabel/u);
  assert.match(actionsModule, /export function buildIncidentActions/u);
  assert.match(actionsModule, /export function buildActivityFeed/u);
});

test('telegram relay composes dedicated status, ingress, and delivery helper modules', async () => {
  const relayModule = await readFile(
    new URL('../src/platform/transports/telegram/relay/index.ts', import.meta.url),
    'utf8',
  );
  const statusModule = await readFile(
    new URL('../src/platform/transports/telegram/relay/status.ts', import.meta.url),
    'utf8',
  );
  const ingressModule = await readFile(
    new URL('../src/platform/transports/telegram/relay/ingress.ts', import.meta.url),
    'utf8',
  );
  const deliveryModule = await readFile(
    new URL('../src/platform/transports/telegram/relay/delivery.ts', import.meta.url),
    'utf8',
  );

  assert.match(relayModule, /status\.js/u);
  assert.match(relayModule, /ingress\.js/u);
  assert.match(relayModule, /delivery\.js/u);
  assert.doesNotMatch(relayModule, /function buildStatusNote\(/u);
  assert.doesNotMatch(relayModule, /function buildWebhookReceipt\(/u);
  assert.doesNotMatch(relayModule, /normalizeTelegramMessageSummary/u);
  assert.doesNotMatch(relayModule, /resolveActiveTelegramBinding/u);
  assert.match(statusModule, /export function buildTelegramRelayStatus/u);
  assert.match(statusModule, /export function buildTelegramRelayDiagnostics/u);
  assert.match(ingressModule, /export function receiveTelegramUpdate/u);
  assert.match(ingressModule, /export function linkTelegramRoom/u);
  assert.match(deliveryModule, /export async function deliverTelegramRequest/u);
  assert.match(deliveryModule, /export function createBridgeDispatchFailureReceipt/u);
});

test('telegram relay store composes dedicated persistence and state-normalizer modules', async () => {
  const storeModule = await readFile(
    new URL('../src/platform/transports/telegram/store/index.ts', import.meta.url),
    'utf8',
  );
  const persistenceModule = await readFile(
    new URL('../src/platform/transports/telegram/store/persistence.ts', import.meta.url),
    'utf8',
  );
  const stateModule = await readFile(
    new URL('../src/platform/transports/telegram/store/state.ts', import.meta.url),
    'utf8',
  );

  assert.match(storeModule, /persistence\.js/u);
  assert.match(storeModule, /state\.js/u);
  assert.doesNotMatch(storeModule, /function asRecord\(/u);
  assert.doesNotMatch(storeModule, /function toWebhookReceipt\(/u);
  assert.doesNotMatch(storeModule, /writeFileSync/u);
  assert.match(persistenceModule, /export function readPersistedTelegramRelayState/u);
  assert.match(persistenceModule, /export function writePersistedTelegramRelayState/u);
  assert.match(stateModule, /export function asPersistedTelegramRelayState/u);
  assert.match(stateModule, /export function createEmptyPersistedTelegramRelayState/u);
});

test('runtime client composes dedicated parsing and stream helper modules', async () => {
  const clientModule = await readFile(
    new URL('../src/runtime/client.ts', import.meta.url),
    'utf8',
  );
  const parsingModule = await readFile(
    new URL('../src/runtime/clientParsing.ts', import.meta.url),
    'utf8',
  );
  const streamsModule = await readFile(
    new URL('../src/runtime/clientStreams.ts', import.meta.url),
    'utf8',
  );

  assert.match(clientModule, /clientParsing\.js/u);
  assert.match(clientModule, /clientStreams\.js/u);
  assert.doesNotMatch(clientModule, /function readErrorText\(/u);
  assert.doesNotMatch(clientModule, /async function readNdjsonResponse\(/u);
  assert.doesNotMatch(clientModule, /async function readSseResponse\(/u);
  assert.match(parsingModule, /export function readRuntimeErrorText/u);
  assert.match(parsingModule, /export function normalizeRuntimeProviderConfigRegistry/u);
  assert.match(streamsModule, /export async function readRuntimeNdjsonResponse/u);
  assert.match(streamsModule, /export async function readRuntimeSseResponse/u);
});

test('canonical memory store composes dedicated snapshot helpers instead of defining normalization inline', async () => {
  const storeModule = await readFile(
    new URL('../src/platform/memory/store.ts', import.meta.url),
    'utf8',
  );
  const snapshotModule = await readFile(
    new URL('../src/platform/memory/storeSnapshot.ts', import.meta.url),
    'utf8',
  );

  assert.match(storeModule, /storeSnapshot\.js/u);
  assert.doesNotMatch(storeModule, /function normalizeCanonicalMemoryRecord\(/u);
  assert.doesNotMatch(storeModule, /function prepareRecord\(/u);
  assert.doesNotMatch(storeModule, /function matchesFilter\(/u);
  assert.match(snapshotModule, /export function normalizeCanonicalMemorySnapshot/u);
  assert.match(snapshotModule, /export function prepareCanonicalMemoryRecord/u);
  assert.match(snapshotModule, /export function matchesCanonicalMemoryFilter/u);
  assert.match(snapshotModule, /export function deriveCanonicalMemoryStatePath/u);
});

test('chat model re-exports dedicated cat mutation helpers instead of defining them inline', async () => {
  const modelModule = await readFile(
    new URL('../src/products/chat/state/model/index.ts', import.meta.url),
    'utf8',
  );
  const catsModule = await readFile(
    new URL('../src/products/chat/state/model/cats.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelModule, /from '\.\/cats\.js'/u);
  assert.doesNotMatch(modelModule, /const DEFAULT_CAT_NAME/u);
  assert.doesNotMatch(modelModule, /export function renameCat\(/u);
  assert.doesNotMatch(modelModule, /export function createCat\(/u);
  assert.match(catsModule, /export function createCat/u);
  assert.match(catsModule, /export function renameCat/u);
  assert.match(catsModule, /export function setBossCat/u);
});

test('chat snapshot composes dedicated shared and entity helper modules', async () => {
  const snapshotModule = await readFile(
    new URL('../src/products/chat/state/chat-snapshot/index.ts', import.meta.url),
    'utf8',
  );
  const sharedModule = await readFile(
    new URL('../src/products/chat/state/chat-snapshot/shared.ts', import.meta.url),
    'utf8',
  );
  const entitiesModule = await readFile(
    new URL('../src/products/chat/state/chat-snapshot/entities.ts', import.meta.url),
    'utf8',
  );

  assert.match(snapshotModule, /\.\/shared\.js/u);
  assert.match(snapshotModule, /\.\/entities\.js/u);
  assert.doesNotMatch(snapshotModule, /function normalizeMessage\(/u);
  assert.doesNotMatch(snapshotModule, /function normalizeExecutionLease\(/u);
  assert.match(sharedModule, /export function normalizeExecutionLease/u);
  assert.match(sharedModule, /export function normalizeMemoryCheckpoint/u);
  assert.match(entitiesModule, /export function normalizeMessage/u);
  assert.match(entitiesModule, /export function normalizeChannel/u);
});

test('chat resource routes compose dedicated preference, orchestrator, and channel modules', async () => {
  const resourceRoutesModule = await readFile(
    new URL('../src/products/chat/api/resources/index.ts', import.meta.url),
    'utf8',
  );
  const preferenceModule = await readFile(
    new URL('../src/products/chat/api/resources/preferenceRoutes.ts', import.meta.url),
    'utf8',
  );
  const orchestratorModule = await readFile(
    new URL('../src/products/chat/api/resources/orchestratorRoutes.ts', import.meta.url),
    'utf8',
  );
  const channelModule = await readFile(
    new URL('../src/products/chat/api/resources/channelRoutes.ts', import.meta.url),
    'utf8',
  );

  assert.match(resourceRoutesModule, /preferenceRoutes\.js/u);
  assert.match(resourceRoutesModule, /orchestratorRoutes\.js/u);
  assert.match(resourceRoutesModule, /channelRoutes\.js/u);
  assert.doesNotMatch(resourceRoutesModule, /handleRestGetPreferences/u);
  assert.doesNotMatch(resourceRoutesModule, /handleRestSendMessage/u);
  assert.match(preferenceModule, /export async function routeChatPreferenceResourceApi/u);
  assert.match(orchestratorModule, /export async function routeChatOrchestratorResourceApi/u);
  assert.match(channelModule, /export async function routeChatChannelResourceApi/u);
  assert.doesNotMatch(channelModule, /handleRestAssignCat/u);
  assert.doesNotMatch(channelModule, /handleRestGetChat/u);
});

test('chat memory routes compose dedicated owner, channel, cat, and shared memory modules', async () => {
  const memoryRoutesModule = await readFile(
    new URL('../src/products/chat/api/memory/index.ts', import.meta.url),
    'utf8',
  );
  const sharedModule = await readFile(
    new URL('../src/products/chat/api/memory/shared.ts', import.meta.url),
    'utf8',
  );
  const catModule = await readFile(
    new URL('../src/products/chat/api/memory/catRoutes.ts', import.meta.url),
    'utf8',
  );
  const ownerModule = await readFile(
    new URL('../src/products/chat/api/memory/ownerRoutes.ts', import.meta.url),
    'utf8',
  );
  const channelModule = await readFile(
    new URL('../src/products/chat/api/memory/channelRoutes.ts', import.meta.url),
    'utf8',
  );

  assert.match(memoryRoutesModule, /ownerRoutes\.js/u);
  assert.match(memoryRoutesModule, /channelRoutes\.js/u);
  assert.match(memoryRoutesModule, /catRoutes\.js/u);
  assert.doesNotMatch(memoryRoutesModule, /handleCreateCatMemory/u);
  assert.doesNotMatch(memoryRoutesModule, /handleFlushCanonicalOwnerMemory/u);
  assert.match(sharedModule, /export function validateCategory/u);
  assert.match(sharedModule, /export async function trySyncCanonicalCatMemory/u);
  assert.match(catModule, /export async function routeCatMemoryApi/u);
  assert.match(ownerModule, /export async function routeOwnerMemoryApi/u);
  assert.match(channelModule, /export async function routeChannelMemoryApi/u);
  assert.doesNotMatch(sharedModule, /validateSubjectType/u);
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

test('runtimeActions is a thin facade over dedicated routing seams', async () => {
  const runtimeActions = await readFile(
    new URL('../src/products/chat/state/runtimeActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(runtimeActions, /runtime-dispatch\/routing\.js/u);
  assert.match(runtimeActions, /runtime-session\/index\.js/u);
  assert.doesNotMatch(runtimeActions, /export async function routeChannelMessage\(/u);
  assert.doesNotMatch(runtimeActions, /export async function activateChannelSessions\(/u);
  assert.doesNotMatch(runtimeActions, /export async function wakeChannelEntryParticipant\(/u);
});

test('runtime dispatch turn and loop consume dedicated room-routing workflow helpers instead of defining them inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/routing.ts', import.meta.url),
    'utf8',
  );
  const dispatchTurn = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/turn.ts', import.meta.url),
    'utf8',
  );
  const dispatchLoop = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/loop.ts', import.meta.url),
    'utf8',
  );
  const workflowModule = await readFile(
    new URL('../src/products/chat/state/room-routing/workflow.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(dispatchRouting, /room-routing\/workflow\.js/u);
  assert.match(dispatchTurn, /room-routing\/workflow\.js/u);
  assert.match(dispatchLoop, /room-routing\/workflow\.js/u);
  assert.doesNotMatch(dispatchTurn, /function createWorkflowTurn\(/u);
  assert.doesNotMatch(dispatchLoop, /function addWorkflowCheckpoint\(/u);
  assert.match(workflowModule, /export function createWorkflowTurn/u);
  assert.match(workflowModule, /export function addWorkflowCheckpoint/u);
});

test('room routing runtime keeps routing contracts while workflow and wake helpers live in dedicated modules', async () => {
  const runtimeModule = await readFile(
    new URL('../src/products/chat/state/room-routing/runtime.ts', import.meta.url),
    'utf8',
  );
  const workflowModule = await readFile(
    new URL('../src/products/chat/state/room-routing/workflow.ts', import.meta.url),
    'utf8',
  );
  const wakeModule = await readFile(
    new URL('../src/products/chat/state/room-routing/wake.ts', import.meta.url),
    'utf8',
  );
  const sessionWakeModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/wake.ts', import.meta.url),
    'utf8',
  );
  const sessionStateModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/state.ts', import.meta.url),
    'utf8',
  );

  assert.match(runtimeModule, /export interface DispatchRequest/u);
  assert.match(runtimeModule, /export function resolveTargets/u);
  assert.doesNotMatch(runtimeModule, /export function createWorkflowTurn/u);
  assert.doesNotMatch(runtimeModule, /export function createRecordedWakeRequest/u);
  assert.doesNotMatch(runtimeModule, /export function createRoomRoutingSnapshot/u);
  assert.match(workflowModule, /export function createWorkflowTurn/u);
  assert.match(workflowModule, /export function finalizeWorkflowTurn/u);
  assert.match(wakeModule, /export function createRecordedWakeRequest/u);
  assert.match(wakeModule, /export function createRoomRoutingSnapshot/u);
  assert.match(sessionWakeModule, /room-routing\/wake\.js/u);
  assert.match(sessionStateModule, /room-routing\/wake\.js/u);
});

test('runtime dispatch routing consumes dedicated turn bootstrap helpers instead of defining initial turn setup inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/routing.ts', import.meta.url),
    'utf8',
  );
  const dispatchTurnModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/turn.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRouting, /turn\.js/u);
  assert.doesNotMatch(dispatchRouting, /const initialResolution =/u);
  assert.doesNotMatch(dispatchRouting, /const outcome = createRoutingOutcome/u);
  assert.doesNotMatch(dispatchRouting, /const activeTurn = createWorkflowTurn/u);
  assert.match(dispatchTurnModule, /export function prepareDispatchTurn/u);
});

test('runtime dispatch routing consumes dedicated turn finalization helpers instead of defining terminal workflow updates inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/routing.ts', import.meta.url),
    'utf8',
  );
  const dispatchFinalizeModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/finalize.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRouting, /finalize\.js/u);
  assert.doesNotMatch(dispatchRouting, /const terminalStatuses = deriveTerminalTurnStatuses/u);
  assert.doesNotMatch(dispatchRouting, /finalizeWorkflowTurn\(/u);
  assert.match(dispatchFinalizeModule, /export function finalizeDispatchTurn/u);
});

test('runtime dispatch loop consumes dedicated wake/readiness helpers instead of defining target wake flows inline', async () => {
  const dispatchLoopModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/loop.ts', import.meta.url),
    'utf8',
  );
  const dispatchWakeModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/wake.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchLoopModule, /wake\.js/u);
  assert.doesNotMatch(dispatchLoopModule, /const ensured = await ensureTargetSession\(/u);
  assert.doesNotMatch(dispatchLoopModule, /await maybeAutoCheckoutChannelTask\(/u);
  assert.match(dispatchWakeModule, /export async function prepareReadyRequests/u);
});

test('runtime dispatch routing consumes a dedicated dispatch-loop module instead of defining queue processing inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/routing.ts', import.meta.url),
    'utf8',
  );
  const dispatchLoopModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/loop.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRouting, /loop\.js/u);
  assert.doesNotMatch(dispatchRouting, /while \(queue\.length > 0\)/u);
  assert.doesNotMatch(dispatchRouting, /const allowedRequests: DispatchRequest\[\] = \[\]/u);
  assert.match(dispatchLoopModule, /export async function processDispatchQueue/u);
  assert.match(dispatchLoopModule, /while \(queue\.length > 0\)/u);
});

test('runtime dispatch loop consumes dedicated runtime dispatch execution helpers instead of defining them inline', async () => {
  const dispatchLoopModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/loop.ts', import.meta.url),
    'utf8',
  );
  const dispatchExecutionModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/execution.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchLoopModule, /execution\.js/u);
  assert.doesNotMatch(dispatchLoopModule, /async function executeDispatch\(/u);
  assert.doesNotMatch(dispatchLoopModule, /async function settleInCompletionOrder/u);
  assert.doesNotMatch(dispatchLoopModule, /function shouldBlockAntiPingPong\(/u);
  assert.match(dispatchExecutionModule, /export async function executeDispatch/u);
  assert.match(dispatchExecutionModule, /export async function settleInCompletionOrder/u);
  assert.match(dispatchExecutionModule, /export function shouldBlockAntiPingPong/u);
});

test('runtime dispatch execution consumes dedicated runtime targeting helpers instead of defining them inline', async () => {
  const dispatchExecutionModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/execution.ts', import.meta.url),
    'utf8',
  );
  const targetingModule = await readFile(
    new URL('../src/products/chat/state/runtimeTargeting.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchExecutionModule, /runtimeTargeting\.js/u);
  assert.doesNotMatch(dispatchExecutionModule, /function buildPromptForTarget\(/u);
  assert.doesNotMatch(dispatchExecutionModule, /async function resolveRuntimeEnvelopeForTarget\(/u);
  assert.match(targetingModule, /export function buildPromptForTarget/u);
  assert.match(targetingModule, /export async function resolveRuntimeEnvelopeForTarget/u);
});

test('runtime dispatch routing consumes dedicated runtime targeting helpers instead of defining choice resolution inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/routing.ts', import.meta.url),
    'utf8',
  );
  const targetingModule = await readFile(
    new URL('../src/products/chat/state/runtimeTargeting.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRouting, /runtimeTargeting\.js/u);
  assert.doesNotMatch(dispatchRouting, /function resolveChoiceResponseTarget\(/u);
  assert.match(targetingModule, /export function resolveChoiceResponseTarget/u);
});

test('runtime dispatch execution consumes dedicated runtime session-state helpers instead of defining them inline', async () => {
  const dispatchExecutionModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/execution.ts', import.meta.url),
    'utf8',
  );
  const sessionStateModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/state.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchExecutionModule, /runtime-session\/state\.js/u);
  assert.doesNotMatch(dispatchExecutionModule, /function participantKey\(/u);
  assert.match(sessionStateModule, /export function participantKey/u);
});

test('runtime dispatch execution consumes dedicated runtime session-routing helpers instead of defining rewrite logic inline', async () => {
  const dispatchExecutionModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/execution.ts', import.meta.url),
    'utf8',
  );
  const sessionRoutingModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/index.ts', import.meta.url),
    'utf8',
  );
  const sessionSharedModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/shared.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchExecutionModule, /runtime-session\/index\.js/u);
  assert.doesNotMatch(dispatchExecutionModule, /function shouldRewriteOrchestratorReply\(/u);
  assert.match(sessionRoutingModule, /\.\/shared\.js/u);
  assert.match(sessionSharedModule, /export function shouldRewriteOrchestratorReply/u);
});

test('runtime dispatch loop consumes dedicated dispatch-result helpers instead of defining response handling inline', async () => {
  const dispatchLoopModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/loop.ts', import.meta.url),
    'utf8',
  );
  const dispatchResultsModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/results.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchLoopModule, /results\.js/u);
  assert.doesNotMatch(dispatchLoopModule, /const continuationResolution = resolveTargets/u);
  assert.doesNotMatch(dispatchLoopModule, /nextState = setReadyAfterMessage\(/u);
  assert.doesNotMatch(dispatchLoopModule, /resolveExecutionMetadataForTarget\(/u);
  assert.match(dispatchResultsModule, /export function applyDispatchExecutions/u);
  assert.match(dispatchResultsModule, /setReadyAfterMessage/u);
  assert.match(dispatchResultsModule, /resolveExecutionMetadataForTarget/u);
});

test('runtime dispatch wake consumes dedicated runtime session-routing helpers instead of defining wake flows inline', async () => {
  const dispatchWakeModule = await readFile(
    new URL('../src/products/chat/state/runtime-dispatch/wake.ts', import.meta.url),
    'utf8',
  );
  const sessionRoutingModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/index.ts', import.meta.url),
    'utf8',
  );
  const sessionWakeModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/wake.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchWakeModule, /runtime-session\/index\.js/u);
  assert.doesNotMatch(dispatchWakeModule, /async function ensureTargetSession\(/u);
  assert.doesNotMatch(dispatchWakeModule, /async function maybeAutoCheckoutChannelTask\(/u);
  assert.match(sessionRoutingModule, /\.\/wake\.js/u);
  assert.match(sessionWakeModule, /export async function ensureTargetSession/u);
  assert.match(sessionWakeModule, /export async function maybeAutoCheckoutChannelTask/u);
});

test('runtime session routing composes dedicated wake and activation modules instead of defining session flows inline', async () => {
  const sessionRoutingModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/index.ts', import.meta.url),
    'utf8',
  );
  const sessionActivationModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/activation.ts', import.meta.url),
    'utf8',
  );

  assert.match(sessionRoutingModule, /\.\/shared\.js/u);
  assert.match(sessionRoutingModule, /\.\/wake\.js/u);
  assert.match(sessionRoutingModule, /\.\/activation\.js/u);
  assert.doesNotMatch(sessionRoutingModule, /export async function ensureTargetSession\(/u);
  assert.doesNotMatch(sessionRoutingModule, /export async function wakeChannelEntryParticipant\(/u);
  assert.doesNotMatch(sessionRoutingModule, /export async function activateChannelSessions\(/u);
  assert.match(sessionActivationModule, /export async function activateChannelSessions/u);
});

test('renderer app consumes a dedicated operator-loop hook instead of defining polling inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useOperatorLoop.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useOperatorLoop/u);
  assert.doesNotMatch(appSource, /const refreshOperatorSnapshot = useCallback/u);
  assert.doesNotMatch(appSource, /const operatorRequestIdRef = useRef/u);
  assert.match(hookSource, /export function useOperatorLoop/u);
  assert.match(hookSource, /fetchOperatorLoopSnapshot/u);
});

test('renderer app consumes a dedicated app-shell routing hook instead of defining route sync inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useAppShellRouting.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useAppShellRouting/u);
  assert.doesNotMatch(appSource, /void fetchAppShell\(controller\.signal\)/u);
  assert.doesNotMatch(appSource, /updateSelectedChannel\(routeChannelId,\s*controller\.signal\)/u);
  assert.match(hookSource, /export function useAppShellRouting/u);
  assert.match(hookSource, /fetchAppShell/u);
  assert.match(hookSource, /updateSelectedChannel/u);
});

test('renderer app consumes a dedicated folder-browser hook instead of defining browse flows inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useFolderBrowser.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useFolderBrowser/u);
  assert.doesNotMatch(appSource, /const loadFolderBrowse = useCallback/u);
  assert.doesNotMatch(appSource, /async function handlePickFolder\(/u);
  assert.doesNotMatch(appSource, /browseDirectories/u);
  assert.match(hookSource, /export function useFolderBrowser/u);
  assert.match(hookSource, /browseDirectories/u);
  assert.match(hookSource, /openFolderBrowser/u);
});

test('renderer app consumes a dedicated composer-submit hook instead of defining optimistic send flows inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useComposerSubmit.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useComposerSubmit/u);
  assert.doesNotMatch(appSource, /async function submitComposerMessage\(/u);
  assert.doesNotMatch(appSource, /appendOptimisticUserMessage/u);
  assert.doesNotMatch(appSource, /createOptimisticDraftPayload/u);
  assert.match(hookSource, /export function useComposerSubmit/u);
  assert.match(hookSource, /appendOptimisticUserMessage/u);
  assert.match(hookSource, /createOptimisticDraftPayload/u);
  assert.match(hookSource, /sendChatMessage/u);
});

test('renderer app consumes dedicated cat-assignment actions instead of defining cat create/assign flows inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useCatAssignmentActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useCatAssignmentActions/u);
  assert.doesNotMatch(appSource, /async function onCreateAndAssignCat\(/u);
  assert.doesNotMatch(appSource, /async function onCreateAndDraftCat\(/u);
  assert.doesNotMatch(appSource, /async function onAssignExistingCat\(/u);
  assert.doesNotMatch(appSource, /async function onRemoveAssignedCat\(/u);
  assert.match(hookSource, /export function useCatAssignmentActions/u);
  assert.match(hookSource, /createGlobalCat/u);
  assert.match(hookSource, /assignCatToChannelApi/u);
  assert.match(hookSource, /removeCatFromChannelApi/u);
});

test('renderer app consumes dedicated governance actions instead of defining approval and choice flows inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useGovernanceActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useGovernanceActions/u);
  assert.doesNotMatch(appSource, /async function onApprovalDecision\(/u);
  assert.doesNotMatch(appSource, /async function onChoiceSubmit\(/u);
  assert.doesNotMatch(appSource, /async function onOperatorAction\(/u);
  assert.match(hookSource, /export function useGovernanceActions/u);
  assert.match(hookSource, /writeCoreApprovalDecision/u);
  assert.match(hookSource, /writeCoreOperatorAction/u);
  assert.match(hookSource, /sendChatMessage/u);
});

test('renderer app consumes a dedicated chrome hook instead of defining shell menu state inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useAppChrome.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useAppChrome/u);
  assert.doesNotMatch(appSource, /document\.addEventListener\('mousedown'/u);
  assert.doesNotMatch(appSource, /writeSidebarOpenPreference/u);
  assert.doesNotMatch(appSource, /const autoResize = useCallback/u);
  assert.match(hookSource, /export function useAppChrome/u);
  assert.match(hookSource, /writeSidebarOpenPreference/u);
  assert.match(hookSource, /document\.addEventListener\('mousedown'/u);
});

test('renderer app consumes a dedicated routes module instead of defining the route tree inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const routesSource = await readFile(
    new URL('../src/products/chat/renderer/AppRoutes.tsx', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /AppRoutes/u);
  assert.doesNotMatch(appSource, /<Routes>/u);
  assert.doesNotMatch(appSource, /path="\/settings\/general"/u);
  assert.match(routesSource, /export function AppRoutes/u);
  assert.match(routesSource, /path="\/settings\/general"/u);
  assert.match(routesSource, /path="\/chats\/:channelId"/u);
});

test('renderer app consumes dedicated derived-state helpers instead of defining route and view-model derivations inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const viewStateSource = await readFile(
    new URL('../src/products/chat/renderer/appViewState.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /deriveAppRouteState/u);
  assert.match(appSource, /deriveAppViewState/u);
  assert.doesNotMatch(appSource, /const routeChannelTitle =/u);
  assert.doesNotMatch(appSource, /const showBossCatAvatar =/u);
  assert.match(viewStateSource, /export function deriveAppRouteState/u);
  assert.match(viewStateSource, /export function deriveAppViewState/u);
  assert.match(viewStateSource, /resolveBossCatName/u);
  assert.match(viewStateSource, /findDirectLaneForCat/u);
});

test('renderer app consumes dedicated navigation actions instead of defining route-side effects inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useAppNavigationActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useAppNavigationActions/u);
  assert.doesNotMatch(appSource, /async function onDeleteChannel\(/u);
  assert.doesNotMatch(appSource, /async function onResetSetup\(/u);
  assert.doesNotMatch(appSource, /async function onStartNewChat\(/u);
  assert.doesNotMatch(appSource, /function onOpenChatsOverview\(/u);
  assert.doesNotMatch(appSource, /function onSelect\(/u);
  assert.match(hookSource, /export function useAppNavigationActions/u);
  assert.match(hookSource, /deleteChatChannel/u);
  assert.match(hookSource, /deleteGlobalCat/u);
  assert.match(hookSource, /resolveMyCatNavigationTarget/u);
});

test('renderer app consumes dedicated draft-ui actions instead of defining menu toggles inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useAppDraftUiActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useAppDraftUiActions/u);
  assert.doesNotMatch(appSource, /setAddCatOpen\(!addCatOpen\)/u);
  assert.doesNotMatch(appSource, /setPlusMenuOpen\(!plusMenuOpen\)/u);
  assert.doesNotMatch(appSource, /fileInputRef\.current\?\.click\(\)/u);
  assert.doesNotMatch(appSource, /navigate\(buildNewChatPath\(catId\), \{ replace: true \}\)/u);
  assert.match(hookSource, /export function useAppDraftUiActions/u);
  assert.match(hookSource, /openDraftFilePicker/u);
  assert.match(hookSource, /openDraftAddCatPanel/u);
  assert.match(hookSource, /changeDraftLeadCat/u);
});

test('settings cats consumes dedicated telegram and memory hooks instead of defining side effects inline', async () => {
  const settingsCatsSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const telegramHookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useSettingsCatsTelegram.ts', import.meta.url),
    'utf8',
  );
  const memoryHookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useSettingsCatsMemory.ts', import.meta.url),
    'utf8',
  );

  assert.match(settingsCatsSource, /useSettingsCatsTelegram/u);
  assert.match(settingsCatsSource, /useSettingsCatsMemory/u);
  assert.doesNotMatch(settingsCatsSource, /beginSettingsCatsTelegramScopeLoad/u);
  assert.doesNotMatch(settingsCatsSource, /createSettingsCatsTelegramAutoLoader/u);
  assert.doesNotMatch(settingsCatsSource, /listCatMemory\(/u);
  assert.match(telegramHookSource, /export function useSettingsCatsTelegram/u);
  assert.match(memoryHookSource, /export function useSettingsCatsMemory/u);
});

test('settings cats consumes dedicated registry actions instead of defining cat and binding mutations inline', async () => {
  const settingsCatsSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const registryHookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useSettingsCatsRegistryActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(settingsCatsSource, /useSettingsCatsRegistryActions/u);
  assert.doesNotMatch(settingsCatsSource, /async function onCreateCat\(/u);
  assert.doesNotMatch(settingsCatsSource, /async function onRenameCat\(/u);
  assert.doesNotMatch(settingsCatsSource, /async function onMakeBossCat\(/u);
  assert.doesNotMatch(settingsCatsSource, /async function onCreateBinding\(/u);
  assert.doesNotMatch(settingsCatsSource, /async function onDeleteBinding\(/u);
  assert.match(registryHookSource, /export function useSettingsCatsRegistryActions/u);
  assert.match(registryHookSource, /createGlobalCat/u);
  assert.match(registryHookSource, /updateCatProfile/u);
  assert.match(registryHookSource, /createBotBindingApi/u);
  assert.match(registryHookSource, /deleteBotBindingApi/u);
});

test('settings cats consumes a dedicated transport panel instead of rendering telegram diagnostics inline', async () => {
  const settingsCatsSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const transportPanelSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCatsTransportPanel.tsx', import.meta.url),
    'utf8',
  );

  assert.match(settingsCatsSource, /SettingsCatsTransportPanel/u);
  assert.doesNotMatch(settingsCatsSource, /Last inbound: \{formatTransportTimestamp/u);
  assert.doesNotMatch(settingsCatsSource, /Tracked inboxes \{telegramDiagnostics\.bindings\.length\}/u);
  assert.match(transportPanelSource, /export function SettingsCatsTransportPanel/u);
  assert.match(transportPanelSource, /formatTransportTimestamp/u);
  assert.match(transportPanelSource, /No Telegram inbox bindings have received traffic yet\./u);
});

test('settings cats composes dedicated registry and create-form components instead of rendering all cat detail UI inline', async () => {
  const settingsCatsSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const registrySource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCatsRegistry.tsx', import.meta.url),
    'utf8',
  );
  const detailPanelSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCatsDetailPanel.tsx', import.meta.url),
    'utf8',
  );
  const createFormSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCatsCreateForm.tsx', import.meta.url),
    'utf8',
  );

  assert.match(settingsCatsSource, /SettingsCatsRegistry/u);
  assert.match(settingsCatsSource, /SettingsCatsCreateForm/u);
  assert.doesNotMatch(settingsCatsSource, /className="catDetailSection"/u);
  assert.doesNotMatch(settingsCatsSource, /ProviderModelFields/u);
  assert.match(registrySource, /SettingsCatsDetailPanel/u);
  assert.doesNotMatch(registrySource, /className="memoryForm"/u);
  assert.match(detailPanelSource, /formatTransportTimestamp/u);
  assert.match(detailPanelSource, /export function SettingsCatsDetailPanel/u);
  assert.match(createFormSource, /ProviderModelFields/u);
  assert.match(createFormSource, /export function SettingsCatsCreateForm/u);
});

test('renderer styles compose dedicated partials instead of keeping the full stylesheet inline', async () => {
  const stylesIndexSource = await readFile(
    new URL('../src/products/chat/renderer/styles.css', import.meta.url),
    'utf8',
  );
  const baseStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/base.css', import.meta.url),
    'utf8',
  );
  const baseFoundationStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/base-foundation.css', import.meta.url),
    'utf8',
  );
  const baseSurfacesStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/base-surfaces.css', import.meta.url),
    'utf8',
  );
  const baseOverlaysStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/base-overlays.css', import.meta.url),
    'utf8',
  );
  const settingsStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/settings.css', import.meta.url),
    'utf8',
  );
  const chatStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat.css', import.meta.url),
    'utf8',
  );
  const chatWorkspaceStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-workspace.css', import.meta.url),
    'utf8',
  );
  const chatShellStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-shell.css', import.meta.url),
    'utf8',
  );
  const chatOperatorStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-operator.css', import.meta.url),
    'utf8',
  );
  const chatThreadStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-thread.css', import.meta.url),
    'utf8',
  );
  const chatComposerStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-composer.css', import.meta.url),
    'utf8',
  );
  const chatSetupStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-setup.css', import.meta.url),
    'utf8',
  );
  const extraStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/extras.css', import.meta.url),
    'utf8',
  );

  assert.match(stylesIndexSource, /@import '\.\/styles\/base\.css';/u);
  assert.match(stylesIndexSource, /@import '\.\/styles\/settings\.css';/u);
  assert.match(stylesIndexSource, /@import '\.\/styles\/chat\.css';/u);
  assert.match(stylesIndexSource, /@import '\.\/styles\/extras\.css';/u);
  assert.doesNotMatch(stylesIndexSource, /\.tooltipPortal/u);
  assert.doesNotMatch(stylesIndexSource, /\.settingsShell/u);
  assert.doesNotMatch(stylesIndexSource, /\.myCatsSection/u);
  assert.match(baseStylesSource, /@import '\.\/base-foundation\.css';/u);
  assert.match(baseStylesSource, /@import '\.\/base-surfaces\.css';/u);
  assert.match(baseStylesSource, /@import '\.\/base-overlays\.css';/u);
  assert.doesNotMatch(baseStylesSource, /\.tooltipPortal/u);
  assert.doesNotMatch(baseStylesSource, /\.accountMenu/u);
  assert.match(chatStylesSource, /@import '\.\/chat-workspace\.css';/u);
  assert.match(chatStylesSource, /@import '\.\/chat-composer\.css';/u);
  assert.match(chatStylesSource, /@import '\.\/chat-setup\.css';/u);
  assert.doesNotMatch(chatStylesSource, /\.channelWorkspace/u);
  assert.doesNotMatch(chatStylesSource, /\.composerPlusMenu/u);
  assert.doesNotMatch(chatStylesSource, /\.setupWizard/u);
  assert.match(chatWorkspaceStylesSource, /@import '\.\/chat-shell\.css';/u);
  assert.match(chatWorkspaceStylesSource, /@import '\.\/chat-operator\.css';/u);
  assert.match(chatWorkspaceStylesSource, /@import '\.\/chat-thread\.css';/u);
  assert.doesNotMatch(chatWorkspaceStylesSource, /\.channelWorkspace/u);
  assert.doesNotMatch(chatWorkspaceStylesSource, /\.recentOverflowMenu/u);
  assert.match(baseFoundationStylesSource, /\.tooltipPortal/u);
  assert.match(baseSurfacesStylesSource, /\.messageChoices/u);
  assert.match(baseOverlaysStylesSource, /\.accountMenu/u);
  assert.match(settingsStylesSource, /\.settingsShell/u);
  assert.match(chatShellStylesSource, /\.sidebarCollapsed \.brandCopy/u);
  assert.match(chatOperatorStylesSource, /\.channelWorkspace/u);
  assert.match(chatThreadStylesSource, /\.recentOverflowMenu/u);
  assert.match(chatComposerStylesSource, /\.composerPlusMenu/u);
  assert.match(chatSetupStylesSource, /\.setupWizard/u);
  assert.match(extraStylesSource, /\.myCatsSection/u);
});

test('renderer api facade composes dedicated client modules instead of defining every transport inline', async () => {
  const apiSource = await readFile(
    new URL('../src/products/chat/renderer/api/index.ts', import.meta.url),
    'utf8',
  );
  const normalizationSource = await readFile(
    new URL('../src/products/chat/renderer/api/normalization.ts', import.meta.url),
    'utf8',
  );
  const operatorSource = await readFile(
    new URL('../src/products/chat/renderer/api/operator.ts', import.meta.url),
    'utf8',
  );
  const chatSource = await readFile(
    new URL('../src/products/chat/renderer/api/chat.ts', import.meta.url),
    'utf8',
  );

  assert.match(apiSource, /from '\.\/normalization\.js'/u);
  assert.match(apiSource, /from '\.\/operator\.js'/u);
  assert.match(apiSource, /from '\.\/chat\.js'/u);
  assert.doesNotMatch(apiSource, /async function readErrorMessage\(/u);
  assert.doesNotMatch(apiSource, /export async function fetchAppShell\(/u);
  assert.doesNotMatch(apiSource, /export async function sendChatMessage\(/u);
  assert.match(normalizationSource, /export function normalizeAppShellPayload/u);
  assert.match(operatorSource, /export async function fetchOperatorLoopSnapshot/u);
  assert.match(chatSource, /export async function sendChatMessage/u);
});

test('chat snapshot consumes dedicated room-routing snapshot normalization instead of defining it inline', async () => {
  const snapshotConsumer = await readFile(
    new URL('../src/products/chat/state/chat-snapshot/index.ts', import.meta.url),
    'utf8',
  );
  const entityModule = await readFile(
    new URL('../src/products/chat/state/chat-snapshot/entities.ts', import.meta.url),
    'utf8',
  );
  const snapshotModule = await readFile(
    new URL('../src/products/chat/state/room-routing/snapshot.ts', import.meta.url),
    'utf8',
  );

  assert.match(snapshotConsumer, /\.\/entities\.js/u);
  assert.doesNotMatch(snapshotConsumer, /function normalizeRoomRouting\(/u);
  assert.doesNotMatch(snapshotConsumer, /function normalizeRoomWorkflowTurn\(/u);
  assert.match(entityModule, /room-routing\/snapshot\.js/u);
  assert.match(snapshotModule, /export function normalizeRoomRouting/u);
});

test('chat model composes dedicated shared and read-model modules instead of defining projections inline', async () => {
  const modelSource = await readFile(
    new URL('../src/products/chat/state/model/index.ts', import.meta.url),
    'utf8',
  );
  const sharedSource = await readFile(
    new URL('../src/products/chat/state/model/shared.ts', import.meta.url),
    'utf8',
  );
  const readModelSource = await readFile(
    new URL('../src/products/chat/state/model/readModels.ts', import.meta.url),
    'utf8',
  );
  const recordBuilderSource = await readFile(
    new URL('../src/products/chat/state/model/recordBuilders.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelSource, /from '\.\/shared\.js'/u);
  assert.match(modelSource, /from '\.\/readModels\.js'/u);
  assert.match(modelSource, /from '\.\/recordBuilders\.js'/u);
  assert.doesNotMatch(modelSource, /export function buildChannelView\(/u);
  assert.doesNotMatch(modelSource, /export function summarizeState\(/u);
  assert.doesNotMatch(modelSource, /export function requireChannel\(/u);
  assert.doesNotMatch(modelSource, /function createMessageRecord\(/u);
  assert.match(sharedSource, /export function requireChannel/u);
  assert.match(sharedSource, /export function requireCat/u);
  assert.match(readModelSource, /export function buildChannelView/u);
  assert.match(readModelSource, /export function summarizeState/u);
  assert.match(recordBuilderSource, /export function createMessageRecord/u);
  assert.match(recordBuilderSource, /export function createCatRecord/u);
});

test('store consumes dedicated core snapshot normalization instead of defining it inline', async () => {
  const storeSource = await readFile(
    new URL('../src/products/chat/state/store.ts', import.meta.url),
    'utf8',
  );
  const snapshotModule = await readFile(
    new URL('../src/products/chat/state/core-snapshot/index.ts', import.meta.url),
    'utf8',
  );
  const snapshotSharedModule = await readFile(
    new URL('../src/products/chat/state/core-snapshot/shared.ts', import.meta.url),
    'utf8',
  );
  const snapshotRecordsModule = await readFile(
    new URL('../src/products/chat/state/core-snapshot/records.ts', import.meta.url),
    'utf8',
  );
  const snapshotActorRecordsModule = await readFile(
    new URL('../src/products/chat/state/core-snapshot/actorRecords.ts', import.meta.url),
    'utf8',
  );
  const snapshotWorkflowRecordsModule = await readFile(
    new URL('../src/products/chat/state/core-snapshot/workflowRecords.ts', import.meta.url),
    'utf8',
  );
  const snapshotAuxiliaryRecordsModule = await readFile(
    new URL('../src/products/chat/state/core-snapshot/auxiliaryRecords.ts', import.meta.url),
    'utf8',
  );

  assert.match(storeSource, /core-snapshot\/index\.js/u);
  assert.doesNotMatch(storeSource, /function normalizeCoreTask\(/u);
  assert.doesNotMatch(storeSource, /function buildPersistedChatSnapshot\(/u);
  assert.match(snapshotModule, /normalizeCoreTask,/u);
  assert.match(snapshotModule, /export function buildPersistedChatSnapshot/u);
  assert.match(snapshotModule, /\.\/records\.js/u);
  assert.doesNotMatch(snapshotModule, /function asRecord\(/u);
  assert.match(snapshotSharedModule, /export function asRecord/u);
  assert.match(snapshotRecordsModule, /\.\/actorRecords\.js/u);
  assert.match(snapshotRecordsModule, /\.\/workflowRecords\.js/u);
  assert.match(snapshotRecordsModule, /\.\/auxiliaryRecords\.js/u);
  assert.doesNotMatch(snapshotRecordsModule, /export function normalizeCoreTask\(/u);
  assert.match(snapshotActorRecordsModule, /export function normalizeOwnerProfile/u);
  assert.match(snapshotActorRecordsModule, /export function normalizeCoreProject/u);
  assert.match(snapshotWorkflowRecordsModule, /export function normalizeCoreTask/u);
  assert.match(snapshotWorkflowRecordsModule, /export function normalizeCoreApprovalBinding/u);
  assert.match(snapshotAuxiliaryRecordsModule, /export function normalizeBotBinding/u);
  assert.match(snapshotAuxiliaryRecordsModule, /export function normalizeDurableMemoryRecord/u);
});

test('core route modules consume dedicated parsing and error helpers instead of defining them inline', async () => {
  const controlRoutesSource = await readFile(
    new URL('../src/core/api/controlRoutes.ts', import.meta.url),
    'utf8',
  );
  const controlApprovalsSource = await readFile(
    new URL('../src/core/api/controlApprovals.ts', import.meta.url),
    'utf8',
  );
  const controlOperatorActionsSource = await readFile(
    new URL('../src/core/api/controlOperatorActions.ts', import.meta.url),
    'utf8',
  );
  const controlOwnerProfileSource = await readFile(
    new URL('../src/core/api/controlOwnerProfile.ts', import.meta.url),
    'utf8',
  );
  const recordRoutesSource = await readFile(
    new URL('../src/core/api/recordRoutes.ts', import.meta.url),
    'utf8',
  );
  const recordPlanningRoutesSource = await readFile(
    new URL('../src/core/api/recordPlanningRoutes.ts', import.meta.url),
    'utf8',
  );
  const recordExecutionRoutesSource = await readFile(
    new URL('../src/core/api/recordExecutionRoutes.ts', import.meta.url),
    'utf8',
  );
  const recordGovernanceRoutesSource = await readFile(
    new URL('../src/core/api/recordGovernanceRoutes.ts', import.meta.url),
    'utf8',
  );
  const taskRoutesSource = await readFile(
    new URL('../src/core/api/taskRoutes.ts', import.meta.url),
    'utf8',
  );
  const sharedModule = await readFile(
    new URL('../src/core/api/shared.ts', import.meta.url),
    'utf8',
  );

  assert.match(controlApprovalsSource, /shared\.js/u);
  assert.match(controlOperatorActionsSource, /shared\.js/u);
  assert.match(controlOwnerProfileSource, /shared\.js/u);
  assert.match(recordPlanningRoutesSource, /shared\.js/u);
  assert.match(recordExecutionRoutesSource, /shared\.js/u);
  assert.match(recordGovernanceRoutesSource, /shared\.js/u);
  assert.match(taskRoutesSource, /shared\.js/u);
  assert.match(controlRoutesSource, /controlApprovals\.js/u);
  assert.match(controlRoutesSource, /controlOperatorActions\.js/u);
  assert.match(controlRoutesSource, /controlOwnerProfile\.js/u);
  assert.match(recordRoutesSource, /recordPlanningRoutes\.js/u);
  assert.match(recordRoutesSource, /recordExecutionRoutes\.js/u);
  assert.match(recordRoutesSource, /recordGovernanceRoutes\.js/u);
  assert.doesNotMatch(controlApprovalsSource, /function readRequiredString\(/u);
  assert.doesNotMatch(controlOperatorActionsSource, /function readObjectBody\(/u);
  assert.doesNotMatch(controlOwnerProfileSource, /function readOptionalString\(/u);
  assert.doesNotMatch(controlRoutesSource, /async function handleCoreApprovalWrite\(/u);
  assert.doesNotMatch(controlRoutesSource, /async function handleCoreOperatorActionWrite\(/u);
  assert.doesNotMatch(controlRoutesSource, /async function handleOwnerProfileWrite\(/u);
  assert.doesNotMatch(recordRoutesSource, /function readObjectBody\(/u);
  assert.doesNotMatch(recordPlanningRoutesSource, /function readObjectBody\(/u);
  assert.doesNotMatch(recordExecutionRoutesSource, /function readObjectBody\(/u);
  assert.doesNotMatch(recordGovernanceRoutesSource, /function readObjectBody\(/u);
  assert.doesNotMatch(taskRoutesSource, /function handleCoreError\(/u);
  assert.match(sharedModule, /export function readRequiredString/u);
  assert.match(sharedModule, /export async function readObjectBody/u);
  assert.match(sharedModule, /export function handleCoreError/u);
});

test('core api consumes dedicated control route modules and api contracts instead of defining them inline', async () => {
  const coreApiSource = await readFile(
    new URL('../src/core/api/index.ts', import.meta.url),
    'utf8',
  );
  const controlRoutesSource = await readFile(
    new URL('../src/core/api/controlRoutes.ts', import.meta.url),
    'utf8',
  );
  const controlApprovalsSource = await readFile(
    new URL('../src/core/api/controlApprovals.ts', import.meta.url),
    'utf8',
  );
  const controlOperatorActionsSource = await readFile(
    new URL('../src/core/api/controlOperatorActions.ts', import.meta.url),
    'utf8',
  );
  const controlOwnerProfileSource = await readFile(
    new URL('../src/core/api/controlOwnerProfile.ts', import.meta.url),
    'utf8',
  );
  const recordRoutesSource = await readFile(
    new URL('../src/core/api/recordRoutes.ts', import.meta.url),
    'utf8',
  );
  const recordPlanningRoutesSource = await readFile(
    new URL('../src/core/api/recordPlanningRoutes.ts', import.meta.url),
    'utf8',
  );
  const recordExecutionRoutesSource = await readFile(
    new URL('../src/core/api/recordExecutionRoutes.ts', import.meta.url),
    'utf8',
  );
  const recordGovernanceRoutesSource = await readFile(
    new URL('../src/core/api/recordGovernanceRoutes.ts', import.meta.url),
    'utf8',
  );
  const taskRoutesSource = await readFile(
    new URL('../src/core/api/taskRoutes.ts', import.meta.url),
    'utf8',
  );
  const constantsSource = await readFile(
    new URL('../src/core/api/constants.ts', import.meta.url),
    'utf8',
  );
  const typesSource = await readFile(
    new URL('../src/core/api/types.ts', import.meta.url),
    'utf8',
  );

  assert.match(coreApiSource, /\.\/controlRoutes\.js/u);
  assert.match(coreApiSource, /\.\/recordRoutes\.js/u);
  assert.match(coreApiSource, /\.\/taskRoutes\.js/u);
  assert.match(coreApiSource, /\.\/types\.js/u);
  assert.doesNotMatch(coreApiSource, /export interface CoreApiDependencies/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreProjectWrite\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreRunWrite\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreTaskWrite\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreTaskCheckout\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreApprovals\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreOperatorActionWrite\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleOwnerProfileWrite\(/u);
  assert.doesNotMatch(coreApiSource, /const CORE_TASK_STATUSES = \[/u);
  assert.match(typesSource, /from '\.\.\/store\.js'/u);
  assert.match(typesSource, /taskExecutionLocator\.js/u);
  assert.doesNotMatch(typesSource, /products\/chat\/state\/store\.js/u);
  assert.match(controlRoutesSource, /export async function routeCoreControlApi/u);
  assert.match(controlRoutesSource, /\.\/types\.js/u);
  assert.match(controlRoutesSource, /controlApprovals\.js/u);
  assert.match(controlRoutesSource, /controlOperatorActions\.js/u);
  assert.match(controlRoutesSource, /controlOwnerProfile\.js/u);
  assert.match(controlApprovalsSource, /export async function routeCoreApprovalsApi/u);
  assert.match(controlOperatorActionsSource, /export async function routeCoreOperatorActionsApi/u);
  assert.match(controlOwnerProfileSource, /export async function routeCoreOwnerProfileApi/u);
  assert.match(recordRoutesSource, /export async function routeCoreRecordApi/u);
  assert.match(recordRoutesSource, /\.\/types\.js/u);
  assert.match(recordRoutesSource, /recordPlanningRoutes\.js/u);
  assert.match(recordRoutesSource, /recordExecutionRoutes\.js/u);
  assert.match(recordRoutesSource, /recordGovernanceRoutes\.js/u);
  assert.doesNotMatch(recordRoutesSource, /async function handleCoreProjectWrite\(/u);
  assert.doesNotMatch(recordRoutesSource, /async function handleCoreRunWrite\(/u);
  assert.doesNotMatch(recordRoutesSource, /async function handleCoreApprovalBindingWrite\(/u);
  assert.match(recordPlanningRoutesSource, /export async function routeCorePlanningRecordApi/u);
  assert.match(recordPlanningRoutesSource, /constants\.js/u);
  assert.match(recordPlanningRoutesSource, /async function handleCoreProjectWrite\(/u);
  assert.match(recordExecutionRoutesSource, /export async function routeCoreExecutionRecordApi/u);
  assert.doesNotMatch(taskRoutesSource, /context\.dependencies\.chatStore/u);
  assert.match(taskRoutesSource, /context\.dependencies\.coreStore/u);
  assert.match(taskRoutesSource, /taskExecutionLocator/u);
  assert.match(recordExecutionRoutesSource, /constants\.js/u);
  assert.match(recordExecutionRoutesSource, /async function handleCoreRunWrite\(/u);
  assert.match(recordGovernanceRoutesSource, /export async function routeCoreGovernanceRecordApi/u);
  assert.match(recordGovernanceRoutesSource, /constants\.js/u);
  assert.match(recordGovernanceRoutesSource, /async function handleCoreApprovalBindingWrite\(/u);
  assert.match(taskRoutesSource, /export async function routeCoreTaskApi/u);
  assert.match(taskRoutesSource, /\.\/types\.js/u);
  assert.match(taskRoutesSource, /constants\.js/u);
  assert.match(constantsSource, /export const CORE_TASK_STATUSES/u);
  assert.match(constantsSource, /export const CORE_APPROVAL_ACTIONS/u);
  assert.match(typesSource, /export interface CoreApiDependencies/u);
  assert.match(typesSource, /export interface CoreOrchestratorAutoResumeSummary/u);
});

test('core model consumes dedicated shared helpers and input contracts instead of defining them inline', async () => {
  const modelSource = await readFile(
    new URL('../src/core/model/index.ts', import.meta.url),
    'utf8',
  );
  const sharedSource = await readFile(
    new URL('../src/core/model/shared.ts', import.meta.url),
    'utf8',
  );
  const inputsSource = await readFile(
    new URL('../src/core/model/inputs.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelSource, /\.\/shared\.js/u);
  assert.match(modelSource, /\.\/inputs\.js/u);
  assert.doesNotMatch(modelSource, /function normalizeMetadata\(/u);
  assert.doesNotMatch(modelSource, /function replaceById\(/u);
  assert.doesNotMatch(modelSource, /export interface CoreProjectWriteInput/u);
  assert.doesNotMatch(modelSource, /export interface CoreApprovalBindingWriteInput/u);
  assert.match(sharedSource, /export function normalizeMetadata/u);
  assert.match(sharedSource, /export function replaceById/u);
  assert.match(inputsSource, /export interface CoreProjectWriteInput/u);
  assert.match(inputsSource, /export interface CoreApprovalBindingWriteInput/u);
});

test('core model composes dedicated record write modules instead of defining record mutations inline', async () => {
  const modelSource = await readFile(
    new URL('../src/core/model/index.ts', import.meta.url),
    'utf8',
  );
  const recordModuleSource = await readFile(
    new URL('../src/core/model/records.ts', import.meta.url),
    'utf8',
  );
  const planningRecordModuleSource = await readFile(
    new URL('../src/core/model/planningRecords.ts', import.meta.url),
    'utf8',
  );
  const executionRecordModuleSource = await readFile(
    new URL('../src/core/model/executionRecords.ts', import.meta.url),
    'utf8',
  );
  const governanceRecordModuleSource = await readFile(
    new URL('../src/core/model/governanceRecords.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelSource, /\.\/records\.js/u);
  assert.doesNotMatch(modelSource, /export function upsertCoreProject\(/u);
  assert.doesNotMatch(modelSource, /export function upsertCoreRun\(/u);
  assert.doesNotMatch(modelSource, /export function appendCoreActivity\(/u);
  assert.match(recordModuleSource, /planningRecords\.js/u);
  assert.match(recordModuleSource, /executionRecords\.js/u);
  assert.match(recordModuleSource, /governanceRecords\.js/u);
  assert.doesNotMatch(recordModuleSource, /export function upsertCoreProject\(/u);
  assert.doesNotMatch(recordModuleSource, /export function appendCoreActivity\(/u);
  assert.doesNotMatch(recordModuleSource, /export function upsertCoreApprovalBinding\(/u);
  assert.match(planningRecordModuleSource, /export function upsertCoreProject/u);
  assert.match(planningRecordModuleSource, /export function upsertCoreArtifact/u);
  assert.match(executionRecordModuleSource, /export function upsertCoreRun/u);
  assert.match(executionRecordModuleSource, /export function appendCoreActivity/u);
  assert.match(governanceRecordModuleSource, /export function upsertCoreApprovalBinding/u);
});

test('core model composes dedicated task-control and memory-binding modules instead of defining them inline', async () => {
  const modelSource = await readFile(
    new URL('../src/core/model/index.ts', import.meta.url),
    'utf8',
  );
  const taskControlSource = await readFile(
    new URL('../src/core/model/taskControls.ts', import.meta.url),
    'utf8',
  );
  const memoryBindingSource = await readFile(
    new URL('../src/core/model/memoryBindings.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelSource, /\.\/taskControls\.js/u);
  assert.match(modelSource, /\.\/memoryBindings\.js/u);
  assert.doesNotMatch(modelSource, /export function upsertCoreTask\(/u);
  assert.doesNotMatch(modelSource, /export function writeApprovalDecision\(/u);
  assert.doesNotMatch(modelSource, /export function addDurableMemory\(/u);
  assert.match(taskControlSource, /export function upsertCoreTask/u);
  assert.match(taskControlSource, /export function writeApprovalDecision/u);
  assert.match(memoryBindingSource, /export function addDurableMemory/u);
  assert.match(memoryBindingSource, /export function createBotBinding/u);
});

test('task lifecycle composes dedicated shared and watcher modules instead of defining runtime observation helpers inline', async () => {
  const lifecycleSource = await readFile(
    new URL('../src/core/taskLifecycle.ts', import.meta.url),
    'utf8',
  );
  const sharedSource = await readFile(
    new URL('../src/core/taskLifecycleShared.ts', import.meta.url),
    'utf8',
  );
  const watcherSource = await readFile(
    new URL('../src/core/taskLifecycleWatchers.ts', import.meta.url),
    'utf8',
  );
  const locatorSource = await readFile(
    new URL('../src/core/taskExecutionLocator.ts', import.meta.url),
    'utf8',
  );
  const chatLocatorSource = await readFile(
    new URL('../src/products/chat/state/taskExecutionLocator.ts', import.meta.url),
    'utf8',
  );

  assert.match(lifecycleSource, /taskLifecycleShared\.js/u);
  assert.match(lifecycleSource, /taskLifecycleWatchers\.js/u);
  assert.match(lifecycleSource, /taskExecutionLocator\.js/u);
  assert.doesNotMatch(lifecycleSource, /function asRecord\(/u);
  assert.doesNotMatch(lifecycleSource, /const activeTaskRunWatchers = new Map/u);
  assert.doesNotMatch(lifecycleSource, /products\/chat\/api\/contracts\.js/u);
  assert.match(sharedSource, /export function asRecord/u);
  assert.match(sharedSource, /export function buildTerminalTaskMessage/u);
  assert.doesNotMatch(sharedSource, /products\/chat\/api\/contracts\.js/u);
  assert.match(watcherSource, /export interface StartTaskRunWatcherInput/u);
  assert.match(watcherSource, /export function startTaskRunWatcher/u);
  assert.doesNotMatch(watcherSource, /products\/chat\/state\/store\.js/u);
  assert.match(locatorSource, /export interface TaskExecutionLocator/u);
  assert.match(locatorSource, /export function resolveTaskConversationSessionId/u);
  assert.match(chatLocatorSource, /export function createChatTaskExecutionLocator/u);
});

test('core projection composes a dedicated workflow projection module instead of defining workflow record derivation inline', async () => {
  const projectionSource = await readFile(
    new URL('../src/products/chat/state/core-projection/index.ts', import.meta.url),
    'utf8',
  );
  const workflowProjectionSource = await readFile(
    new URL('../src/products/chat/state/core-projection/workflow.ts', import.meta.url),
    'utf8',
  );

  assert.match(projectionSource, /\.\/workflow\.js/u);
  assert.doesNotMatch(projectionSource, /function createWorkflowRun\(/u);
  assert.doesNotMatch(projectionSource, /function createWorkflowActivity\(/u);
  assert.match(workflowProjectionSource, /export function createWorkflowRun/u);
  assert.match(workflowProjectionSource, /export function createWorkflowActivity/u);
});

test('core projection composes a dedicated entity projection module instead of defining actor and channel record derivation inline', async () => {
  const projectionSource = await readFile(
    new URL('../src/products/chat/state/core-projection/index.ts', import.meta.url),
    'utf8',
  );
  const entityProjectionSource = await readFile(
    new URL('../src/products/chat/state/core-projection/entities.ts', import.meta.url),
    'utf8',
  );

  assert.match(projectionSource, /\.\/entities\.js/u);
  assert.doesNotMatch(projectionSource, /function createConversationFromChannel\(/u);
  assert.doesNotMatch(projectionSource, /function createTaskFromChannel\(/u);
  assert.match(entityProjectionSource, /export function createConversationFromChannel/u);
  assert.match(entityProjectionSource, /export function createTaskFromChannel/u);
  assert.match(entityProjectionSource, /export function syncBotBindings/u);
});

test('store consumes dedicated chat snapshot normalization instead of defining it inline', async () => {
  const storeSource = await readFile(
    new URL('../src/products/chat/state/store.ts', import.meta.url),
    'utf8',
  );
  const snapshotModule = await readFile(
    new URL('../src/products/chat/state/chat-snapshot/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(storeSource, /chat-snapshot\/index\.js/u);
  assert.doesNotMatch(storeSource, /function normalizeChatState\(/u);
  assert.doesNotMatch(storeSource, /function normalizePersistedChatSnapshot\(/u);
  assert.match(snapshotModule, /export function normalizeChatState/u);
  assert.match(snapshotModule, /export function normalizePersistedChatSnapshot/u);
});

test('companion box store composes dedicated file and memory store modules instead of defining both stores inline', async () => {
  const storeSource = await readFile(
    new URL('../src/products/chat/state/companion-box/index.ts', import.meta.url),
    'utf8',
  );
  const fileStoreSource = await readFile(
    new URL('../src/products/chat/state/companion-box/fileStore.ts', import.meta.url),
    'utf8',
  );
  const memoryStoreSource = await readFile(
    new URL('../src/products/chat/state/companion-box/memoryStore.ts', import.meta.url),
    'utf8',
  );

  assert.match(storeSource, /\.\/fileStore\.js/u);
  assert.match(storeSource, /\.\/memoryStore\.js/u);
  assert.doesNotMatch(storeSource, /export class FileCompanionBoxStore/u);
  assert.doesNotMatch(storeSource, /export class MemoryCompanionBoxStore/u);
  assert.match(fileStoreSource, /export class FileCompanionBoxStore/u);
  assert.match(memoryStoreSource, /export class MemoryCompanionBoxStore/u);
});

test('companion box file store consumes dedicated snapshot helpers instead of defining normalization inline', async () => {
  const fileStoreSource = await readFile(
    new URL('../src/products/chat/state/companion-box/fileStore.ts', import.meta.url),
    'utf8',
  );
  const snapshotModule = await readFile(
    new URL('../src/products/chat/state/companion-box/snapshot.ts', import.meta.url),
    'utf8',
  );

  assert.match(fileStoreSource, /\.\/snapshot\.js/u);
  assert.doesNotMatch(fileStoreSource, /function normalizeSnapshot\(/u);
  assert.doesNotMatch(fileStoreSource, /function deriveCompanionBoxStatePath\(/u);
  assert.doesNotMatch(fileStoreSource, /function buildStorageLayout\(/u);
  assert.match(snapshotModule, /export function normalizeSnapshot/u);
  assert.match(snapshotModule, /export function deriveCompanionBoxStatePath/u);
  assert.match(snapshotModule, /export function buildStorageLayout/u);
});

test('companion box file and memory stores consume dedicated operations helpers instead of defining mutation flows inline', async () => {
  const fileStoreSource = await readFile(
    new URL('../src/products/chat/state/companion-box/fileStore.ts', import.meta.url),
    'utf8',
  );
  const memoryStoreSource = await readFile(
    new URL('../src/products/chat/state/companion-box/memoryStore.ts', import.meta.url),
    'utf8',
  );
  const operationsModule = await readFile(
    new URL('../src/products/chat/state/companion-box/operations.ts', import.meta.url),
    'utf8',
  );

  assert.match(fileStoreSource, /\.\/operations\.js/u);
  assert.match(memoryStoreSource, /\.\/operations\.js/u);
  assert.doesNotMatch(fileStoreSource, /function ensureBox\(/u);
  assert.doesNotMatch(fileStoreSource, /function summarizeBox\(/u);
  assert.doesNotMatch(fileStoreSource, /function replaceDerivedForSource\(/u);
  assert.doesNotMatch(memoryStoreSource, /function ensureBox\(/u);
  assert.match(operationsModule, /export function ensureCompanionBox/u);
  assert.match(operationsModule, /export function ingestCompanionSource/u);
  assert.match(operationsModule, /export function updateCompanionSource/u);
  assert.match(operationsModule, /export function deleteCompanionSource/u);
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

test('app server dependency resolver wires the chat memory adapter into platform memory', async () => {
  const source = await readFile(
    new URL('../src/app/server/dependencies.ts', import.meta.url),
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

test('actor and owner-profile helpers are consumed from the dedicated core actors module', async () => {
  const memoryService = await readFile(
    new URL('../src/platform/memory/service.ts', import.meta.url),
    'utf8',
  );
  const telegramBridge = await readFile(
    new URL('../src/platform/transports/telegram/bridge.ts', import.meta.url),
    'utf8',
  );
  const apiShared = await readFile(
    new URL('../src/products/chat/api/routeSupport.ts', import.meta.url),
    'utf8',
  );
  const botBindingRoutes = await readFile(
    new URL('../src/products/chat/api/botBindingRoutes.ts', import.meta.url),
    'utf8',
  );
  const coreProjection = await readFile(
    new URL('../src/products/chat/state/core-projection/index.ts', import.meta.url),
    'utf8',
  );
  const runtimeSessionState = await readFile(
    new URL('../src/products/chat/state/runtime-session/state.ts', import.meta.url),
    'utf8',
  );

  for (const source of [
    memoryService,
    telegramBridge,
    apiShared,
    botBindingRoutes,
    coreProjection,
    runtimeSessionState,
  ]) {
    assert.match(source, /core\/actors\.js/u);
  }

  assert.doesNotMatch(memoryService, /createCatActorId.*core\/model\.js/u);
  assert.doesNotMatch(telegramBridge, /createCatActorId.*core\/model\.js/u);
  assert.doesNotMatch(apiShared, /createCatActorId.*core\/model\.js/u);
  assert.doesNotMatch(botBindingRoutes, /GLOBAL_ORCHESTRATOR_ACTOR_ID.*core\/model\.js/u);
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

test('app server dependency resolver wires the chat telegram bridge adapter into platform transports', async () => {
  const source = await readFile(
    new URL('../src/app/server/dependencies.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /createChatTelegramRoomBridge/u);
  assert.match(source, /telegramRoomBridge/u);
});
