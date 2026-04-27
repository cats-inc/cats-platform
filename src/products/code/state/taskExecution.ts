import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState, CoreRunRecord, CoreTaskRecord } from '../../../core/types.js';
import type { RuntimeClient, RuntimeSessionInfo } from '../../../runtime/client.js';
import { upsertCoreRun } from '../../../core/model/executionRecords.js';
import { upsertCoreTask } from '../../../core/model/taskControls.js';
import {
  createSupervisedRuntimeSession,
  deriveRunState,
  writeRunStateMetadata,
} from '../../../platform/supervision/index.js';
import {
  writeTaskPlanningMetadata,
  type TaskPlanningMetadataInput,
} from '../../../shared/taskPlanning.js';
import {
  writeCodeWorkspaceSummary,
  type CodeWorkspaceKind,
} from '../shared/workspaceSummary.js';
import { buildCodeTaskRuntimeExecutionRequest } from './taskExecutionRequest.js';

export interface CreateCodeTaskInput {
  title: string;
  summary?: string | null;
  workspacePath?: string | null;
  workspaceKind?: CodeWorkspaceKind | null;
  parentTaskId?: string | null;
  conversationId?: string | null;
  assignedActorIds?: string[];
  acceptanceCriteria?: string | null;
}

export interface CreateCodeTaskResult {
  core: CatsCoreState;
  task: CoreTaskRecord;
}

export interface ResumeCodeTaskInput {
  taskId: string;
}

export interface ResumeCodeTaskResult {
  core: CatsCoreState;
  task: CoreTaskRecord;
}

export interface BridgeCodeTaskInput {
  taskId: string;
  workspacePath: string;
  workspaceKind?: CodeWorkspaceKind | null;
  provider: string;
  model?: string | null;
  instance?: string | null;
}

export interface BridgeCodeTaskResult {
  core: CatsCoreState;
  task: CoreTaskRecord;
  run: CoreRunRecord;
  runId: string;
  sessionId: string;
  session: RuntimeSessionInfo;
}

export function createCodeTask(
  core: CatsCoreState,
  input: CreateCodeTaskInput,
  now: Date = new Date(),
): CreateCodeTaskResult {
  const planningInput: TaskPlanningMetadataInput = {
    productHint: 'code',
    strategyHint: 'reflexion',
    acceptanceCriteria: input.acceptanceCriteria?.trim() || null,
  };

  let metadata = writeTaskPlanningMetadata(undefined, planningInput);
  metadata = writeCodeWorkspaceSummary(
    metadata,
    input.workspacePath?.trim()
      ? {
          workspacePath: input.workspacePath.trim(),
          workspaceKind: input.workspaceKind ?? 'user_selected',
        }
      : null,
  );

  const result = upsertCoreTask(core, {
    title: input.title,
    status: 'approved',
    summary: input.summary ?? null,
    parentTaskId: input.parentTaskId ?? null,
    conversationId: input.conversationId ?? null,
    assignedActorIds: input.assignedActorIds,
    metadata,
  }, now);

  return { core: result.core, task: result.task };
}

export function resumeCodeTask(
  core: CatsCoreState,
  input: ResumeCodeTaskInput,
  now: Date = new Date(),
): ResumeCodeTaskResult {
  const task = core.tasks.find((t) => t.id === input.taskId);
  if (!task) {
    throw new Error(`Task not found: ${input.taskId}`);
  }

  const resumableStatuses = ['draft', 'blocked', 'failed'];
  if (!resumableStatuses.includes(task.status)) {
    throw new Error(
      `Task ${input.taskId} is not resumable (status: ${task.status}). `
      + `Must be one of: ${resumableStatuses.join(', ')}`,
    );
  }

  const result = upsertCoreTask(core, {
    id: task.id,
    title: task.title,
    status: 'approved',
  }, now);

  return { core: result.core, task: result.task };
}

