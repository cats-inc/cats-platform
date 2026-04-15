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
  assert.match(source, /runServerStartupRecoveryPasses/u);
  assert.match(source, /routeRequest/u);
  assert.doesNotMatch(source, /async function routeRequest/u);
  assert.doesNotMatch(source, /async function runServerStartupRecoveryPasses/u);
  assert.doesNotMatch(source, /function createDefaultTelegramRelay/u);
});

test('app server request router owns shell, provider, transport, and static-route assembly', async () => {
  const source = await readFile(
    new URL('../src/app/server/requestRouter.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /routeCoreApi/u);
  assert.match(source, /routeChatApi/u);
  assert.match(source, /routeWorkApi/u);
  assert.match(source, /routeCodeApi/u);
  assert.match(source, /handleProviderRegistry/u);
  assert.match(source, /handleTelegramWebhook/u);
  assert.match(source, /tryServeWebAsset/u);
  assert.doesNotMatch(source, /handleWorkPlaceholder/u);
  assert.doesNotMatch(source, /handleCodePlaceholder/u);
});

test('app server contracts expose shared and per-product dependency slices for parallel delivery', async () => {
  const source = await readFile(
    new URL('../src/app/server/contracts.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export interface SharedServerDependencies/u);
  assert.match(source, /export interface ChatServerDependencies/u);
  assert.match(source, /export interface WorkServerDependencies/u);
  assert.match(source, /export interface CodeServerDependencies/u);
  assert.match(source, /shared:\s+SharedServerDependencies/u);
  assert.match(source, /chat:\s+ChatServerDependencies/u);
  assert.match(source, /work\?:\s+WorkServerDependencies/u);
  assert.match(source, /code\?:\s+CodeServerDependencies/u);
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

test('chat model re-exports dedicated channel-group mutation helpers instead of defining them inline', async () => {
  const modelModule = await readFile(
    new URL('../src/products/chat/state/model/index.ts', import.meta.url),
    'utf8',
  );
  const channelGroupsModule = await readFile(
    new URL('../src/products/chat/state/model/channelGroups.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelModule, /from '\.\/channelGroups\.js'/u);
  assert.doesNotMatch(modelModule, /export function renameParallelChatGroup\(/u);
  assert.doesNotMatch(modelModule, /export function deleteChannel\(/u);
  assert.match(channelGroupsModule, /export function renameParallelChatGroup/u);
  assert.match(channelGroupsModule, /export function deleteChannel/u);
});

test('chat model re-exports dedicated channel-state mutation helpers instead of defining them inline', async () => {
  const modelModule = await readFile(
    new URL('../src/products/chat/state/model/index.ts', import.meta.url),
    'utf8',
  );
  const channelStateModule = await readFile(
    new URL('../src/products/chat/state/model/channelState.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelModule, /from '\.\/channelState\.js'/u);
  assert.doesNotMatch(modelModule, /export function setChannelRoomRouting\(/u);
  assert.doesNotMatch(modelModule, /export function replaceState\(/u);
  assert.match(channelStateModule, /export function setChannelRoomRouting/u);
  assert.match(channelStateModule, /export function replaceState/u);
});

test('chat model re-exports dedicated channel-lease mutation helpers instead of defining them inline', async () => {
  const modelModule = await readFile(
    new URL('../src/products/chat/state/model/index.ts', import.meta.url),
    'utf8',
  );
  const channelLeaseModule = await readFile(
    new URL('../src/products/chat/state/model/channelLeases.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelModule, /from '\.\/channelLeases\.js'/u);
  assert.doesNotMatch(modelModule, /export function setChannelCatLease\(/u);
  assert.doesNotMatch(modelModule, /export function setChannelParticipantLease\(/u);
  assert.match(channelLeaseModule, /export function setChannelCatLease/u);
  assert.match(channelLeaseModule, /export function setChannelParticipantLease/u);
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

test('chat read routes consume a dedicated channel repair helper instead of composing repair passes inline', async () => {
  const routeSupportModule = await readFile(
    new URL('../src/products/chat/api/routeSupport.ts', import.meta.url),
    'utf8',
  );
  const channelModule = await readFile(
    new URL('../src/products/chat/api/resources/channelRoutes.ts', import.meta.url),
    'utf8',
  );
  const repairHelperModule = await readFile(
    new URL('../src/products/chat/api/channelRepair.ts', import.meta.url),
    'utf8',
  );

  assert.match(routeSupportModule, /\.\/channelRepair\.js/u);
  assert.match(channelModule, /\.\.\/channelRepair\.js/u);
  assert.match(repairHelperModule, /export function applyChannelReadRepairs/u);
  assert.match(repairHelperModule, /export async function repairChannelReadState/u);
  assert.doesNotMatch(routeSupportModule, /repairMissingSessionStartedMessages/u);
  assert.doesNotMatch(routeSupportModule, /repairMissingStartupRecoveryNotice/u);
  assert.doesNotMatch(routeSupportModule, /repairOrphanedCompletedDispatchTurn/u);
  assert.doesNotMatch(channelModule, /repairMissingSessionStartedMessages/u);
  assert.doesNotMatch(channelModule, /repairMissingStartupRecoveryNotice/u);
  assert.doesNotMatch(channelModule, /repairOrphanedCompletedDispatchTurn/u);
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
  const roomRoutingContracts = await readFile(
    new URL('../src/shared/roomRouting.ts', import.meta.url),
    'utf8',
  );

  assert.match(chatContracts, /shared\/roomRouting\.js/u);
  assert.doesNotMatch(
    chatContracts,
    /export interface RoomRoutingState/u,
  );
  assert.match(roomRoutingContracts, /export interface RoomRoutingState/u);
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

test('workspace renderer apps delegate settings routing through the shared app frame without chat product contracts', async () => {
  const workAppSource = await readFile(
    new URL('../src/products/work/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const codeAppSource = await readFile(
    new URL('../src/products/code/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const sharedWorkspaceAppSource = await readFile(
    new URL('../src/products/shared/renderer/WorkspaceProductApp.tsx', import.meta.url),
    'utf8',
  );
  const sharedLocationHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useWorkspaceLocationState.ts', import.meta.url),
    'utf8',
  );
  const sharedReadyShellSource = await readFile(
    new URL('../src/products/shared/renderer/ProductReadyShell.tsx', import.meta.url),
    'utf8',
  );

  assert.match(sharedWorkspaceAppSource, /ProductReadyShell/u);
  assert.match(sharedWorkspaceAppSource, /useWorkspaceLocationState/u);
  assert.doesNotMatch(sharedWorkspaceAppSource, /readWorkspaceNewChatLeadCatId/u);
  assert.doesNotMatch(sharedWorkspaceAppSource, /isWorkspaceNewChatPath/u);
  assert.match(sharedLocationHookSource, /export function useWorkspaceLocationState/u);
  assert.match(sharedLocationHookSource, /useLocation/u);
  assert.match(sharedLocationHookSource, /useMatch/u);
  assert.match(sharedReadyShellSource, /PlatformSettingsRoutes/u);

  for (const source of [workAppSource, codeAppSource]) {
    assert.match(source, /createWorkspaceProductApp/u);
    assert.doesNotMatch(source, /products\/chat\/api\/contracts\.js/u);
    assert.doesNotMatch(source, /\bChatSettingsPayload\b/u);
    assert.doesNotMatch(source, /as unknown as/u);
  }
});

test('shared audience-participant builder stays independent from chat renderer components', async () => {
  const builderSource = await readFile(
    new URL('../src/products/shared/renderer/audienceParticipantBuilder.ts', import.meta.url),
    'utf8',
  );

  assert.match(builderSource, /export interface AudienceParticipantStackInput/u);
  assert.doesNotMatch(
    builderSource,
    /products\/chat\/renderer\/components\/ComposerParticipantStack\.js/u,
  );
});

test('chat and workspace apps consume a dedicated generic-draft route entry hook', async () => {
  const chatAppSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const workspaceAppSource = await readFile(
    new URL('../src/products/shared/renderer/WorkspaceProductApp.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useOnGenericDraftRouteEntry.ts', import.meta.url),
    'utf8',
  );

  assert.match(chatAppSource, /useOnGenericDraftRouteEntry/u);
  assert.match(workspaceAppSource, /useOnGenericDraftRouteEntry/u);
  assert.doesNotMatch(chatAppSource, /wasGenericNewChatRoute/u);
  assert.doesNotMatch(workspaceAppSource, /wasGenericNewChatRoute/u);
  assert.match(hookSource, /export function useOnGenericDraftRouteEntry/u);
  assert.match(hookSource, /useRef/u);
  assert.match(hookSource, /justEnteredGenericDraftRoute/u);
});

test('chat and workspace apps consume shared channel-title presentation helpers', async () => {
  const workspaceUtilsSource = await readFile(
    new URL('../src/products/shared/renderer/workspaceChatUtils.tsx', import.meta.url),
    'utf8',
  );
  const chatUtilsSource = await readFile(
    new URL('../src/products/chat/renderer/chatUtils.tsx', import.meta.url),
    'utf8',
  );
  const documentTitleHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useProductChannelDocumentTitle.ts', import.meta.url),
    'utf8',
  );

  assert.match(workspaceUtilsSource, /export function presentChannelTitle/u);
  assert.match(chatUtilsSource, /presentWorkspaceChannelTitle/u);
  assert.match(documentTitleHookSource, /presentChannelTitle\(routeChannelTitle\)/u);
  assert.doesNotMatch(documentTitleHookSource, /routeChannelTitle\.trim\(\) === 'Untitled chat'/u);
  assert.doesNotMatch(documentTitleHookSource, /routeChannelTitle\.trim\(\) === "Untitled chat"/u);
});

test('chat and workspace apps consume a shared product document-title hook', async () => {
  const chatAppSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const workspaceAppSource = await readFile(
    new URL('../src/products/shared/renderer/WorkspaceProductApp.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useProductChannelDocumentTitle.ts', import.meta.url),
    'utf8',
  );

  assert.match(chatAppSource, /useProductChannelDocumentTitle/u);
  assert.match(workspaceAppSource, /useProductChannelDocumentTitle/u);
  assert.doesNotMatch(chatAppSource, /document\.title = routeChannelTitle/u);
  assert.doesNotMatch(workspaceAppSource, /document\.title = routeChannelTitle/u);
  assert.match(hookSource, /export function useProductChannelDocumentTitle/u);
  assert.match(hookSource, /presentChannelTitle/u);
  assert.match(hookSource, /document\.title = routeChannelTitle/u);
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

  assert.match(dispatchRouting, /room-routing\/workflow\.js/u);
  assert.doesNotMatch(dispatchRouting, /function createWorkflowTurn\(/u);
  assert.doesNotMatch(dispatchRouting, /function addWorkflowCheckpoint\(/u);
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
  assert.match(dispatchFinalizeModule, /export function finalizeDispatchTurn/u);
  assert.match(dispatchFinalizeModule, /finalizeWorkflowTurn\(/u);
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
  const sessionTaskExecutionModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/taskExecution.ts', import.meta.url),
    'utf8',
  );
  const sessionLaunchModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/sessionLaunch.ts', import.meta.url),
    'utf8',
  );
  const sessionReuseModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/sessionReuse.ts', import.meta.url),
    'utf8',
  );
  const sessionStartModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/sessionStart.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchWakeModule, /runtime-session\/index\.js/u);
  assert.doesNotMatch(dispatchWakeModule, /async function ensureTargetSession\(/u);
  assert.doesNotMatch(dispatchWakeModule, /async function maybeAutoCheckoutChannelTask\(/u);
  assert.match(sessionRoutingModule, /\.\/wake\.js/u);
  assert.match(sessionRoutingModule, /\.\/taskExecution\.js/u);
  assert.match(sessionWakeModule, /export async function ensureTargetSession/u);
  assert.doesNotMatch(sessionWakeModule, /export async function maybeAutoCheckoutChannelTask/u);
  assert.doesNotMatch(sessionWakeModule, /async function resolveExistingTargetSessionOutcome\(/u);
  assert.match(sessionWakeModule, /\.\/sessionReuse\.js/u);
  assert.doesNotMatch(sessionWakeModule, /async function startAttachedTargetSession\(/u);
  assert.match(sessionWakeModule, /\.\/sessionLaunch\.js/u);
  assert.doesNotMatch(sessionWakeModule, /export async function createOrchestratorTargetRuntimeSession/u);
  assert.match(sessionTaskExecutionModule, /export async function maybeAutoCheckoutChannelTask/u);
  assert.match(sessionLaunchModule, /export async function startAttachedTargetSession/u);
  assert.match(sessionReuseModule, /export async function resolveExistingTargetSessionOutcome/u);
  assert.match(sessionStartModule, /export async function createOrchestratorTargetRuntimeSession/u);
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
  const sessionWakeModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/wake.ts', import.meta.url),
    'utf8',
  );
  const sessionTaskExecutionModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/taskExecution.ts', import.meta.url),
    'utf8',
  );
  const sessionLaunchModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/sessionLaunch.ts', import.meta.url),
    'utf8',
  );
  const sessionReuseModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/sessionReuse.ts', import.meta.url),
    'utf8',
  );
  const sessionStartModule = await readFile(
    new URL('../src/products/chat/state/runtime-session/sessionStart.ts', import.meta.url),
    'utf8',
  );

  assert.match(sessionRoutingModule, /\.\/shared\.js/u);
  assert.match(sessionRoutingModule, /\.\/wake\.js/u);
  assert.match(sessionRoutingModule, /\.\/taskExecution\.js/u);
  assert.match(sessionRoutingModule, /\.\/activation\.js/u);
  assert.doesNotMatch(sessionRoutingModule, /export async function ensureTargetSession\(/u);
  assert.doesNotMatch(sessionRoutingModule, /export async function wakeChannelEntryParticipant\(/u);
  assert.doesNotMatch(sessionRoutingModule, /export async function activateChannelSessions\(/u);
  assert.doesNotMatch(sessionRoutingModule, /export async function maybeAutoCheckoutChannelTask\(/u);
  assert.doesNotMatch(sessionWakeModule, /export async function wakeChannelEntryParticipant\(/u);
  assert.doesNotMatch(sessionWakeModule, /export async function maybeAutoCheckoutChannelTask\(/u);
  assert.match(sessionWakeModule, /\.\/sessionReuse\.js/u);
  assert.match(sessionWakeModule, /\.\/sessionLaunch\.js/u);
  assert.doesNotMatch(sessionWakeModule, /export async function createParticipantTargetRuntimeSession\(/u);
  assert.match(sessionTaskExecutionModule, /export async function maybeAutoCheckoutChannelTask/u);
  assert.match(sessionLaunchModule, /export async function startAttachedTargetSession/u);
  assert.match(sessionReuseModule, /export async function resolveExistingTargetSessionOutcome/u);
  assert.match(sessionStartModule, /export async function createParticipantTargetRuntimeSession/u);
  assert.match(sessionActivationModule, /export async function wakeChannelEntryParticipant/u);
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
  const sharedHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useOperatorLoop.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useOperatorLoop/u);
  assert.doesNotMatch(appSource, /const refreshOperatorSnapshot = useCallback/u);
  assert.doesNotMatch(appSource, /const operatorRequestIdRef = useRef/u);
  assert.match(hookSource, /export function useOperatorLoop/u);
  assert.match(hookSource, /useWorkspaceOperatorLoop/u);
  assert.match(sharedHookSource, /fetchOperatorLoopSnapshot/u);
});

test('renderer app consumes a dedicated app-shell routing hook instead of defining route sync inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const chatHookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useAppShellRouting.ts', import.meta.url),
    'utf8',
  );
  const sharedHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useAppShellRouting/u);
  assert.doesNotMatch(appSource, /void fetchAppShell\(controller\.signal\)/u);
  assert.doesNotMatch(appSource, /updateSelectedChannel\(routeChannelId,\s*controller\.signal\)/u);
  assert.match(chatHookSource, /useWorkspaceAppShellRouting/u);
  assert.match(sharedHookSource, /fetchAppShell/u);
  assert.match(sharedHookSource, /updateSelectedChannel/u);
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
  const sharedHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useFolderBrowser.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useFolderBrowser/u);
  assert.doesNotMatch(appSource, /const loadFolderBrowse = useCallback/u);
  assert.doesNotMatch(appSource, /async function handlePickFolder\(/u);
  assert.doesNotMatch(appSource, /browseDirectories/u);
  assert.match(hookSource, /shared\/renderer\/hooks\/useFolderBrowser\.js/u);
  assert.match(sharedHookSource, /export function useFolderBrowser/u);
  assert.match(sharedHookSource, /browseDirectories/u);
  assert.match(sharedHookSource, /openFolderBrowser/u);
});

test('renderer app consumes a dedicated composer-submit hook instead of defining send flows inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useComposerSubmit.ts', import.meta.url),
    'utf8',
  );
  const sharedDispatchSource = await readFile(
    new URL('../src/products/shared/renderer/composerDispatch.ts', import.meta.url),
    'utf8',
  );
  const parallelDispatchSource = await readFile(
    new URL('../src/products/chat/renderer/composerParallelDispatch.ts', import.meta.url),
    'utf8',
  );
  const sharedRequestControlsSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useComposerRequestControls.ts', import.meta.url),
    'utf8',
  );
  const hookImplementationSource = hookSource.includes('prepareWorkspaceSendContext')
    ? sharedDispatchSource
    : hookSource;

  assert.match(appSource, /useComposerSubmit/u);
  assert.doesNotMatch(appSource, /async function submitComposerMessage\(/u);
  assert.match(hookSource, /export function useComposerSubmit/u);
  assert.match(hookSource, /prepareWorkspaceSendContext/u);
  assert.match(hookSource, /submitNewParallelChatDraft/u);
  assert.match(hookSource, /submitParallelCompareMessage/u);
  assert.match(hookSource, /useComposerRequestControls/u);
  assert.match(hookImplementationSource, /buildNewChatChannelInput/u);
  assert.match(hookImplementationSource, /insertCreatedChannelIntoPayload/u);
  assert.match(hookSource, /sendChatMessage/u);
  assert.match(parallelDispatchSource, /createParallelChatGroup/u);
  assert.match(parallelDispatchSource, /sendParallelChatMessage/u);
  assert.match(sharedRequestControlsSource, /export function useComposerRequestControls/u);
  assert.match(sharedRequestControlsSource, /cancelPendingAckRequest/u);
  assert.match(sharedRequestControlsSource, /cancelConcurrentGroup/u);
  assert.match(sharedRequestControlsSource, /cancelChannel/u);
});

test('chat and workspace composer hooks consume shared navigation and draft-reset helpers', async () => {
  const chatHookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useComposerSubmit.ts', import.meta.url),
    'utf8',
  );
  const workspaceHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts', import.meta.url),
    'utf8',
  );
  const navigationHelperSource = await readFile(
    new URL('../src/products/shared/renderer/composerNavigation.ts', import.meta.url),
    'utf8',
  );
  const draftStateHelperSource = await readFile(
    new URL('../src/products/shared/renderer/composerDraftState.ts', import.meta.url),
    'utf8',
  );
  const submitBindingsSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useComposerSubmitBindings.ts', import.meta.url),
    'utf8',
  );

  assert.match(chatHookSource, /composerNavigation\.js/u);
  assert.match(chatHookSource, /composerDraftState\.js/u);
  assert.match(chatHookSource, /useComposerSubmitBindings/u);
  assert.match(workspaceHookSource, /composerNavigation\.js/u);
  assert.match(workspaceHookSource, /composerDraftState\.js/u);
  assert.match(workspaceHookSource, /useComposerSubmitBindings/u);
  assert.match(chatHookSource, /navigateWithinManagedComposerFlow/u);
  assert.match(workspaceHookSource, /navigateWithinManagedComposerFlow/u);
  assert.match(chatHookSource, /resetComposerDraftState/u);
  assert.match(workspaceHookSource, /resetComposerDraftState/u);
  assert.match(navigationHelperSource, /export function navigateWithinManagedComposerFlow/u);
  assert.match(draftStateHelperSource, /export function resetComposerDraftState/u);
  assert.match(submitBindingsSource, /export function useComposerSubmitBindings/u);
});

test('chat and workspace apps consume shared app-shell channel action hooks', async () => {
  const chatAppSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const workspaceAppSource = await readFile(
    new URL('../src/products/shared/renderer/WorkspaceProductApp.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useWorkspaceAppShellChannelActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(chatAppSource, /useWorkspaceDirectLaneModelSave/u);
  assert.match(chatAppSource, /useWorkspaceResumeChannel/u);
  assert.match(workspaceAppSource, /useWorkspaceDirectLaneModelSave/u);
  assert.match(workspaceAppSource, /useWorkspaceResumeChannel/u);
  assert.doesNotMatch(chatAppSource, /const onResumeChannel = useCallback/u);
  assert.doesNotMatch(workspaceAppSource, /const onResumeChannel = useCallback/u);
  assert.match(hookSource, /export function useWorkspaceDirectLaneModelSave/u);
  assert.match(hookSource, /export function useWorkspaceResumeChannel/u);
  assert.match(hookSource, /activateChatChannel/u);
  assert.match(hookSource, /updateCatProfile/u);
});

test('chat and workspace apps consume a shared ready-payload publisher', async () => {
  const chatAppSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const workspaceAppSource = await readFile(
    new URL('../src/products/shared/renderer/WorkspaceProductApp.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/usePublishReadyPayload.ts', import.meta.url),
    'utf8',
  );

  assert.match(chatAppSource, /usePublishReadyPayload/u);
  assert.match(workspaceAppSource, /usePublishReadyPayload/u);
  assert.doesNotMatch(chatAppSource, /function updatePayload\(payload: AppShellPayload\)/u);
  assert.match(hookSource, /export function usePublishReadyPayload/u);
  assert.match(hookSource, /startTransition/u);
});

test('chat and workspace apps consume shared app-shell presentation helpers', async () => {
  const chatAppSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const workspaceAppSource = await readFile(
    new URL('../src/products/shared/renderer/WorkspaceProductApp.tsx', import.meta.url),
    'utf8',
  );
  const helperSource = await readFile(
    new URL('../src/products/shared/renderer/appShellPresentation.ts', import.meta.url),
    'utf8',
  );

  assert.match(chatAppSource, /buildFolderBrowserContentProps/u);
  assert.match(chatAppSource, /resolveVisibleChatChannelId/u);
  assert.match(workspaceAppSource, /buildFolderBrowserContentProps/u);
  assert.match(workspaceAppSource, /resolveVisibleChatChannelId/u);
  assert.doesNotMatch(chatAppSource, /selectedChannel\?\.id \?\? directLaneChannel\?\.id \?\? null/u);
  assert.doesNotMatch(workspaceAppSource, /selectedChannel\?\.id \?\? directLaneChannel\?\.id \?\? null/u);
  assert.match(helperSource, /export function resolveVisibleChatChannelId/u);
  assert.match(helperSource, /export function buildFolderBrowserContentProps/u);
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
  const sharedHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useWorkspaceCatAssignmentActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useCatAssignmentActions/u);
  assert.doesNotMatch(appSource, /async function onCreateAndAssignCat\(/u);
  assert.doesNotMatch(appSource, /async function onCreateAndDraftCat\(/u);
  assert.doesNotMatch(appSource, /async function onAssignExistingCat\(/u);
  assert.doesNotMatch(appSource, /async function onRemoveAssignedCat\(/u);
  assert.match(hookSource, /export function useCatAssignmentActions/u);
  assert.match(hookSource, /useWorkspaceCatAssignmentActions/u);
  assert.match(sharedHookSource, /createGlobalCat/u);
  assert.match(sharedHookSource, /assignCatToChannelApi/u);
  assert.match(sharedHookSource, /removeCatFromChannelApi/u);
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
  const sharedHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useWorkspaceGovernanceActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useGovernanceActions/u);
  assert.doesNotMatch(appSource, /async function onApprovalDecision\(/u);
  assert.doesNotMatch(appSource, /async function onChoiceSubmit\(/u);
  assert.doesNotMatch(appSource, /async function onOperatorAction\(/u);
  assert.match(hookSource, /export function useGovernanceActions/u);
  assert.match(hookSource, /useWorkspaceGovernanceActions/u);
  assert.match(sharedHookSource, /writeCoreApprovalDecision/u);
  assert.match(sharedHookSource, /writeCoreOperatorAction/u);
  assert.match(sharedHookSource, /sendChatMessage/u);
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
  const sharedHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useAppChrome.ts', import.meta.url),
    'utf8',
  );

  assert.match(appSource, /useAppChrome/u);
  assert.doesNotMatch(appSource, /document\.addEventListener\('mousedown'/u);
  assert.doesNotMatch(appSource, /writeSidebarOpenPreference/u);
  assert.doesNotMatch(appSource, /const autoResize = useCallback/u);
  assert.match(hookSource, /export\s*\{\s*useAppChrome/u);
  assert.match(hookSource, /shared\/renderer\/hooks\/useAppChrome\.js/u);
  assert.match(sharedHookSource, /export function useAppChrome/u);
  assert.match(sharedHookSource, /writeSidebarOpenPreference/u);
  assert.match(sharedHookSource, /document\.addEventListener\('mousedown'/u);
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
  assert.match(appSource, /ProductReadyShell/u);
  assert.doesNotMatch(appSource, /<Routes>/u);
  assert.doesNotMatch(appSource, /path="chats\/:channelId"/u);
  assert.match(routesSource, /export function AppRoutes/u);
  assert.match(routesSource, /chats\/:channelId/u);
  assert.match(routesSource, /path="new"/u);
});

test('renderer app keeps the new-chat greeting stable by threading the greeting seam into draft routes', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    appSource,
    /draftSurfaceProps=\{\{[\s\S]*?\bgreeting\b[\s\S]*?draftFiles/u,
  );
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
  const sharedHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useWorkspaceAppNavigationActions.ts', import.meta.url),
    'utf8',
  );
  const hookImplementationSource =
    /shared\/renderer\/hooks\/useWorkspaceAppNavigationActions\.js/u.test(hookSource)
      ? sharedHookSource
      : hookSource;

  assert.match(appSource, /useAppNavigationActions/u);
  assert.doesNotMatch(appSource, /async function onDeleteChannel\(/u);
  assert.doesNotMatch(appSource, /async function onResetSetup\(/u);
  assert.doesNotMatch(appSource, /async function onStartNewChat\(/u);
  assert.doesNotMatch(appSource, /function onOpenChatsOverview\(/u);
  assert.doesNotMatch(appSource, /function onSelect\(/u);
  assert.match(hookSource, /export function useAppNavigationActions/u);
  assert.match(hookImplementationSource, /deleteChatChannel/u);
  assert.match(hookImplementationSource, /deleteGlobalCat/u);
  assert.match(hookImplementationSource, /resolveMyCatNavigationTarget(?:ForPrefix)?/u);
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
  const sharedHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useWorkspaceAppDraftUiActions.ts', import.meta.url),
    'utf8',
  );
  const hookImplementationSource = hookSource.includes('useWorkspaceAppDraftUiActions')
    ? sharedHookSource
    : hookSource;

  assert.match(appSource, /useAppDraftUiActions/u);
  assert.doesNotMatch(appSource, /setAddCatOpen\(!addCatOpen\)/u);
  assert.doesNotMatch(appSource, /setPlusMenuOpen\(!plusMenuOpen\)/u);
  assert.doesNotMatch(appSource, /fileInputRef\.current\?\.click\(\)/u);
  assert.doesNotMatch(appSource, /navigate\(buildNewChatPath\(catId\), \{ replace: true \}\)/u);
  assert.match(hookSource, /export function useAppDraftUiActions/u);
  assert.match(hookImplementationSource, /openDraftFilePicker/u);
  assert.match(hookImplementationSource, /openDraftAddCatPanel/u);
  assert.match(hookImplementationSource, /changeDraftDefaultRecipient/u);
});

test('settings cats consumes dedicated telegram and memory hooks instead of defining side effects inline', async () => {
  const settingsCatsSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const sharedSettingsCatsSource = await readFile(
    new URL('../src/products/shared/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
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
  const sharedTelegramHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useSettingsCatsTelegram.ts', import.meta.url),
    'utf8',
  );
  const sharedMemoryHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useSettingsCatsMemory.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    settingsCatsSource,
    /shared\/renderer\/components\/settings-cats\/SettingsCats\.js/u,
  );
  assert.match(sharedSettingsCatsSource, /useSettingsCatsTelegram/u);
  assert.match(sharedSettingsCatsSource, /useSettingsCatsMemory/u);
  assert.doesNotMatch(settingsCatsSource, /beginSettingsCatsTelegramScopeLoad/u);
  assert.doesNotMatch(settingsCatsSource, /createSettingsCatsTelegramAutoLoader/u);
  assert.doesNotMatch(settingsCatsSource, /listCatMemory\(/u);
  assert.match(telegramHookSource, /export function useSettingsCatsTelegram/u);
  assert.match(memoryHookSource, /export function useSettingsCatsMemory/u);
  assert.match(telegramHookSource, /useWorkspaceSettingsCatsTelegram/u);
  assert.match(memoryHookSource, /useWorkspaceSettingsCatsMemory/u);
  assert.match(sharedTelegramHookSource, /createSettingsCatsTelegramAutoLoader/u);
  assert.match(sharedMemoryHookSource, /listCatMemory\(/u);
});

test('settings cats consumes dedicated registry actions instead of defining cat and binding mutations inline', async () => {
  const settingsCatsSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const sharedSettingsCatsSource = await readFile(
    new URL('../src/products/shared/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const registryHookSource = await readFile(
    new URL('../src/products/chat/renderer/hooks/useSettingsCatsRegistryActions.ts', import.meta.url),
    'utf8',
  );
  const sharedRegistryHookSource = await readFile(
    new URL('../src/products/shared/renderer/hooks/useSettingsCatsRegistryActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    settingsCatsSource,
    /shared\/renderer\/components\/settings-cats\/SettingsCats\.js/u,
  );
  assert.match(settingsCatsSource, /useSettingsCatsRegistryActionsHook/u);
  assert.match(sharedSettingsCatsSource, /useSettingsCatsRegistryActionsHook/u);
  assert.doesNotMatch(settingsCatsSource, /async function onCreateCat\(/u);
  assert.doesNotMatch(settingsCatsSource, /async function onRenameCat\(/u);
  assert.doesNotMatch(settingsCatsSource, /async function onMakeBossCat\(/u);
  assert.doesNotMatch(settingsCatsSource, /async function onCreateBinding\(/u);
  assert.doesNotMatch(settingsCatsSource, /async function onDeleteBinding\(/u);
  assert.match(
    registryHookSource,
    /shared\/renderer\/hooks\/useSettingsCatsRegistryActions\.js/u,
  );
  assert.match(sharedRegistryHookSource, /export function useSettingsCatsRegistryActions/u);
  assert.match(sharedRegistryHookSource, /createSettingsCatsRegistryActions/u);
  assert.match(sharedRegistryHookSource, /updateCatProfile/u);
});

test('settings cats consumes a dedicated transport panel instead of rendering telegram diagnostics inline', async () => {
  const settingsCatsSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const sharedSettingsCatsSource = await readFile(
    new URL('../src/products/shared/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const transportPanelSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCatsTransportPanel.tsx', import.meta.url),
    'utf8',
  );
  const sharedTransportPanelSource = await readFile(
    new URL('../src/products/shared/renderer/components/settings-cats/SettingsCatsTransportPanel.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    settingsCatsSource,
    /shared\/renderer\/components\/settings-cats\/SettingsCats\.js/u,
  );
  assert.match(sharedSettingsCatsSource, /SettingsCatsTransportPanel/u);
  assert.doesNotMatch(settingsCatsSource, /Last inbound: \{formatTransportTimestamp/u);
  assert.doesNotMatch(settingsCatsSource, /Tracked inboxes \{telegramDiagnostics\.bindings\.length\}/u);
  assert.match(transportPanelSource, /shared\/renderer\/components\/settings-cats\/SettingsCatsTransportPanel\.js/u);
  assert.match(sharedTransportPanelSource, /export function SettingsCatsTransportPanel/u);
  assert.match(sharedTransportPanelSource, /formatTransportTimestamp/u);
  assert.match(sharedTransportPanelSource, /No Telegram inbox bindings have received traffic yet\./u);
});

test('settings cats composes dedicated registry and create-form components instead of rendering all cat detail UI inline', async () => {
  const settingsCatsSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const sharedSettingsCatsSource = await readFile(
    new URL('../src/products/shared/renderer/components/settings-cats/SettingsCats.tsx', import.meta.url),
    'utf8',
  );
  const registrySource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCatsRegistry.tsx', import.meta.url),
    'utf8',
  );
  const sharedRegistrySource = await readFile(
    new URL('../src/products/shared/renderer/components/settings-cats/SettingsCatsRegistry.tsx', import.meta.url),
    'utf8',
  );
  const detailPanelSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCatsDetailPanel.tsx', import.meta.url),
    'utf8',
  );
  const sharedDetailPanelSource = await readFile(
    new URL('../src/products/shared/renderer/components/settings-cats/SettingsCatsDetailPanel.tsx', import.meta.url),
    'utf8',
  );
  const createFormSource = await readFile(
    new URL('../src/products/chat/renderer/components/settings-cats/SettingsCatsCreateForm.tsx', import.meta.url),
    'utf8',
  );
  const sharedCreateFormSource = await readFile(
    new URL('../src/products/shared/renderer/components/settings-cats/SettingsCatsCreateForm.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    settingsCatsSource,
    /shared\/renderer\/components\/settings-cats\/SettingsCats\.js/u,
  );
  assert.match(sharedSettingsCatsSource, /SettingsCatsRegistryComponent/u);
  assert.match(sharedSettingsCatsSource, /SettingsCatsCreateForm/u);
  assert.doesNotMatch(settingsCatsSource, /className="catDetailSection"/u);
  assert.doesNotMatch(settingsCatsSource, /ProviderModelFields/u);
  assert.match(
    registrySource,
    /shared\/renderer\/components\/settings-cats\/SettingsCatsRegistry\.js/u,
  );
  assert.match(sharedRegistrySource, /SettingsCatsDetailPanel/u);
  assert.doesNotMatch(sharedRegistrySource, /className="memoryForm"/u);
  assert.match(
    detailPanelSource,
    /shared\/renderer\/components\/settings-cats\/SettingsCatsDetailPanel\.js/u,
  );
  assert.match(sharedDetailPanelSource, /AvatarCropDialog/u);
  assert.match(sharedDetailPanelSource, /export function SettingsCatsDetailPanel/u);
  assert.match(
    createFormSource,
    /shared\/renderer\/components\/settings-cats\/SettingsCatsCreateForm\.js/u,
  );
  assert.match(sharedCreateFormSource, /CatCreationFields/u);
  assert.match(sharedCreateFormSource, /export function SettingsCatsCreateForm/u);
});

test('renderer styles compose a shared design layer and product-owned chat partials', async () => {
  const appRendererMainSource = await readFile(
    new URL('../src/app/renderer/main.tsx', import.meta.url),
    'utf8',
  );
  const chatRendererMainSource = await readFile(
    new URL('../src/products/chat/renderer/main.tsx', import.meta.url),
    'utf8',
  );
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const designIndexSource = await readFile(
    new URL('../src/design/index.css', import.meta.url),
    'utf8',
  );
  const badgeStylesSource = await readFile(
    new URL('../src/design/components/badge.css', import.meta.url),
    'utf8',
  );
  const panelStylesSource = await readFile(
    new URL('../src/design/components/panel.css', import.meta.url),
    'utf8',
  );
  const formsStylesSource = await readFile(
    new URL('../src/design/components/forms.css', import.meta.url),
    'utf8',
  );
  const sidebarChromeStylesSource = await readFile(
    new URL('../src/design/components/sidebar-chrome.css', import.meta.url),
    'utf8',
  );
  const menuStylesSource = await readFile(
    new URL('../src/design/components/menu.css', import.meta.url),
    'utf8',
  );
  const choiceStylesSource = await readFile(
    new URL('../src/design/components/choices.css', import.meta.url),
    'utf8',
  );
  const operatorChromeStylesSource = await readFile(
    new URL('../src/design/components/operator-chrome.css', import.meta.url),
    'utf8',
  );
  const placeholderStylesSource = await readFile(
    new URL('../src/design/components/product-placeholder.css', import.meta.url),
    'utf8',
  );
  const settingsShellStylesSource = await readFile(
    new URL('../src/design/components/settings-shell.css', import.meta.url),
    'utf8',
  );
  const stylesIndexSource = await readFile(
    new URL('../src/products/chat/renderer/styles.css', import.meta.url),
    'utf8',
  );
  const settingsStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/settings.css', import.meta.url),
    'utf8',
  );
  const sharedSettingsStylesSource = await readFile(
    new URL('../src/products/shared/renderer/styles/settings.css', import.meta.url),
    'utf8',
  );
  const platformSettingsStylesSource = await readFile(
    new URL('../src/app/renderer/settings/platform-settings.css', import.meta.url),
    'utf8',
  );
  const chatStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat.css', import.meta.url),
    'utf8',
  );
  const sharedChatStylesSource = await readFile(
    new URL('../src/products/shared/renderer/styles/chat.css', import.meta.url),
    'utf8',
  );
  const chatWorkspaceStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-workspace.css', import.meta.url),
    'utf8',
  );
  const sharedChatWorkspaceStylesSource = await readFile(
    new URL('../src/products/shared/renderer/styles/chat-workspace.css', import.meta.url),
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
  const sharedChatComposerStylesSource = await readFile(
    new URL('../src/products/shared/renderer/styles/chat-composer.css', import.meta.url),
    'utf8',
  );
  const sharedChatComposerBaseStylesSource = await readFile(
    new URL('../src/products/shared/renderer/styles/chat-composer-base.css', import.meta.url),
    'utf8',
  );
  const chatSetupStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/chat-setup.css', import.meta.url),
    'utf8',
  );
  const sharedChatSetupStylesSource = await readFile(
    new URL('../src/products/shared/renderer/styles/chat-setup.css', import.meta.url),
    'utf8',
  );
  const extraStylesSource = await readFile(
    new URL('../src/products/chat/renderer/styles/extras.css', import.meta.url),
    'utf8',
  );

  assert.match(appRendererMainSource, /import '\.\.\/\.\.\/design\/index\.css';/u);
  assert.match(chatRendererMainSource, /import '\.\.\/\.\.\/\.\.\/design\/index\.css';/u);
  assert.match(appSource, /import '\.\/styles\.css';/u);
  assert.match(designIndexSource, /@import '\.\/tokens\.css';/u);
  assert.match(designIndexSource, /@import '\.\/layout\.css';/u);
  assert.match(designIndexSource, /@import '\.\/components\/choices\.css';/u);
  assert.match(designIndexSource, /@import '\.\/components\/operator-chrome\.css';/u);
  assert.match(designIndexSource, /@import '\.\/components\/product-placeholder\.css';/u);
  assert.match(designIndexSource, /@import '\.\/components\/platform-setup\.css';/u);
  assert.match(badgeStylesSource, /\.planPill/u);
  assert.match(badgeStylesSource, /\.promptChip/u);
  assert.match(panelStylesSource, /\.contentCard/u);
  assert.match(panelStylesSource, /\.feedbackText/u);
  assert.match(formsStylesSource, /\.fieldLabel/u);
  assert.match(formsStylesSource, /\.sendButton/u);
  assert.match(sidebarChromeStylesSource, /\.sidebarFooter/u);
  assert.match(sidebarChromeStylesSource, /\.profileBadge/u);
  assert.match(menuStylesSource, /\.accountMenu/u);
  assert.match(choiceStylesSource, /\.messageChoices/u);
  assert.match(choiceStylesSource, /\.messageChoiceActionButtonPrimary/u);
  assert.match(operatorChromeStylesSource, /\.operatorPanel/u);
  assert.match(operatorChromeStylesSource, /\.operatorActionButton/u);
  assert.match(operatorChromeStylesSource, /\.operatorStatusBadge/u);
  assert.match(placeholderStylesSource, /\.productPlaceholderSurface/u);
  assert.match(settingsShellStylesSource, /\.settingsShell/u);
  assert.match(settingsShellStylesSource, /\.dangerButton/u);
  assert.match(stylesIndexSource, /@import '\.\/styles\/settings\.css';/u);
  assert.match(stylesIndexSource, /@import '\.\/styles\/chat\.css';/u);
  assert.match(stylesIndexSource, /@import '\.\/styles\/extras\.css';/u);
  assert.doesNotMatch(stylesIndexSource, /@import '\.\/styles\/base\.css';/u);
  assert.doesNotMatch(stylesIndexSource, /\.tooltipPortal/u);
  assert.doesNotMatch(stylesIndexSource, /\.settingsShell/u);
  assert.doesNotMatch(stylesIndexSource, /\.myCatsSection/u);
  assert.match(chatStylesSource, /@import '\.\/chat-workspace\.css';/u);
  assert.match(chatStylesSource, /@import '\.\/chat-composer\.css';/u);
  assert.match(chatStylesSource, /@import '\.\/chat-setup\.css';/u);
  assert.doesNotMatch(
    chatStylesSource,
    /shared\/renderer\/styles\/chat\.css/u,
  );
  assert.match(sharedChatStylesSource, /@import '\.\/chat-workspace\.css';/u);
  assert.match(sharedChatStylesSource, /@import '\.\/chat-composer\.css';/u);
  assert.match(sharedChatStylesSource, /@import '\.\/chat-setup\.css';/u);
  assert.doesNotMatch(sharedChatStylesSource, /\.channelWorkspace/u);
  assert.doesNotMatch(sharedChatStylesSource, /\.composerPlusMenu/u);
  assert.doesNotMatch(sharedChatStylesSource, /\.setupWizard/u);
  assert.match(chatWorkspaceStylesSource, /@import '\.\/chat-shell\.css';/u);
  assert.match(chatWorkspaceStylesSource, /@import '\.\/chat-operator\.css';/u);
  assert.match(chatWorkspaceStylesSource, /@import '\.\/chat-thread\.css';/u);
  assert.doesNotMatch(
    chatWorkspaceStylesSource,
    /shared\/renderer\/styles\/chat-workspace\.css/u,
  );
  assert.match(sharedChatWorkspaceStylesSource, /@import '\.\/chat-shell\.css';/u);
  assert.match(sharedChatWorkspaceStylesSource, /@import '\.\/chat-operator\.css';/u);
  assert.match(sharedChatWorkspaceStylesSource, /@import '\.\/chat-thread\.css';/u);
  assert.doesNotMatch(sharedChatWorkspaceStylesSource, /\.channelWorkspace/u);
  assert.doesNotMatch(sharedChatWorkspaceStylesSource, /\.recentOverflowMenu/u);
  assert.match(
    settingsStylesSource,
    /@import '\.\.\/\.\.\/\.\.\/shared\/renderer\/styles\/settings\.css';/u,
  );
  assert.doesNotMatch(settingsStylesSource, /\.settingsShell/u);
  assert.match(
    sharedSettingsStylesSource,
    /@import '\.\.\/\.\.\/\.\.\/\.\.\/design\/components\/settings-shell\.css';/u,
  );
  assert.match(sharedSettingsStylesSource, /\.catsLayout/u);
  assert.match(
    platformSettingsStylesSource,
    /@import '\.\.\/\.\.\/\.\.\/design\/components\/settings-shell\.css';/u,
  );
  assert.doesNotMatch(
    platformSettingsStylesSource,
    /products\/chat\/renderer\/styles\/settings\.css/u,
  );
  assert.match(
    chatShellStylesSource,
    /@import '\.\.\/\.\.\/\.\.\/shared\/renderer\/styles\/chat-shell-base\.css';/u,
  );
  assert.match(chatShellStylesSource, /\.recentGroupCard/u);
  assert.match(chatOperatorStylesSource, /\.channelWorkspace/u);
  assert.doesNotMatch(chatOperatorStylesSource, /\.operatorPanel/u);
  assert.doesNotMatch(chatOperatorStylesSource, /\.operatorActionButton/u);
  assert.match(
    chatThreadStylesSource,
    /@import '\.\.\/\.\.\/\.\.\/shared\/renderer\/styles\/chat-thread-base\.css';/u,
  );
  assert.match(chatThreadStylesSource, /\.parallelFooterBar/u);
  assert.match(
    chatComposerStylesSource,
    /@import '\.\.\/\.\.\/\.\.\/shared\/renderer\/styles\/chat-composer-base\.css';/u,
  );
  assert.match(sharedChatComposerStylesSource, /@import '\.\/chat-composer-base\.css';/u);
  assert.match(sharedChatComposerBaseStylesSource, /\.composerPlusMenu/u);
  assert.match(sharedChatComposerBaseStylesSource, /\.composerPlusButton/u);
  assert.doesNotMatch(sharedChatComposerStylesSource, /\.composerRecipientChip/u);
  assert.match(
    chatSetupStylesSource,
    /@import '\.\.\/\.\.\/\.\.\/shared\/renderer\/styles\/chat-setup\.css';/u,
  );
  assert.match(sharedChatSetupStylesSource, /platform-setup\.css/u);
  assert.match(extraStylesSource, /\.myCatsSection/u);
  await assert.rejects(
    readFile(new URL('../src/products/chat/renderer/styles/base.css', import.meta.url), 'utf8'),
  );
  await assert.rejects(
    readFile(
      new URL('../src/products/chat/renderer/styles/base-foundation.css', import.meta.url),
      'utf8',
    ),
  );
  await assert.rejects(
    readFile(
      new URL('../src/products/chat/renderer/styles/base-surfaces.css', import.meta.url),
      'utf8',
    ),
  );
  await assert.rejects(
    readFile(
      new URL('../src/products/chat/renderer/styles/base-overlays.css', import.meta.url),
      'utf8',
    ),
  );
});

test('ProviderModelFields composes dedicated support helpers instead of defining catalog helpers inline', async () => {
  const componentSource = await readFile(
    new URL('../src/design/components/ProviderModelFields.tsx', import.meta.url),
    'utf8',
  );
  const supportSource = await readFile(
    new URL('../src/design/components/providerModelFieldsSupport.ts', import.meta.url),
    'utf8',
  );

  assert.match(componentSource, /providerModelFieldsSupport\.js/u);
  assert.doesNotMatch(componentSource, /function createEmptyProviderModelCatalog\(/u);
  assert.doesNotMatch(componentSource, /function sanitizeProviderRegistryReadModel\(/u);
  assert.doesNotMatch(componentSource, /function shouldAutoRecheckProviderRegistry\(/u);
  assert.match(supportSource, /export function createEmptyProviderModelCatalog/u);
  assert.match(supportSource, /export function sanitizeProviderRegistryReadModel/u);
  assert.match(supportSource, /export function shouldAutoRecheckProviderRegistry/u);
});

test('platform setup routes consume dedicated parser helpers instead of keeping validation inline', async () => {
  const routeSource = await readFile(
    new URL('../src/app/server/platformSetupRoutes.ts', import.meta.url),
    'utf8',
  );
  const assistantRouteSource = await readFile(
    new URL('../src/app/server/platformSetupAssistantRoutes.ts', import.meta.url),
    'utf8',
  );
  const diagnosticsRouteSource = await readFile(
    new URL('../src/app/server/platformSetupDiagnosticsRoutes.ts', import.meta.url),
    'utf8',
  );
  const guideCatRouteSource = await readFile(
    new URL('../src/app/server/platformSetupGuideCatRoutes.ts', import.meta.url),
    'utf8',
  );
  const preferenceRouteSource = await readFile(
    new URL('../src/app/server/platformSetupPreferenceRoutes.ts', import.meta.url),
    'utf8',
  );
  const supportSource = await readFile(
    new URL('../src/app/server/platformSetupRouteSupport.ts', import.meta.url),
    'utf8',
  );
  const mutationSource = await readFile(
    new URL('../src/app/server/platformSetupStateMutations.ts', import.meta.url),
    'utf8',
  );

  assert.match(routeSource, /platformSetupRouteSupport\.js/u);
  assert.match(routeSource, /platformSetupAssistantRoutes\.js/u);
  assert.match(routeSource, /platformSetupDiagnosticsRoutes\.js/u);
  assert.match(routeSource, /platformSetupGuideCatRoutes\.js/u);
  assert.match(routeSource, /platformSetupPreferenceRoutes\.js/u);
  assert.doesNotMatch(routeSource, /guideCatSidecarMode must be auto, drawer, or bubble/u);
  assert.doesNotMatch(routeSource, /Assistant provider is required/u);
  assert.doesNotMatch(routeSource, /async function handleBootstrapDiagnosticsOpened\(/u);
  assert.doesNotMatch(routeSource, /async function handlePlatformPreferencesUpdate\(/u);
  assert.doesNotMatch(routeSource, /assistantPresets:\s*\[\.\.\.core\.assistantPresets/u);
  assert.doesNotMatch(routeSource, /async function handleAssistantPresetCreate\(/u);
  assert.doesNotMatch(routeSource, /async function handleGuideCatUpdate\(/u);
  assert.match(supportSource, /export function parsePlatformPreferencesUpdate/u);
  assert.match(supportSource, /export function parseAssistantPresetBody/u);
  assert.match(supportSource, /export function parseGuideCatUpdateBody/u);
  assert.match(mutationSource, /export function createAssistantPreset/u);
  assert.match(mutationSource, /export function upsertGuideCat/u);
  assert.match(assistantRouteSource, /export async function routePlatformAssistantPresetApi/u);
  assert.match(assistantRouteSource, /async function handleAssistantPresetCreate\(/u);
  assert.match(diagnosticsRouteSource, /export async function routePlatformSetupDiagnosticsApi/u);
  assert.match(diagnosticsRouteSource, /async function handleBootstrapDiagnosticsOpened\(/u);
  assert.match(guideCatRouteSource, /export async function routePlatformGuideCatApi/u);
  assert.match(guideCatRouteSource, /async function handleGuideCatUpdate\(/u);
  assert.match(preferenceRouteSource, /export async function routePlatformPreferenceApi/u);
  assert.match(preferenceRouteSource, /async function handlePlatformPreferencesUpdate\(/u);
});

test('conversation sidebar consumes a dedicated view-model helper instead of defining all derived state inline', async () => {
  const sidebarSource = await readFile(
    new URL('../src/app/renderer/productShell/ConversationSidebar.tsx', import.meta.url),
    'utf8',
  );
  const viewModelSource = await readFile(
    new URL('../src/app/renderer/productShell/conversationSidebarViewModel.ts', import.meta.url),
    'utf8',
  );

  assert.match(sidebarSource, /conversationSidebarViewModel\.js/u);
  assert.doesNotMatch(sidebarSource, /const telegramBoundCatIds = new Set\(/u);
  assert.doesNotMatch(sidebarSource, /const runtimeFooterStatus = resolveRuntimePresentationStatus\(/u);
  assert.match(viewModelSource, /export function buildConversationSidebarViewModel/u);
});

test('conversation sidebar delegates recents rendering to a dedicated section module', async () => {
  const sidebarSource = await readFile(
    new URL('../src/app/renderer/productShell/ConversationSidebar.tsx', import.meta.url),
    'utf8',
  );
  const recentsSource = await readFile(
    new URL('../src/app/renderer/productShell/ConversationSidebarRecents.tsx', import.meta.url),
    'utf8',
  );

  assert.match(sidebarSource, /ConversationSidebarRecents\.js/u);
  assert.doesNotMatch(sidebarSource, /function ChannelItem</u);
  assert.doesNotMatch(sidebarSource, /function GroupHeaderItem\(/u);
  assert.match(recentsSource, /function ChannelItem</u);
  assert.match(recentsSource, /function GroupHeaderItem\(/u);
});

test('conversation sidebar delegates My Cats rendering to a dedicated section module', async () => {
  const sidebarSource = await readFile(
    new URL('../src/app/renderer/productShell/ConversationSidebar.tsx', import.meta.url),
    'utf8',
  );
  const myCatsSource = await readFile(
    new URL('../src/app/renderer/productShell/ConversationSidebarMyCats.tsx', import.meta.url),
    'utf8',
  );

  assert.match(sidebarSource, /ConversationSidebarMyCats\.js/u);
  assert.doesNotMatch(sidebarSource, /function MyCatRowItem</u);
  assert.match(myCatsSource, /function MyCatRowItem</u);
  assert.match(myCatsSource, /export function ConversationSidebarMyCatsSection</u);
});

test('conversation sidebar delegates account footer wiring to a dedicated footer module', async () => {
  const sidebarSource = await readFile(
    new URL('../src/app/renderer/productShell/ConversationSidebar.tsx', import.meta.url),
    'utf8',
  );
  const footerSource = await readFile(
    new URL('../src/app/renderer/productShell/ConversationSidebarFooter.tsx', import.meta.url),
    'utf8',
  );

  assert.match(sidebarSource, /ConversationSidebarFooter\.js/u);
  assert.doesNotMatch(sidebarSource, /<AccountIdentityMenu/u);
  assert.match(footerSource, /<AccountIdentityMenu/u);
  assert.match(footerSource, /executeEnvironmentRecovery/u);
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
  const sharedOperatorSource = await readFile(
    new URL('../src/products/shared/renderer/api/operator.ts', import.meta.url),
    'utf8',
  );
  const chatSource = await readFile(
    new URL('../src/products/chat/renderer/api/chat.ts', import.meta.url),
    'utf8',
  );
  const sharedChatSource = await readFile(
    new URL('../src/products/shared/renderer/api/chat.ts', import.meta.url),
    'utf8',
  );
  const chatImplementationSource =
    /shared\/renderer\/api\/chat\.js/u.test(chatSource)
      ? sharedChatSource
      : chatSource;

  assert.match(apiSource, /from '\.\/normalization\.js'/u);
  assert.match(apiSource, /from '\.\/operator\.js'/u);
  assert.match(apiSource, /from '\.\/chat\.js'/u);
  assert.doesNotMatch(apiSource, /async function readErrorMessage\(/u);
  assert.doesNotMatch(apiSource, /export async function fetchAppShell\(/u);
  assert.doesNotMatch(apiSource, /export async function sendChatMessage\(/u);
  assert.match(normalizationSource, /export function normalizeAppShellPayload/u);
  assert.match(operatorSource, /shared\/renderer\/api\/operator\.js/u);
  assert.match(sharedOperatorSource, /export async function fetchOperatorLoopSnapshot/u);
  assert.match(chatImplementationSource, /export async function sendChatMessage/u);
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
