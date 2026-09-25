import path from 'node:path';
import type { CatsCoreState } from '../../../core/types.js';
import type { CoreStore } from '../../../core/store.js';
import { upsertCoreRun, upsertCoreArtifact, upsertCoreOutcome, writeApprovalDecision } from '../../../core/model/index.js';
import { GLOBAL_ORCHESTRATOR_ACTOR_ID } from '../../../core/actors.js';
import { providerInstanceTarget } from '../../../shared/providerCatalog.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import { resolveFullResponseText } from '../../../platform/runtime/client.js';
import type { RuntimeDeliveryClient } from '../../../platform/runtime/deliveryClient.js';
import { createSupervisedRuntimeSession, sendSupervisedRuntimeMessage } from '../../../platform/supervision/runtimeBoundary.js';
import { stopRun } from '../../../platform/supervision/runCancellation.js';
import { GOLDEN_PATH_LOCAL_FILE_TOOLS } from './workGoldenPathRuntimeExecutor.js';
import { readCollaborationIntent, writeCollaborationIntent, writeCollaborationAudit, updateCollaborationChild,
  type WorkCollaborationIntent, type CollaborationRole } from './collaborationRecords.js';

export interface CollaborationExecutionPort {
  coreStore: CoreStore;
  runtimeClient: RuntimeClient;
  deliveryClient: RuntimeDeliveryClient;
  intentId: string;
  /** Revalidate the current owner, proposal, context and membership. */
  current(): Promise<WorkCollaborationIntent>;
  /** Revalidates Chat and Core under the same atomic mutation lock. */
  mutate(mutator: (core: CatsCoreState, intent: WorkCollaborationIntent) => CatsCoreState): Promise<void>;
  isCancelled?: () => boolean;
}

export function assertCollaborationBudget(intent: WorkCollaborationIntent): void {
  if (Date.now() >= Date.parse(intent.deadline) || intent.tokensUsed >= intent.budget.maxTokens) {
    throw new Error('budget_exhausted');
  }
}
function assertOpen(intent: WorkCollaborationIntent): void {
  if (!['admitted', 'running'].includes(intent.status)) throw new Error('collaboration_stopped');
  assertCollaborationBudget(intent);
  const grant = intent.executionGrant;
  if (grant?.source !== 'owner_choice' || grant.implementationWorkspace !== 'worktree'
    || grant.reviewAccess !== 'read_only' || grant.delivery !== 'local_commit_only'
    || JSON.stringify(grant.implementationTools) !== JSON.stringify(GOLDEN_PATH_LOCAL_FILE_TOOLS)) throw new Error('invalid_owner_grant');
}

/** Enforce a shared wall-clock limit and poll revocation while an external call is pending. */
export async function boundedCollaboration<T>(port: CollaborationExecutionPort, operation: () => Promise<T>, requireOpen = false): Promise<T> {
  const intent = await port.current();
  if (requireOpen) assertOpen(intent);
  assertCollaborationBudget(intent);
  if (port.isCancelled?.()) throw new Error('cancelled');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let checking = false;
  try {
    const value = await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('budget_exhausted')), Math.max(1, Date.parse(intent.deadline) - Date.now()));
      poll = setInterval(() => {
        if (port.isCancelled?.()) { reject(new Error('cancelled')); return; }
        if (checking) return;
        checking = true;
        void port.current().then((current) => { if (requireOpen) assertOpen(current); })
          .catch(reject).finally(() => { checking = false; });
      }, 100);
    })]);
    if (requireOpen) assertOpen(await port.current());
    if (port.isCancelled?.()) throw new Error('cancelled');
    assertCollaborationBudget(await port.current());
    return value;
  } finally { clearTimeout(timer); clearInterval(poll); }
}

export async function recordCollaborationUsage(port: CollaborationExecutionPort, tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) throw new Error('usage_unavailable');
  // Usage remains true even when the owner revokes the operation during a response.
  await port.coreStore.updateCore((core) => {
    const intent = readCollaborationIntent(core, port.intentId);
    return intent ? writeCollaborationAudit(core, { ...intent, tokensUsed: intent.tokensUsed + tokens }) : core;
  });
  assertCollaborationBudget(await port.current());
}

