import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, normalize } from 'node:path';
import { promisify } from 'node:util';
import type { CatsCoreState } from '../../../core/types.js';
import type { CoreStore } from '../../../core/store.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import { knowledgeDigest } from '../../../platform/knowledge/productKnowledge.js';
import { createSupervisedToolRegistry } from '../../../platform/supervision/toolRegistry.js';
import { createToolBoundary, createInMemoryToolEvidenceSink } from '../../../platform/supervision/toolBoundary.js';
import { DEFAULT_SUPERVISION_SCHEMA_VERSION } from '../../../platform/supervision/contracts.js';
import type { ConversationSessionDelegate } from '../../../shared/conversationSessionDelegate.js';
import { validateRuntimeSessionPolicyInput } from '../../../shared/runtimeSessionPolicy.js';
import { CODE_SESSION_OPERATION, type CodeSessionDraft, type CodeSessionInspection,
  type CodeSessionOpenRequest, type CodeSessionOutcome } from '../shared/codeSessionOperation.js';

const git = promisify(execFile);
const KEY = 'codeSessionOpen';
interface Intent { schemaVersion: 1; requestId: string; digest: string; channelId: string;
  sessionId: string | null; target: NonNullable<CodeSessionInspection['resolvedTarget']>;
  cwd: string; ownerActorId: string;
  status: 'starting' | 'settled'; outcome?: CodeSessionOutcome }
export interface CodeSessionOperationService {
  inspect(draft: CodeSessionDraft): Promise<CodeSessionInspection>;
  inspectAttempt(draft: CodeSessionDraft, request: CodeSessionOpenRequest, signal: AbortSignal): Promise<CodeSessionOutcome>;
  open(draft: CodeSessionDraft, request: CodeSessionOpenRequest, signal: AbortSignal,
    assertAllowed?: () => Promise<void>): Promise<CodeSessionOutcome>;
}

function readIntent(core: CatsCoreState, requestId: string): Intent | undefined {
  return core.tasks.map(task => task.metadata[KEY] as Intent | undefined)
    .find(value => value?.schemaVersion === 1 && value.requestId === requestId);
}
function saveIntent(core: CatsCoreState, value: Intent): CatsCoreState {
  const id = `task-channel-${value.channelId}`;
  if (!core.tasks.some(task => task.id === id)) throw new Error('operation_task_missing');
  return { ...core, tasks: core.tasks.map(task => task.id === id
    ? { ...task, metadata: { ...task.metadata, [KEY]: value } } : task) };
}
function outcome(requestId: string, status: CodeSessionOutcome['status'], reason: string | null,
  intent?: Intent): CodeSessionOutcome {
  return { operationId: CODE_SESSION_OPERATION.id, requestId, status, reason,
    channelId: intent?.channelId ?? null, sessionId: intent?.sessionId ?? null,
    path: intent ? `/code/chats/${encodeURIComponent(intent.channelId)}` : null };
}
function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? normalize(left).toLowerCase() === normalize(right).toLowerCase()
    : normalize(left) === normalize(right);
}

