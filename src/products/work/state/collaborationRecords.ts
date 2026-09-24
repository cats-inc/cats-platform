import { createHash } from 'node:crypto';
import type { CatsCoreState, CoreTaskRecord, ExecutionTargetSummary } from '../../../core/types.js';
import { upsertCoreTask, writeApprovalDecision } from '../../../core/model/index.js';
import { GLOBAL_ORCHESTRATOR_ACTOR_ID } from '../../../core/actors.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import type { ProviderAgentToolFeedback } from '../../../platform/orchestration/providerAgentAdapter.js';
import { writeTaskPlanningMetadata } from '../../../shared/taskPlanning.js';
import { GOLDEN_PATH_LOCAL_FILE_TOOLS } from './workGoldenPathRuntimeExecutor.js';

export const COLLABORATION_METADATA_KEY = 'collaborationIntent';
export type CollaborationRole = 'implementation' | 'review';
export interface CollaborationWorker {
  catId: string; actorId: string; name: string; target: ExecutionTargetSummary;
  modelSelection?: ProviderModelSelection | null;
}
export interface CollaborationStage {
  taskId: string; runId: string;
  status: 'pending' | 'queued' | 'starting' | 'running' | 'result_ready' | 'reviewed' | 'blocked' | 'cancelled';
  sessionId: string | null; workspacePath: string | null;
  sessionClosed?: boolean;
  summary?: string; reason?: string;
}
export interface CollaborationRevisionEvidence {
  artifactId: string; runId: string; sessionId: string; workspacePath: string;
  baselineCommitId: string; commitId: string;
  validation: 'runtime_clean_new_head';
}
export interface WorkCollaborationIntent {
  schemaVersion: 1; id: string; inputDigest: string;
  sourceChannelId: string; sourceConversationId: string; proposalMessageId: string;
  originalMessageId: string; originalGoalDigest: string; ownerActorId: string;
  confirmationMessageId: string; proposalDigest: string;
  goal: string; expectedOutput: string; conversationIntent: 'create' | 'reuse_current';
  contextRevision: string; workspacePath: string;
  workers: Record<CollaborationRole, CollaborationWorker>;
  budget: { maxDurationMs: number; maxTokens: number };
  admittedAt: string; deadline: string; tokensUsed: number;
  channelId: string | null; conversationId: string | null; membershipVerified: boolean;
  status: 'admitted' | 'running' | 'completed' | 'blocked' | 'cancelled';
  stages: Record<CollaborationRole, CollaborationStage>;
  coordinatorSessionId: string | null;
  coordinatorClosed?: boolean;
  executionGrant: { source: 'owner_choice'; implementationWorkspace: 'worktree';
    implementationTools: string[]; reviewAccess: 'read_only'; delivery: 'local_commit_only' };
  receipts: ProviderAgentToolFeedback[];
  implementationEvidence?: CollaborationRevisionEvidence;
  review?: { verdict: 'approved' | 'changes_requested'; commitId: string; summary: string };
  reason?: string;
}
export type CollaborationAdmission = Omit<WorkCollaborationIntent,
  'schemaVersion' | 'id' | 'inputDigest' | 'admittedAt' | 'deadline' | 'tokensUsed'
  | 'channelId' | 'conversationId' | 'membershipVerified' | 'status' | 'stages'
  | 'coordinatorSessionId' | 'coordinatorClosed' | 'executionGrant' | 'receipts' | 'implementationEvidence' | 'review' | 'reason'>;