async function cleanupSession(runtime: RuntimeClient, sessionId: string, cancel: boolean): Promise<boolean> {
  return settleCleanup(async () => {
    if (cancel) await runtime.cancelSession(sessionId);
    await runtime.closeSession(sessionId);
  });
}
export async function settleCleanup(operation: () => Promise<unknown>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation().then(() => true, () => false), new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), 1500);
  })]); } finally { clearTimeout(timer); }
}

/** Stops owned Runs; it never deletes conversations, worktrees, evidence or user work. */
export async function stopCollaboration(
  coreStore: CoreStore, runtimeClient: RuntimeClient, intentId: string, reason: string,
  cancelCoordinator = false,
): Promise<WorkCollaborationIntent | null> {
  await coreStore.updateCore((core) => {
    const intent = readCollaborationIntent(core, intentId);
    if (!intent || !['admitted', 'running'].includes(intent.status)) return core;
    const task = core.tasks.find((entry) => entry.id === intentId)!;
    // Fence late completions before waiting for Runtime cancellation.
    return writeCollaborationIntent(core, { ...intent,
      status: reason === 'cancelled' || task.status === 'cancelled' ? 'cancelled' : 'blocked', reason });
  });
  const intent = readCollaborationIntent(await coreStore.readCore(), intentId);
  if (!intent) return intent;
  const stopReason = intent.reason ?? reason;
  for (const role of ['implementation', 'review'] as const) {
    const stage = intent.stages[role];
    if (stage.status === 'result_ready' || stage.status === 'reviewed') {
      if (stage.sessionId && !stage.sessionClosed) {
        const closed = await cleanupSession(runtimeClient, stage.sessionId, false);
        if (closed) await markSessionClosed(coreStore, intentId, role);
      }
      continue;
    }
    await settleCleanup(() => stopRun({ coreStore, runtimeClient }, stage.runId, {
      idempotencyKey: `${intentId}:${role}:stop`, requestedByActorId: intent.ownerActorId, reason: stopReason,
    }));
    const sessionClosed = stage.sessionClosed === true
      || (stage.sessionId ? await cleanupSession(runtimeClient, stage.sessionId, true) : false);
    await coreStore.updateCore((core) => {
      const latest = readCollaborationIntent(core, intentId);
      if (!latest) return core;
      const current = latest.stages[role];
      const closedCurrentSession = sessionClosed && current.sessionId === stage.sessionId;
      // A concurrent stop/result owns its terminal evidence; only advance confirmed cleanup.
      if (['result_ready', 'reviewed', 'cancelled', 'blocked'].includes(current.status)) {
        if (!closedCurrentSession || current.sessionClosed) return core;
        current.sessionClosed = true;
        return writeCollaborationAudit(core, latest);
      }
      const run = core.runs.find((entry) => entry.id === current.runId);
      // Missing session IDs on a starting stage are ambiguous, never proof of cancellation.
      latest.stages[role] = { ...current,
        status: current.status === 'starting' && !current.sessionId ? 'blocked'
          : run?.status === 'cancelled' || current.status === 'pending' ? 'cancelled' : 'blocked',
        sessionClosed: current.sessionClosed === true || closedCurrentSession,
        reason: latest.reason ?? stopReason };
      return writeCollaborationAudit(updateCollaborationChild(core, latest, role,
        latest.stages[role].status === 'cancelled' ? 'cancelled' : 'blocked'), latest);
    });
  }
  if (cancelCoordinator && intent.coordinatorSessionId && !intent.coordinatorClosed) {
    if (await cleanupSession(runtimeClient, intent.coordinatorSessionId, true)) await markSessionClosed(coreStore, intentId, 'coordinator');
  }
  return readCollaborationIntent(await coreStore.readCore(), intentId);
}