/** Owner-invoked operation. Creating a session sends no coding prompt or model turn. */
export function createCodeSessionOperationService(options: {
  coreStore: CoreStore; runtimeClient: RuntimeClient; conversations: ConversationSessionDelegate;
  runMutation: <T>(channelId: string, action: () => Promise<T>) => Promise<T>;
}): CodeSessionOperationService {
  const { coreStore: store, runtimeClient: runtime, conversations } = options;
  const registry = createSupervisedToolRegistry();
  registry.register({ schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION, name: CODE_SESSION_OPERATION.id,
    manifestVersion: '1.0', description: CODE_SESSION_OPERATION.postcondition,
    sideEffect: 'local_state', preflight: 'required', blocking: 'blocking', cancellation: 'cooperative',
    approval: 'policy', evidence: 'summary', failureCodes: ['E_PRECHECK_FAILED'],
    inputSchema: { id: 'code.session.open.input', version: '1.0', format: 'json_schema' },
    outputSchema: { id: 'code.session.open.output', version: '1.0', format: 'json_schema' } });
  const boundary = createToolBoundary({ registry, evidenceSink: createInMemoryToolEvidenceSink() });
  const active = new Map<string, { digest: string; result: Promise<CodeSessionOutcome> }>();

  async function inspectDetails(draft: CodeSessionDraft): Promise<{ inspection: CodeSessionInspection; physicalPath: string | null }> {
    const checks = { target: false, workspace: false, access: !validateRuntimeSessionPolicyInput(draft.policy) };
    let reason: string | null = null;
    let physicalPath: string | null = null;
    let resolvedTarget: CodeSessionInspection['resolvedTarget'] = null;
    const core = await store.readCore();
    try {
      const health = await runtime.getHealth();
      if (!health.reachable) throw new Error('runtime_unavailable');
      if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(health.baseUrl).hostname)) {
        throw new Error('local_runtime_required');
      }
      if (!draft.target) throw new Error('target_required');
      const configured = (await runtime.getProviderConfig())[draft.target.provider];
      const selector = draft.target.instance || configured?.defaultInstance;
      const matches = configured?.instances.filter(item => selector
        && (item.id === selector || `${item.backend}/${item.id}` === selector)
        && (draft.target!.instance || item.backend === configured.defaultBackend)) ?? [];
      const target = matches.length === 1 ? matches[0] : null;
      if (!target?.backend) throw new Error('target_unavailable');
      resolvedTarget = { provider: draft.target.provider, instance: `${target.backend}/${target.id}`,
        model: draft.target.model ?? target.model ?? null };
      const diagnostics = await runtime.getProviderDiagnostics({ provider: draft.target.provider,
        backend: target.backend, instance: target.id,
        ...(target.backend === 'cli' ? { probe: 'live' } : { scope: 'availability', probe: 'light' }) });
      checks.target = diagnostics.providers.some(item => item.provider === draft.target!.provider
        && item.backend === target.backend && item.instance === target.id && item.availability.status === 'ok');
      if (!checks.target) throw new Error('target_unavailable');
      if (!draft.cwd || !isAbsolute(draft.cwd) || !(await stat(draft.cwd)).isDirectory()) throw new Error('workspace_required');
      physicalPath = await realpath(draft.cwd);
      if (draft.policy.workspaceKind === 'sandbox') throw new Error('source_or_worktree_required');
      if (draft.policy.workspaceKind === 'worktree') {
        try { await git('git', ['rev-parse', '--show-toplevel'], { cwd: physicalPath, windowsHide: true, timeout: 3000 }); }
        catch { throw new Error('git_member_required'); }
      }
      checks.workspace = true;
      if (!checks.access) throw new Error('invalid_access');
      if (!conversations.available) throw new Error('atomic_store_required');
    } catch (error) { reason = error instanceof Error && /^[a-z_]+$/u.test(error.message) ? error.message : 'readiness_unavailable'; }
    return { physicalPath, inspection: { operation: CODE_SESSION_OPERATION, checks, ready: reason === null, reason, resolvedTarget,
      revision: knowledgeDigest(JSON.stringify({ draft, physicalPath, resolvedTarget, checks, reason,
        owner: core.ownerProfile.actorId, guide: core.guideCat, operation: CODE_SESSION_OPERATION })) } };
  }
  const inspect = async (draft: CodeSessionDraft) => (await inspectDetails(draft)).inspection;

  async function verify(draft: CodeSessionDraft, intent: Intent, signal: AbortSignal): Promise<CodeSessionOutcome> {
    if (!intent.sessionId) return outcome(intent.requestId, 'unconfirmed', 'session_not_confirmed', intent);
    async function stillOwned(): Promise<boolean> {
      return conversations.inspect(intent.channelId, (core, channel) => {
        const current = readIntent(core, intent.requestId);
        return !signal.aborted && core.ownerProfile.actorId === intent.ownerActorId
          && current?.digest === intent.digest && current.channelId === intent.channelId && current.sessionId === intent.sessionId
          && Boolean(channel && channel.origin === 'code' && !channel.archived
            && channel.cwd === intent.cwd && channel.workspaceKind === draft.policy.workspaceKind
            && channel.workspaceAccess === draft.policy.workspaceAccess
            && channel.permissionMode === draft.policy.permissionMode && channel.sessionId === intent.sessionId);
      });
    }
    if (!await stillOwned()) {
      return outcome(intent.requestId, 'unconfirmed', 'conversation_changed', intent);
    }
    try {
      const { session } = await runtime.observeSession(intent.sessionId);
      const workspace = session.workspace as Record<string, unknown> | undefined;
      const target = session.providerTarget as Record<string, unknown> | undefined;
      const cwd = workspace?.runtimeCwd;
      const source = workspace?.sourceCwd;
      if (session.id !== intent.sessionId || session.providerName !== intent.target.provider
        || target?.target !== intent.target.instance || target.resolved !== true
        || (intent.target.model && session.model !== intent.target.model)
        || !['ready', 'busy'].includes(String(session.status))
        || workspace?.kind !== draft.policy.workspaceKind || workspace.access !== draft.policy.workspaceAccess
        || session.permissionMode !== draft.policy.permissionMode || typeof cwd !== 'string'
        || !samePath(await realpath(typeof source === 'string' ? source : cwd), intent.cwd)) {
        return outcome(intent.requestId, 'unconfirmed', 'session_mismatch', intent);
      }
      if (!await stillOwned()) return outcome(intent.requestId, 'unconfirmed', 'conversation_changed', intent);
      return { ...outcome(intent.requestId, 'verified', null, intent),
        workspace: { kind: String(workspace.kind), access: String(workspace.access), cwd } };
    } catch { return outcome(intent.requestId, 'unconfirmed', 'observation_unavailable', intent); }
  }

  async function execute(draft: CodeSessionDraft, request: CodeSessionOpenRequest, signal: AbortSignal,
    digest: string, assertAllowed?: () => Promise<void>): Promise<CodeSessionOutcome> {
    const existing = readIntent(await store.readCore(), request.requestId);
    if (existing) return existing.digest !== digest ? outcome(request.requestId, 'rejected', 'request_conflict')
      : existing.status === 'settled' ? verify(draft, existing, signal)
        : outcome(request.requestId, 'unconfirmed', 'interrupted_inspect_conversation', existing);
    const before = await store.readCore();
    const identity = (core: CatsCoreState) => JSON.stringify([core.ownerProfile.actorId, core.guideCat]);
    const { inspection: inspected, physicalPath } = await inspectDetails(draft);
    if (signal.aborted) return outcome(request.requestId, 'rejected', 'cancelled');
    if (!inspected.ready || inspected.revision !== request.revision) return outcome(request.requestId, 'rejected',
      !inspected.ready ? inspected.reason : 'stale_context');
    let intent!: Intent;
    let admitted = false;
    await conversations.admit({ cwd: physicalPath!, target: inspected.resolvedTarget!, policy: draft.policy }, core => {
      signal.throwIfAborted();
      const duplicate = readIntent(core, request.requestId);
      if (duplicate) {
        if (duplicate.digest !== digest) throw new Error('request_conflict');
        intent = duplicate; return duplicate.channelId;
      }
      // Recheck the owner/guide snapshot in the same atomic mutation as admission.
      if (identity(core) !== identity(before)) throw new Error('stale_context');
      return null;
    }, (core, channelId) => {
      intent = { schemaVersion: 1, requestId: request.requestId, digest, channelId,
        sessionId: null, target: inspected.resolvedTarget!, cwd: physicalPath!, ownerActorId: core.ownerProfile.actorId, status: 'starting' };
      admitted = true;
      return saveIntent(core, intent);
    });
    if (!admitted) return outcome(request.requestId, 'unconfirmed', 'already_admitted', intent);
    let result: CodeSessionOutcome;
    try {
      result = await options.runMutation(intent.channelId, async () => {
        signal.throwIfAborted();
        await assertAllowed?.();
        if (identity(await store.readCore()) !== identity(before)
          || !samePath(await realpath(intent.cwd), intent.cwd)) throw new Error('stale_context');
        const observedRuntime = new Proxy(runtime, { get(target, property) {
          if (property === 'createSession') return async (...args: Parameters<RuntimeClient['createSession']>) => {
            await assertAllowed?.();
            signal.throwIfAborted();
            if (identity(await store.readCore()) !== identity(before)
              || !samePath(await realpath(intent.cwd), intent.cwd)) throw new Error('stale_context');
            signal.throwIfAborted();
            const session = await target.createSession(...args);
            intent = { ...intent, sessionId: session.id };
            try {
              await store.updateCore(core => saveIntent(core, intent));
              signal.throwIfAborted();
            } catch (error) { await target.closeSession(session.id).catch(() => {}); throw error; }
            return session;
          };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
        await conversations.activate(intent.channelId, observedRuntime);
        if (signal.aborted) return outcome(request.requestId, 'unconfirmed', 'cancelled_inspect_conversation', intent);
        return verify(draft, intent, signal);
      });
    } catch { result = outcome(request.requestId, 'unconfirmed', 'interrupted_inspect_conversation', intent); }
    intent = { ...intent, status: 'settled', outcome: result };
    await store.updateCore(core => saveIntent(core, intent));
    return result;
  }

  return { inspect, async inspectAttempt(draft, request, signal) {
    const existing = readIntent(await store.readCore(), request.requestId);
    if (!existing) return outcome(request.requestId, 'unconfirmed', 'attempt_not_admitted');
    if (existing.digest !== knowledgeDigest(JSON.stringify({ draft, revision: request.revision }))) {
      return outcome(request.requestId, 'rejected', 'request_conflict');
    }
    return existing.status === 'settled' ? verify(draft, existing, signal)
      : outcome(request.requestId, 'unconfirmed', 'interrupted_inspect_conversation', existing);
  }, async open(draft, request, signal, assertAllowed) {
    if (!/^[a-f0-9-]{36}$/u.test(request.requestId) || !/^[a-f0-9]{64}$/u.test(request.revision)) {
      return outcome(request.requestId, 'rejected', 'invalid_request');
    }
    const digest = knowledgeDigest(JSON.stringify({ draft, revision: request.revision }));
    const pending = active.get(request.requestId);
    if (pending) return pending.digest === digest ? pending.result : outcome(request.requestId, 'rejected', 'request_conflict');
    const result = (async () => boundary.invoke({ toolName: CODE_SESSION_OPERATION.id, input: request, actionId: request.requestId,
      runId: request.requestId, actorRef: (await store.readCore()).ownerProfile.actorId,
      grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
      execute: async () => ({ status: 'applied', result: await execute(draft, request, signal, digest, assertAllowed) }),
    }))().then(value => value.status === 'applied' ? value.result
      : outcome(request.requestId, 'unconfirmed', 'operation_failed'));
    active.set(request.requestId, { digest, result });
    try { return await result; } finally { active.delete(request.requestId); }
  } };
}