export const collaborationDigest = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
export function collaborationIntentId(sourceChannelId: string, proposalMessageId: string): string {
  return `task-collaboration-${collaborationDigest([sourceChannelId, proposalMessageId]).slice(0, 32)}`;
}
export function readCollaborationIntent(core: CatsCoreState, id: string): WorkCollaborationIntent | null {
  const task = core.tasks.find((entry) => entry.id === id);
  const value = task?.metadata[COLLABORATION_METADATA_KEY] as WorkCollaborationIntent | undefined;
  if (!value) return null;
  if (value.schemaVersion !== 1 || value.id !== id || !value.workers?.implementation
    || !value.workers?.review || !value.stages?.implementation || !value.stages?.review
    || !value.inputDigest || !Number.isFinite(Date.parse(value.deadline))
    || !Number.isFinite(value.tokensUsed) || value.tokensUsed < 0
    || !Number.isInteger(value.budget?.maxTokens) || value.budget.maxTokens <= 0
    || !Number.isInteger(value.budget.maxDurationMs) || value.budget.maxDurationMs <= 0) {
    throw new Error('invalid_collaboration_record');
  }
  return structuredClone(value);
}
export function writeCollaborationIntent(
  core: CatsCoreState, intent: WorkCollaborationIntent, now = new Date(),
): CatsCoreState {
  const task = core.tasks.find((entry) => entry.id === intent.id);
  if (!task) throw new Error('collaboration_intent_missing');
  return upsertCoreTask(core, {
    ...task, status: intent.status === 'completed' ? 'completed'
      : intent.status === 'cancelled' ? 'cancelled' : intent.status === 'blocked' ? 'blocked'
        : intent.status === 'running' ? 'in_progress' : 'approved',
    metadata: { ...task.metadata, [COLLABORATION_METADATA_KEY]: structuredClone(intent) },
  }, now).core;
}
/** Usage and receipts must not overwrite operator changes to the owning Task. */
export function writeCollaborationAudit(core: CatsCoreState, intent: WorkCollaborationIntent): CatsCoreState {
  const task = core.tasks.find((entry) => entry.id === intent.id);
  if (!task) throw new Error('collaboration_intent_missing');
  return upsertCoreTask(core, { ...task,
    metadata: { ...task.metadata, [COLLABORATION_METADATA_KEY]: structuredClone(intent) } }).core;
}
/** Pure Work-owned admission, composed inside the caller's atomic Chat/Core transaction. */
export function admitCollaboration(
  core: CatsCoreState, input: CollaborationAdmission, now = new Date(),
): { core: CatsCoreState; intent: WorkCollaborationIntent; created: boolean } {
  const id = collaborationIntentId(input.sourceChannelId, input.proposalMessageId);
  const inputDigest = collaborationDigest(input);
  const existing = readCollaborationIntent(core, id);
  if (existing) {
    if (existing.inputDigest !== inputDigest) throw new Error('collaboration_input_conflict');
    return { core, intent: existing, created: false };
  }
  if (core.tasks.some((task) => task.id === id)) throw new Error('collaboration_identity_conflict');
  if (input.workers.implementation.catId === input.workers.review.catId
    || input.workers.implementation.actorId === input.workers.review.actorId) throw new Error('distinct_reviewer_required');
  const stages = Object.fromEntries((['implementation', 'review'] as const).map((role) => [role, {
    taskId: `${id}-${role}`, runId: `run-${id}-${role}`, status: 'pending',
    sessionId: null, workspacePath: null,
  }])) as WorkCollaborationIntent['stages'];
  if (Object.values(stages).some((stage) => core.tasks.some((task) => task.id === stage.taskId)
    || core.runs.some((run) => run.id === stage.runId))) throw new Error('collaboration_identity_conflict');
  const intent: WorkCollaborationIntent = { ...structuredClone(input), schemaVersion: 1,
    id, inputDigest, admittedAt: now.toISOString(),
    deadline: new Date(now.getTime() + input.budget.maxDurationMs).toISOString(), tokensUsed: 0,
    channelId: null, conversationId: null, membershipVerified: false, status: 'admitted', stages,
    coordinatorSessionId: null, receipts: [], executionGrant: { source: 'owner_choice',
      implementationWorkspace: 'worktree', implementationTools: [...GOLDEN_PATH_LOCAL_FILE_TOOLS],
      reviewAccess: 'read_only', delivery: 'local_commit_only' } };
  let next = upsertCoreTask(core, {
    id, title: input.goal.slice(0, 160), status: 'pending_approval',
    ownerActorId: input.ownerActorId, orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    conversationId: input.sourceConversationId, assignedActorIds: [],
    summary: input.expectedOutput,
    metadata: { source: 'work-collaboration', [COLLABORATION_METADATA_KEY]: intent },
  }, now).core;
  next = approveTask(next, id, input.ownerActorId, input.proposalMessageId, now);
  // Both roles exist before any execution, so parent convergence cannot overlook the review.
  for (const role of ['implementation', 'review'] as const) {
    next = upsertCoreTask(next, {
      id: stages[role].taskId, parentTaskId: id, title: `${role}: ${input.goal.slice(0, 140)}`,
      status: 'pending_approval', ownerActorId: input.ownerActorId,
      orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID, assignedActorIds: [input.workers[role].actorId],
      conversationId: input.sourceConversationId, summary: input.expectedOutput,
      approval: { status: 'pending' },
      metadata: writeTaskPlanningMetadata({ source: 'work-collaboration', collaborationId: id, role },
        { dependsOnTaskIds: role === 'review' ? [stages.implementation.taskId] : [], productHint: 'work',
          acceptanceCriteria: input.expectedOutput }),
    }, now).core;
    if (role === 'implementation') next = approveTask(next, stages[role].taskId, input.ownerActorId, input.proposalMessageId, now);
  }
  return { core: next, intent, created: true };
}
function approveTask(core: CatsCoreState, taskId: string, ownerActorId: string, proposalMessageId: string, now: Date): CatsCoreState {
  return writeApprovalDecision(core, { taskId, status: 'approved',
    decidedByActorId: ownerActorId, requestedByActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    notes: `Owner accepted collaboration proposal ${proposalMessageId}.`,
  }, now).core;
}
export function updateCollaborationChild(
  core: CatsCoreState, intent: WorkCollaborationIntent, role: CollaborationRole,
  status: CoreTaskRecord['status'], now = new Date(),
): CatsCoreState {
  const task = core.tasks.find((entry) => entry.id === intent.stages[role].taskId);
  if (!task) throw new Error('collaboration_child_missing');
  return upsertCoreTask(core, { ...task, status, conversationId: intent.conversationId ?? task.conversationId }, now).core;
}
export function collaborationSummary(intent: WorkCollaborationIntent) {
  return { intentId: intent.id, status: intent.status, channelId: intent.channelId,
    conversationId: intent.conversationId, membershipVerified: intent.membershipVerified,
    participants: Object.values(intent.workers).map(({ catId, actorId, name }) => ({ catId, actorId, name })),
    stages: structuredClone(intent.stages), implementationEvidence: intent.implementationEvidence,
    review: intent.review, reason: intent.reason, tokensUsed: intent.tokensUsed,
    budget: intent.budget, deadline: intent.deadline };
}
export type CollaborationExecutionSummary = ReturnType<typeof collaborationSummary>;