export async function markSessionClosed(coreStore: CoreStore, id: string, role: CollaborationRole | 'coordinator'): Promise<void> {
  await coreStore.updateCore((core) => {
    const intent = readCollaborationIntent(core, id);
    if (!intent) return core;
    if (role === 'coordinator') intent.coordinatorClosed = true;
    else intent.stages[role].sessionClosed = true;
    return writeCollaborationAudit(core, intent);
  });
}

const fullCommit = (value: string | null): value is string => Boolean(value && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value));
const samePath = (left: string, right: string): boolean => path.resolve(left) === path.resolve(right);

/** Accept the fixed workflow only. The host separately performs every admitted stage. */
export async function requestCollaborationExecution(port: CollaborationExecutionPort): Promise<WorkCollaborationIntent> {
  await port.mutate((core, intent) => {
    assertOpen(intent);
    if (intent.executionRequested) return core;
    intent.executionRequested = true;
    intent.status = 'running';
    return writeCollaborationIntent(core, intent);
  });
  return port.current();
}

/** Model-visible local-state tool: persist a queued Run only. No Runtime calls. */
export async function requestCollaborationRole(port: CollaborationExecutionPort, role: CollaborationRole): Promise<WorkCollaborationIntent> {
  await port.mutate((core, intent) => {
    assertOpen(intent);
    if (!intent.membershipVerified || !intent.conversationId) throw new Error('membership_required');
    if (intent.stages[role].status !== 'pending') return core;
    if (role === 'review' && (!intent.implementationEvidence
      || intent.stages.implementation.status !== 'result_ready')) throw new Error('verified_revision_required');
    if (role === 'review') {
      const evidence = intent.implementationEvidence!;
      const implementation = intent.stages.implementation;
      const artifact = core.artifacts.find((entry) => entry.id === evidence.artifactId);
      if (evidence.runId !== implementation.runId || evidence.sessionId !== implementation.sessionId
        || evidence.workspacePath !== implementation.workspacePath || !fullCommit(evidence.commitId)
        || !fullCommit(evidence.baselineCommitId) || evidence.commitId === evidence.baselineCommitId
        || artifact?.status !== 'ready' || artifact.runId !== implementation.runId
        || artifact.taskId !== implementation.taskId || artifact.metadata.commitId !== evidence.commitId
        || artifact.metadata.source !== 'work-collaboration'
        || !core.runs.some((run) => run.id === implementation.runId && run.status === 'completed')) {
        throw new Error('verified_revision_required');
      }
    }
    intent.status = 'running';
    intent.stages[role].status = 'queued';
    const stage = intent.stages[role];
    const next = upsertCoreRun(core, { id: stage.runId, taskId: stage.taskId,
      conversationId: intent.conversationId, title: `${role}: ${intent.goal.slice(0, 140)}`,
      status: 'queued', orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
      metadata: { source: 'work-collaboration', collaborationId: intent.id, role,
        approvalRef: intent.proposalMessageId, ownerActorId: intent.ownerActorId, proposalDigest: intent.proposalDigest },
    }).core;
    return writeCollaborationIntent(updateCollaborationChild(next, intent, role, 'in_progress'), intent);
  });
  return port.current();
}