export async function bridgeCodeTaskToRuntime(
  coreStore: CoreStore,
  runtimeClient: RuntimeClient,
  input: BridgeCodeTaskInput,
  now: Date = new Date(),
): Promise<BridgeCodeTaskResult> {
  let core = await coreStore.readCore();
  const task = core.tasks.find((t) => t.id === input.taskId);
  if (!task) {
    throw new Error(`Task not found: ${input.taskId}`);
  }

  const executionRequest = buildCodeTaskRuntimeExecutionRequest({
    core,
    task,
  });
  const evaluatedAt = now.toISOString();
  const activeRunState = deriveRunState({ lifecycle: 'active' });
  const runDraft = upsertCoreRun(core, {
    title: `Code execution for ${task.title}`,
    status: 'running',
    conversationId: task.conversationId,
    taskId: task.id,
    orchestratorActorId: task.orchestratorActorId,
    startedAt: evaluatedAt,
    summary: 'Started supervised Code task execution.',
    metadata: writeRunStateMetadata({
      metadata: {
        supervision: {
          source: 'code_task_execute',
          runtimeBridge: {
            status: 'starting',
            requestedProvider: input.provider,
            requestedModel: input.model ?? null,
            requestedInstance: input.instance ?? null,
            cwd: input.workspacePath,
            startedAt: evaluatedAt,
          },
        },
      },
      evaluation: activeRunState,
      evaluatedAt,
    }),
  }, now);
  core = runDraft.core;

  const session = await createSupervisedRuntimeSession({
    runtimeClient,
    input: {
      provider: input.provider,
      model: input.model ?? undefined,
      instance: input.instance ?? undefined,
      cwd: input.workspacePath,
      workspaceKind: 'source',
      workspaceAccess: 'read_write',
      context: {
        source: 'assignment',
        reason: 'code_task_execute',
        taskId: task.id,
        workspace: {
          cwd: input.workspacePath,
        },
        metadata: {
          product: 'code',
          taskId: task.id,
          runId: runDraft.run.id,
          surface: 'task_execute',
        },
      },
      ...executionRequest,
    },
    supervision: {
      product: 'cats-code',
      surface: 'code-task-execute',
      runId: runDraft.run.id,
      actionId: `${runDraft.run.id}:runtime-session`,
      actorRef: task.orchestratorActorId ?? 'actor-orchestrator-global',
      reason: 'code_task_execute',
    },
  });
  const persistedRun = upsertCoreRun(core, {
    id: runDraft.run.id,
    title: runDraft.run.title,
    status: 'running',
    startedAt: runDraft.run.startedAt,
    summary: `Started supervised Code runtime session ${session.id}.`,
    metadata: writeRunStateMetadata({
      metadata: writeCodeExecutionRunMetadata(runDraft.run.metadata, {
        session,
        provider: input.provider,
        model: input.model ?? null,
        instance: input.instance ?? null,
        workspacePath: input.workspacePath,
        startedAt: evaluatedAt,
      }),
      evaluation: activeRunState,
      evaluatedAt,
    }),
  }, now);
  core = persistedRun.core;

  const workspaceMetadata = writeCodeWorkspaceSummary(
    task.metadata,
    {
      workspacePath: input.workspacePath,
      workspaceKind: input.workspaceKind ?? 'user_selected',
    },
  );
  const nextMetadata = writeCodeExecutionTaskMetadata(workspaceMetadata, {
    runId: persistedRun.run.id,
    sessionId: session.id,
    provider: session.provider,
    model: session.model,
    workspacePath: input.workspacePath,
    startedAt: evaluatedAt,
  });

  const runResult = upsertCoreTask(core, {
    id: task.id,
    title: task.title,
    status: 'in_progress',
    metadata: nextMetadata,
  }, now);
  core = runResult.core;

  await coreStore.writeCore(core);

  return {
    core,
    task: runResult.task,
    run: persistedRun.run,
    runId: persistedRun.run.id,
    sessionId: session.id,
    session,
  };
}

function writeCodeExecutionRunMetadata(
  metadata: Record<string, unknown>,
  input: {
    session: RuntimeSessionInfo;
    provider: string;
    model: string | null;
    instance: string | null;
    workspacePath: string;
    startedAt: string;
  },
): Record<string, unknown> {
  const supervision = asRecord(metadata.supervision) ?? {};

  return {
    ...metadata,
    supervision: {
      ...supervision,
      source: 'code_task_execute',
      runtimeBridge: {
        status: 'started',
        sessionId: input.session.id,
        provider: input.session.provider,
        model: input.session.model,
        requestedProvider: input.provider,
        requestedModel: input.model,
        requestedInstance: input.instance,
        cwd: input.session.cwd ?? input.workspacePath,
        startedAt: input.startedAt,
      },
    },
  };
}

function writeCodeExecutionTaskMetadata(
  metadata: Record<string, unknown>,
  input: {
    runId: string;
    sessionId: string;
    provider: string;
    model: string | null;
    workspacePath: string;
    startedAt: string;
  },
): Record<string, unknown> {
  const codeExecution = asRecord(metadata.codeExecution) ?? {};

  return {
    ...metadata,
    codeExecution: {
      ...codeExecution,
      latestRunId: input.runId,
      latestSessionId: input.sessionId,
      provider: input.provider,
      model: input.model,
      workspacePath: input.workspacePath,
      startedAt: input.startedAt,
      supervisionSource: 'code_task_execute',
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
