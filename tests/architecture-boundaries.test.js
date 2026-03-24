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

test('runtimeActions is a thin facade over dedicated routing seams', async () => {
  const runtimeActions = await readFile(
    new URL('../src/products/chat/state/runtimeActions.ts', import.meta.url),
    'utf8',
  );

  assert.match(runtimeActions, /runtimeDispatchRouting\.js/u);
  assert.match(runtimeActions, /runtimeSessionRouting\.js/u);
  assert.doesNotMatch(runtimeActions, /export async function routeChannelMessage\(/u);
  assert.doesNotMatch(runtimeActions, /export async function activateChannelSessions\(/u);
  assert.doesNotMatch(runtimeActions, /export async function wakeChannelEntryParticipant\(/u);
});

test('runtime dispatch routing consumes dedicated room-routing workflow helpers instead of defining them inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchRouting.ts', import.meta.url),
    'utf8',
  );
  const workflowModule = await readFile(
    new URL('../src/products/chat/state/roomRoutingRuntime.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRouting, /roomRoutingRuntime\.js/u);
  assert.doesNotMatch(dispatchRouting, /function createWorkflowTurn\(/u);
  assert.doesNotMatch(dispatchRouting, /function addWorkflowCheckpoint\(/u);
  assert.match(workflowModule, /export function createWorkflowTurn/u);
  assert.match(workflowModule, /export function addWorkflowCheckpoint/u);
});

test('runtime dispatch routing consumes dedicated turn bootstrap helpers instead of defining initial turn setup inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchRouting.ts', import.meta.url),
    'utf8',
  );
  const dispatchTurnModule = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchTurn.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRouting, /runtimeDispatchTurn\.js/u);
  assert.doesNotMatch(dispatchRouting, /const initialResolution =/u);
  assert.doesNotMatch(dispatchRouting, /const outcome = createRoutingOutcome/u);
  assert.doesNotMatch(dispatchRouting, /const activeTurn = createWorkflowTurn/u);
  assert.match(dispatchTurnModule, /export function prepareDispatchTurn/u);
});

test('runtime dispatch routing consumes dedicated turn finalization helpers instead of defining terminal workflow updates inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchRouting.ts', import.meta.url),
    'utf8',
  );
  const dispatchFinalizeModule = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchFinalize.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRouting, /runtimeDispatchFinalize\.js/u);
  assert.doesNotMatch(dispatchRouting, /const terminalStatuses = deriveTerminalTurnStatuses/u);
  assert.doesNotMatch(dispatchRouting, /finalizeWorkflowTurn\(/u);
  assert.match(dispatchFinalizeModule, /export function finalizeDispatchTurn/u);
});

test('runtime dispatch routing consumes dedicated wake/readiness helpers instead of defining target wake flows inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchRouting.ts', import.meta.url),
    'utf8',
  );
  const dispatchWakeModule = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchWake.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRouting, /runtimeDispatchWake\.js/u);
  assert.doesNotMatch(dispatchRouting, /const ensured = await ensureTargetSession\(/u);
  assert.doesNotMatch(dispatchRouting, /await maybeAutoCheckoutChannelTask\(/u);
  assert.match(dispatchWakeModule, /export async function prepareReadyRequests/u);
});

test('runtime dispatch routing consumes dedicated runtime dispatch execution helpers instead of defining them inline', async () => {
  const dispatchRouting = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchRouting.ts', import.meta.url),
    'utf8',
  );
  const dispatchExecutionModule = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchExecution.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRouting, /runtimeDispatchExecution\.js/u);
  assert.doesNotMatch(dispatchRouting, /async function executeDispatch\(/u);
  assert.doesNotMatch(dispatchRouting, /async function settleInCompletionOrder/u);
  assert.doesNotMatch(dispatchRouting, /function shouldBlockAntiPingPong\(/u);
  assert.match(dispatchExecutionModule, /export async function executeDispatch/u);
  assert.match(dispatchExecutionModule, /export async function settleInCompletionOrder/u);
  assert.match(dispatchExecutionModule, /export function shouldBlockAntiPingPong/u);
});