/** Host-owned drain after queue receipt persistence; the owner grant is checked independently. */
export async function executeCollaborationRole(port: CollaborationExecutionPort, role: CollaborationRole): Promise<WorkCollaborationIntent> {
  const bounded = <T>(operation: () => Promise<T>) => boundedCollaboration(port, operation, true);
  let claimed = false;
  await port.mutate((core, intent) => {
    assertOpen(intent);
    const stage = intent.stages[role];
    if (stage.status !== 'queued') return core;
    const run = core.runs.find((entry) => entry.id === stage.runId);
    if (run?.status !== 'queued' || run.metadata.approvalRef !== intent.proposalMessageId
      || run.metadata.proposalDigest !== intent.proposalDigest || run.metadata.ownerActorId !== intent.ownerActorId
      || run.metadata.source !== 'work-collaboration' || run.metadata.collaborationId !== intent.id
      || run.metadata.role !== role || run.taskId !== stage.taskId
      || run.conversationId !== intent.conversationId) throw new Error('invalid_owner_grant');
    if (role === 'review' && !intent.implementationEvidence) throw new Error('verified_revision_required');
    claimed = true;
    stage.status = 'starting';
    return writeCollaborationIntent(core, intent);
  });
  if (!claimed) return port.current();
  let sessionId: string | null = null;
  let finished = false;
  let abandoned = false;
  try {
    const intent = await port.current();
    const worker = intent.workers[role];
    const stage = intent.stages[role];
    const revision = intent.implementationEvidence;
    const cwd = role === 'review' ? revision!.workspacePath : intent.workspacePath;
    const supervision = { product: 'cats-work', surface: 'collaboration', runId: stage.runId,
      actionId: `${stage.runId}:create`, actorRef: worker.actorId, reason: `collaboration_${role}`,
      budget: { ...intent.budget, hardStop: true }, policyToolScope: 'broad_write' as const };
    const configured = (await bounded(() => port.runtimeClient.getProviderConfig()))[worker.target.provider!];
    const requestedInstance = worker.target.instance?.trim();
    const selector = requestedInstance || configured?.defaultInstance;
    const matches = configured?.instances.filter((candidate) => selector
      && (candidate.id === selector || providerInstanceTarget(candidate) === selector)
      && (requestedInstance || candidate.backend === configured.defaultBackend)) ?? [];
    const target = matches.length === 1 ? matches[0] : null;
    if (!target?.backend) throw new Error('provider_unavailable');
    // CLI execution is unverified in passive health; live version/help probes send no model prompt.
    // Other backends retain their light path because live diagnostics can create remote sessions.
    const diagnostics = await bounded(() => port.runtimeClient.getProviderDiagnostics({
      ...(target.backend === 'cli' ? { probe: 'live' as const } : { probe: 'light' as const, scope: 'availability' as const }),
      provider: worker.target.provider, backend: target.backend, instance: target.id,
    }));
    const available = diagnostics.providers.find((entry) => entry.provider === worker.target.provider
      && entry.backend === target.backend && entry.instance === target.id);
    if (available?.availability.status !== 'ok') throw new Error('provider_unavailable');
    const created = await bounded(async () => {
      const result = await createSupervisedRuntimeSession({ runtimeClient: port.runtimeClient,
        input: { provider: worker.target.provider!, instance: `${target.backend}/${target.id}`,
          model: worker.target.model, modelSelection: worker.modelSelection ?? undefined, cwd,
          ...(role === 'implementation' ? { workspaceKind: 'worktree', workspaceAccess: 'read_write',
            permissionMode: 'whitelist',
            // Runtime's canonical spelling of the already admitted list_dir capability.
            // Keep the persisted owner grant unchanged for existing collaboration records.
            allowedTools: [...intent.executionGrant.implementationTools,
              ...(intent.executionGrant.implementationTools.includes('list_dir') ? ['list_files'] : [])] } as const
            : { workspaceKind: 'source', workspaceAccess: 'read_only', permissionMode: 'default',
              allowedTools: ['read_file', 'list_files'] } as const),
          sharingMode: 'isolated', skills: { requestedSkills: [], strict: true } }, supervision });
      sessionId = result.id;
      let canRun = false;
      // Persist the Runtime bridge before sending any goal, including invalid-cwd responses.
      // A late create response is still useful recovery evidence after the operation was fenced.
      await port.coreStore.updateCore((core) => {
        const latest = readCollaborationIntent(core, port.intentId)!;
        const run = core.runs.find((entry) => entry.id === stage.runId)!;
        canRun = !abandoned && ['admitted', 'running'].includes(latest.status)
          && latest.stages[role].status === 'starting' && run.status === 'queued';
        latest.stages[role] = { ...latest.stages[role], ...(canRun ? { status: 'running' as const } : {}),
          sessionId: result.id, workspacePath: result.cwd, sessionClosed: false };
        const next = upsertCoreRun(core, { ...run, ...(canRun ? { status: 'running' as const, startedAt: new Date().toISOString() } : {}),
          metadata: { ...run.metadata, supervision: { runtimeBridge: { sessionId: result.id } } } }).core;
        return writeCollaborationAudit(next, latest);
      });
      if (!canRun) {
        if (await cleanupSession(port.runtimeClient, result.id, true)) await markSessionClosed(port.coreStore, port.intentId, role);
        throw new Error('collaboration_stopped');
      }
      return result;
    });
    if (!created.cwd || (role === 'implementation' ? samePath(created.cwd, cwd) : !samePath(created.cwd, cwd))) {
      throw new Error('workspace_mismatch');
    }
    const before = await bounded(() => port.deliveryClient.inspectRepo({ sessionId: created.id }));
    if (!before.supported || !before.repository || !before.clean || !fullCommit(before.headOid)
      || (role === 'review' && before.headOid !== revision!.commitId)) throw new Error('revision_precheck_failed');
    const prompt = role === 'implementation'
      ? `Implement this owner-approved goal within this isolated repository.\n${intent.goal}\nExpected output: ${intent.expectedOutput}\nYour assigned role is implementation only. Cats handles conversation setup, participant recruitment, local revision capture, independent review and final reporting. Only inspect and edit local files. Use read_file/list_files when provided for inspection; batch independent reads when possible. A file-tool grant does not grant shell execution. Do not commit, publish, use network, delegate, or alter other workspaces. Report changes and any validation limitations; never claim unrun tests passed.`
      : `Independently review the actual repository revision ${revision!.commitId} against baseline ${revision!.baselineCommitId}.\nOwner goal: ${intent.goal}\nExpected output: ${intent.expectedOutput}\nYour assigned role is independent review only. Cats handles conversation setup, participant recruitment, revision capture and final reporting. Read only. Use read_file/list_files when provided for inspection, or provider-native read-only file tools; batch independent reads when possible. Do not change files, run project scripts or tests, publish, delegate, or execute commands with side effects. Return ONLY JSON: {"commitId":"${revision!.commitId}","verdict":"approved"|"changes_requested","summary":"specific findings and validation limitations"}. Your review is an attributed judgment, not proof that tests ran.`;
    const response = await bounded(() => sendSupervisedRuntimeMessage({
      runtimeClient: port.runtimeClient, sessionId: created.id, content: prompt,
      supervision: { ...supervision, actionId: `${stage.runId}:execute` },
    }));
    await recordCollaborationUsage(port, response.tokensUsed);
    const text = resolveFullResponseText(response.segments);
    let commitId: string;
    let review: WorkCollaborationIntent['review'];
    if (role === 'implementation') {
      const changed = await bounded(() => port.deliveryClient.inspectRepo({ sessionId: created.id }));
      if (!changed.repository || !changed.supported || changed.headOid !== before.headOid || changed.clean
        || changed.stagedCount + changed.modifiedCount + changed.untrackedCount <= 0) throw new Error('implementation_evidence_missing');
      const commit = await bounded(() => port.deliveryClient.createCommit({ sessionId: created.id,
        message: `Collaboration: ${intent.goal.replace(/[\r\n]+/gu, ' ').slice(0, 120)}` }));
      if (commit.state !== 'completed' || !fullCommit(commit.commitId) || commit.commitId === before.headOid) {
        throw new Error('implementation_evidence_missing');
      }
      commitId = commit.commitId;
    } else {
      commitId = revision!.commitId;
      let value: unknown;
      try { value = JSON.parse(text); } catch { throw new Error('review_verdict_invalid'); }
      const parsed = value as WorkCollaborationIntent['review'];
      if (!parsed || parsed.commitId !== commitId || !['approved', 'changes_requested'].includes(parsed.verdict)
        || typeof parsed.summary !== 'string' || !parsed.summary.trim() || parsed.summary.length > 2000) throw new Error('review_verdict_invalid');
      review = { commitId, verdict: parsed.verdict, summary: parsed.summary };
    }
    const after = await bounded(() => port.deliveryClient.inspectRepo({ sessionId: created.id }));
    if (!after.supported || !after.repository || !after.clean || after.headOid !== commitId
      || after.stagedCount + after.modifiedCount + after.untrackedCount !== 0) throw new Error('revision_postcheck_failed');
    await port.mutate((core, latest) => {
      assertOpen(latest);
      const run = core.runs.find((entry) => entry.id === stage.runId);
      if (run?.status !== 'running' || latest.stages[role].sessionId !== created.id) throw new Error('run_stopped');
      const summary = (review?.summary ?? text).slice(0, 2000);
      const artifactId = `artifact-${stage.runId}`;
      let next = upsertCoreArtifact(core, { id: artifactId, taskId: stage.taskId, runId: stage.runId,
        conversationId: latest.conversationId, title: `${role} revision ${commitId.slice(0, 12)}`,
        kind: 'report', status: 'ready', summary, path: created.cwd,
        metadata: { source: 'work-collaboration', role, sessionId: created.id, commitId,
          baselineCommitId: before.headOid,
          validation: role === 'implementation' ? 'runtime_clean_new_head' : 'runtime_unchanged_review_head', review } }).core;
      next = upsertCoreRun(next, { ...run, status: 'completed', completedAt: new Date().toISOString(), summary }).core;
      next = upsertCoreOutcome(next, { id: `outcome-${stage.runId}`, taskId: stage.taskId, runId: stage.runId,
        conversationId: latest.conversationId, title: `${role} result`, status: 'succeeded', summary,
        metadata: { source: 'work-collaboration', artifactId, commitId, actorId: worker.actorId, review } }).core;
      latest.stages[role] = { ...latest.stages[role], status: role === 'implementation' ? 'result_ready' : 'reviewed', summary };
      if (role === 'implementation') {
        latest.implementationEvidence = { artifactId, runId: stage.runId,
        sessionId: created.id, workspacePath: created.cwd!, baselineCommitId: before.headOid!, commitId,
        validation: 'runtime_clean_new_head' };
        next = writeApprovalDecision(next, { taskId: latest.stages.review.taskId, status: 'approved',
          decidedByActorId: latest.ownerActorId, requestedByActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
          notes: `Verified revision ${commitId}; review admitted by proposal ${latest.proposalMessageId}.` }).core;
      }
      else { latest.review = review; latest.status = review!.verdict === 'approved' ? 'completed' : 'blocked';
        if (latest.status === 'blocked') latest.reason = 'changes_requested'; }
      return writeCollaborationIntent(updateCollaborationChild(next, latest, role, 'completed'), latest);
    });
    finished = true;
  } catch (error) {
    abandoned = true;
    await stopCollaboration(port.coreStore, port.runtimeClient, port.intentId,
      error instanceof Error ? error.message : 'execution_failed');
  } finally {
    abandoned = true;
    if (sessionId && await cleanupSession(port.runtimeClient, sessionId, !finished)) {
      await markSessionClosed(port.coreStore, port.intentId, role);
    }
  }
  return readCollaborationIntent(await port.coreStore.readCore(), port.intentId)!;
}

/** Recovery never replays a create/send whose remote effect may already have happened. */
export async function recoverCollaborations(coreStore: CoreStore, runtimeClient: RuntimeClient): Promise<void> {
  const core = await coreStore.readCore();
  for (const task of core.tasks.filter((entry) => entry.metadata.source === 'work-collaboration'
    && entry.metadata.collaborationIntent)) {
    try {
      const intent = readCollaborationIntent(core, task.id);
      if (intent && (['admitted', 'running'].includes(intent.status)
        || (intent.coordinatorSessionId && !intent.coordinatorClosed)
        || Object.values(intent.stages).some((stage) => (stage.sessionId && !stage.sessionClosed)
          || ['pending', 'queued', 'starting', 'running'].includes(stage.status)))) {
        await stopCollaboration(coreStore, runtimeClient, task.id, intent.reason ?? 'interrupted_requires_new_proposal', true);
      }
    } catch { /* Unknown metadata versions remain intact and cannot execute. */ }
  }
}