test('runtime dispatch execution consumes dedicated runtime targeting helpers instead of defining them inline', async () => {
  const dispatchExecutionModule = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchExecution.ts', import.meta.url),
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
    new URL('../src/products/chat/state/runtimeDispatchRouting.ts', import.meta.url),
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
    new URL('../src/products/chat/state/runtimeDispatchExecution.ts', import.meta.url),
    'utf8',
  );
  const sessionStateModule = await readFile(
    new URL('../src/products/chat/state/runtimeSessionState.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchExecutionModule, /runtimeSessionState\.js/u);
  assert.doesNotMatch(dispatchExecutionModule, /function participantKey\(/u);
  assert.match(sessionStateModule, /export function participantKey/u);
});

test('runtime dispatch execution consumes dedicated runtime session-routing helpers instead of defining rewrite logic inline', async () => {
  const dispatchExecutionModule = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchExecution.ts', import.meta.url),
    'utf8',
  );
  const sessionRoutingModule = await readFile(
    new URL('../src/products/chat/state/runtimeSessionRouting.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchExecutionModule, /runtimeSessionRouting\.js/u);
  assert.doesNotMatch(dispatchExecutionModule, /function shouldRewriteOrchestratorReply\(/u);
  assert.match(sessionRoutingModule, /export function shouldRewriteOrchestratorReply/u);
});

test('runtime dispatch routing consumes dedicated dispatch-result helpers instead of defining response handling inline', async () => {
  const dispatchRoutingModule = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchRouting.ts', import.meta.url),
    'utf8',
  );
  const dispatchResultsModule = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchResults.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchRoutingModule, /runtimeDispatchResults\.js/u);
  assert.doesNotMatch(dispatchRoutingModule, /const continuationResolution = resolveTargets/u);
  assert.doesNotMatch(dispatchRoutingModule, /nextState = setReadyAfterMessage\(/u);
  assert.doesNotMatch(dispatchRoutingModule, /resolveExecutionMetadataForTarget\(/u);
  assert.match(dispatchResultsModule, /export function applyDispatchExecutions/u);
  assert.match(dispatchResultsModule, /setReadyAfterMessage/u);
  assert.match(dispatchResultsModule, /resolveExecutionMetadataForTarget/u);
});

test('runtime dispatch wake consumes dedicated runtime session-routing helpers instead of defining wake flows inline', async () => {
  const dispatchWakeModule = await readFile(
    new URL('../src/products/chat/state/runtimeDispatchWake.ts', import.meta.url),
    'utf8',
  );
  const sessionRoutingModule = await readFile(
    new URL('../src/products/chat/state/runtimeSessionRouting.ts', import.meta.url),
    'utf8',
  );

  assert.match(dispatchWakeModule, /runtimeSessionRouting\.js/u);
  assert.doesNotMatch(dispatchWakeModule, /async function ensureTargetSession\(/u);
  assert.doesNotMatch(dispatchWakeModule, /async function maybeAutoCheckoutChannelTask\(/u);
  assert.match(sessionRoutingModule, /export async function ensureTargetSession/u);
  assert.match(sessionRoutingModule, /export async function maybeAutoCheckoutChannelTask/u);
});

test('renderer app consumes a dedicated operator-loop hook instead of defining polling inline', async () => {
  const appSource = await readFile(
    new URL('../src/products/chat/renderer/App.tsx', import.meta.url),
    'utf8',
  );
  const hookSource = await readFile(
    new URL('../src/products/chat/renderer/useOperatorLoop.ts', import.meta.url),
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
    new URL('../src/products/chat/renderer/useAppShellRouting.ts', import.meta.url),
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
    new URL('../src/products/chat/renderer/useFolderBrowser.ts', import.meta.url),
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
    new URL('../src/products/chat/renderer/useComposerSubmit.ts', import.meta.url),
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
    new URL('../src/products/chat/renderer/useCatAssignmentActions.ts', import.meta.url),
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
    new URL('../src/products/chat/renderer/useGovernanceActions.ts', import.meta.url),
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

test('renderer api facade composes dedicated client modules instead of defining every transport inline', async () => {
  const apiSource = await readFile(
    new URL('../src/products/chat/renderer/api.ts', import.meta.url),
    'utf8',
  );
  const normalizationSource = await readFile(
    new URL('../src/products/chat/renderer/apiNormalization.ts', import.meta.url),
    'utf8',
  );
  const operatorSource = await readFile(
    new URL('../src/products/chat/renderer/apiOperator.ts', import.meta.url),
    'utf8',
  );
  const chatSource = await readFile(
    new URL('../src/products/chat/renderer/apiChat.ts', import.meta.url),
    'utf8',
  );

  assert.match(apiSource, /from '\.\/apiNormalization\.js'/u);
  assert.match(apiSource, /from '\.\/apiOperator\.js'/u);
  assert.match(apiSource, /from '\.\/apiChat\.js'/u);
  assert.doesNotMatch(apiSource, /async function readErrorMessage\(/u);
  assert.doesNotMatch(apiSource, /export async function fetchAppShell\(/u);
  assert.doesNotMatch(apiSource, /export async function sendChatMessage\(/u);
  assert.match(normalizationSource, /export function normalizeAppShellPayload/u);
  assert.match(operatorSource, /export async function fetchOperatorLoopSnapshot/u);
  assert.match(chatSource, /export async function sendChatMessage/u);
});

test('chat snapshot consumes dedicated room-routing snapshot normalization instead of defining it inline', async () => {
  const snapshotConsumer = await readFile(
    new URL('../src/products/chat/state/chatSnapshot.ts', import.meta.url),
    'utf8',
  );
  const snapshotModule = await readFile(
    new URL('../src/products/chat/state/roomRoutingSnapshot.ts', import.meta.url),
    'utf8',
  );

  assert.match(snapshotConsumer, /roomRoutingSnapshot\.js/u);
  assert.doesNotMatch(snapshotConsumer, /function normalizeRoomRouting\(/u);
  assert.doesNotMatch(snapshotConsumer, /function normalizeRoomWorkflowTurn\(/u);
  assert.match(snapshotModule, /export function normalizeRoomRouting/u);
});

test('store consumes dedicated core snapshot normalization instead of defining it inline', async () => {
  const storeSource = await readFile(
    new URL('../src/products/chat/state/store.ts', import.meta.url),
    'utf8',
  );
  const snapshotModule = await readFile(
    new URL('../src/products/chat/state/coreSnapshot.ts', import.meta.url),
    'utf8',
  );

  assert.match(storeSource, /coreSnapshot\.js/u);
  assert.doesNotMatch(storeSource, /function normalizeCoreTask\(/u);
  assert.doesNotMatch(storeSource, /function buildPersistedChatSnapshot\(/u);
  assert.match(snapshotModule, /export function normalizeCoreTask/u);
  assert.match(snapshotModule, /export function buildPersistedChatSnapshot/u);
});

test('core route modules consume dedicated parsing and error helpers instead of defining them inline', async () => {
  const controlRoutesSource = await readFile(
    new URL('../src/core/apiControlRoutes.ts', import.meta.url),
    'utf8',
  );
  const recordRoutesSource = await readFile(
    new URL('../src/core/apiRecordRoutes.ts', import.meta.url),
    'utf8',
  );
  const taskRoutesSource = await readFile(
    new URL('../src/core/apiTaskRoutes.ts', import.meta.url),
    'utf8',
  );
  const sharedModule = await readFile(
    new URL('../src/core/apiShared.ts', import.meta.url),
    'utf8',
  );

  assert.match(controlRoutesSource, /apiShared\.js/u);
  assert.match(recordRoutesSource, /apiShared\.js/u);
  assert.match(taskRoutesSource, /apiShared\.js/u);
  assert.doesNotMatch(controlRoutesSource, /function readRequiredString\(/u);
  assert.doesNotMatch(recordRoutesSource, /function readObjectBody\(/u);
  assert.doesNotMatch(taskRoutesSource, /function handleCoreError\(/u);
  assert.match(sharedModule, /export function readRequiredString/u);
  assert.match(sharedModule, /export async function readObjectBody/u);
  assert.match(sharedModule, /export function handleCoreError/u);
});

test('core api consumes dedicated control route modules and api contracts instead of defining them inline', async () => {
  const coreApiSource = await readFile(
    new URL('../src/core/api.ts', import.meta.url),
    'utf8',
  );
  const controlRoutesSource = await readFile(
    new URL('../src/core/apiControlRoutes.ts', import.meta.url),
    'utf8',
  );
  const recordRoutesSource = await readFile(
    new URL('../src/core/apiRecordRoutes.ts', import.meta.url),
    'utf8',
  );
  const taskRoutesSource = await readFile(
    new URL('../src/core/apiTaskRoutes.ts', import.meta.url),
    'utf8',
  );
  const constantsSource = await readFile(
    new URL('../src/core/apiConstants.ts', import.meta.url),
    'utf8',
  );
  const typesSource = await readFile(
    new URL('../src/core/apiTypes.ts', import.meta.url),
    'utf8',
  );

  assert.match(coreApiSource, /apiControlRoutes\.js/u);
  assert.match(coreApiSource, /apiRecordRoutes\.js/u);
  assert.match(coreApiSource, /apiTaskRoutes\.js/u);
  assert.match(coreApiSource, /apiTypes\.js/u);
  assert.doesNotMatch(coreApiSource, /export interface CoreApiDependencies/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreProjectWrite\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreRunWrite\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreTaskWrite\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreTaskCheckout\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreApprovals\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleCoreOperatorActionWrite\(/u);
  assert.doesNotMatch(coreApiSource, /async function handleOwnerProfileWrite\(/u);
  assert.doesNotMatch(coreApiSource, /const CORE_TASK_STATUSES = \[/u);
  assert.match(controlRoutesSource, /export async function routeCoreControlApi/u);
  assert.match(controlRoutesSource, /apiTypes\.js/u);
  assert.match(controlRoutesSource, /apiConstants\.js/u);
  assert.match(recordRoutesSource, /export async function routeCoreRecordApi/u);
  assert.match(recordRoutesSource, /apiTypes\.js/u);
  assert.match(recordRoutesSource, /apiConstants\.js/u);
  assert.match(taskRoutesSource, /export async function routeCoreTaskApi/u);
  assert.match(taskRoutesSource, /apiTypes\.js/u);
  assert.match(taskRoutesSource, /apiConstants\.js/u);
  assert.match(constantsSource, /export const CORE_TASK_STATUSES/u);
  assert.match(constantsSource, /export const CORE_APPROVAL_ACTIONS/u);
  assert.match(typesSource, /export interface CoreApiDependencies/u);
  assert.match(typesSource, /export interface CoreOrchestratorAutoResumeSummary/u);
});

test('core model consumes dedicated shared helpers and input contracts instead of defining them inline', async () => {
  const modelSource = await readFile(
    new URL('../src/core/model.ts', import.meta.url),
    'utf8',
  );
  const sharedSource = await readFile(
    new URL('../src/core/modelShared.ts', import.meta.url),
    'utf8',
  );
  const inputsSource = await readFile(
    new URL('../src/core/modelInputs.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelSource, /modelShared\.js/u);
  assert.match(modelSource, /modelInputs\.js/u);
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
    new URL('../src/core/model.ts', import.meta.url),
    'utf8',
  );
  const recordModuleSource = await readFile(
    new URL('../src/core/modelRecords.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelSource, /modelRecords\.js/u);
  assert.doesNotMatch(modelSource, /export function upsertCoreProject\(/u);
  assert.doesNotMatch(modelSource, /export function upsertCoreRun\(/u);
  assert.doesNotMatch(modelSource, /export function appendCoreActivity\(/u);
  assert.match(recordModuleSource, /export function upsertCoreProject/u);
  assert.match(recordModuleSource, /export function appendCoreActivity/u);
});

test('core model composes dedicated task-control and memory-binding modules instead of defining them inline', async () => {
  const modelSource = await readFile(
    new URL('../src/core/model.ts', import.meta.url),
    'utf8',
  );
  const taskControlSource = await readFile(
    new URL('../src/core/modelTaskControls.ts', import.meta.url),
    'utf8',
  );
  const memoryBindingSource = await readFile(
    new URL('../src/core/modelMemoryBindings.ts', import.meta.url),
    'utf8',
  );

  assert.match(modelSource, /modelTaskControls\.js/u);
  assert.match(modelSource, /modelMemoryBindings\.js/u);
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

  assert.match(lifecycleSource, /taskLifecycleShared\.js/u);
  assert.match(lifecycleSource, /taskLifecycleWatchers\.js/u);
  assert.doesNotMatch(lifecycleSource, /function asRecord\(/u);
  assert.doesNotMatch(lifecycleSource, /const activeTaskRunWatchers = new Map/u);
  assert.match(sharedSource, /export function asRecord/u);
  assert.match(sharedSource, /export function buildTerminalTaskMessage/u);
  assert.match(watcherSource, /export interface StartTaskRunWatcherInput/u);
  assert.match(watcherSource, /export function startTaskRunWatcher/u);
});

test('core projection composes a dedicated workflow projection module instead of defining workflow record derivation inline', async () => {
  const projectionSource = await readFile(
    new URL('../src/products/chat/state/coreProjection.ts', import.meta.url),
    'utf8',
  );
  const workflowProjectionSource = await readFile(
    new URL('../src/products/chat/state/coreProjectionWorkflow.ts', import.meta.url),
    'utf8',
  );

  assert.match(projectionSource, /coreProjectionWorkflow\.js/u);
  assert.doesNotMatch(projectionSource, /function createWorkflowRun\(/u);
  assert.doesNotMatch(projectionSource, /function createWorkflowActivity\(/u);
  assert.match(workflowProjectionSource, /export function createWorkflowRun/u);
  assert.match(workflowProjectionSource, /export function createWorkflowActivity/u);
});

test('core projection composes a dedicated entity projection module instead of defining actor and channel record derivation inline', async () => {
  const projectionSource = await readFile(
    new URL('../src/products/chat/state/coreProjection.ts', import.meta.url),
    'utf8',
  );
  const entityProjectionSource = await readFile(
    new URL('../src/products/chat/state/coreProjectionEntities.ts', import.meta.url),
    'utf8',
  );

  assert.match(projectionSource, /coreProjectionEntities\.js/u);
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
    new URL('../src/products/chat/state/chatSnapshot.ts', import.meta.url),
    'utf8',
  );

  assert.match(storeSource, /chatSnapshot\.js/u);
  assert.doesNotMatch(storeSource, /function normalizeChatState\(/u);
  assert.doesNotMatch(storeSource, /function normalizePersistedChatSnapshot\(/u);
  assert.match(snapshotModule, /export function normalizeChatState/u);
  assert.match(snapshotModule, /export function normalizePersistedChatSnapshot/u);
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
    new URL('../src/products/chat/api/shared.ts', import.meta.url),
    'utf8',
  );
  const botBindingRoutes = await readFile(
    new URL('../src/products/chat/api/botBindingRoutes.ts', import.meta.url),
    'utf8',
  );
  const coreProjection = await readFile(
    new URL('../src/products/chat/state/coreProjection.ts', import.meta.url),
    'utf8',
  );
  const runtimeSessionState = await readFile(
    new URL('../src/products/chat/state/runtimeSessionState.ts', import.meta.url),
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

test('app server wires the chat telegram bridge adapter into platform transports', async () => {
  const source = await readFile(
    new URL('../src/app/server/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /createChatTelegramRoomBridge/u);
  assert.match(source, /telegramRoomBridge/u);
});
