import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState, CoreTaskRecord } from '../../../core/types.js';
import type { RuntimeClient, RuntimeSessionInfo } from '../../../runtime/client.js';
import { upsertCoreTask } from '../../../core/model/taskControls.js';
import {
  writeTaskPlanningMetadata,
  type TaskPlanningMetadataInput,
} from '../../../shared/taskPlanning.js';
import {
  buildTaskRuntimeExecutionRequest,
} from '../../../shared/taskExecutionBridge.js';

export interface CreateCodeTaskInput {
  title: string;
  summary?: string | null;
  workspacePath?: string | null;
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
  provider: string;
  model?: string | null;
  instance?: string | null;
}

export interface BridgeCodeTaskResult {
  core: CatsCoreState;
  task: CoreTaskRecord;
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

  const metadata = writeTaskPlanningMetadata(undefined, planningInput);

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

  const executionRequest = buildTaskRuntimeExecutionRequest({
    core,
    task,
    product: 'code',
  });

  const session = await runtimeClient.createSession({
    provider: input.provider,
    model: input.model ?? undefined,
    instance: input.instance ?? undefined,
    cwd: input.workspacePath,
    workspaceKind: 'source',
    workspaceAccess: 'read_write',
    ...executionRequest,
  });

  const runResult = upsertCoreTask(core, {
    id: task.id,
    title: task.title,
    status: 'in_progress',
  }, now);
  core = runResult.core;

  await coreStore.writeCore(core);

  return {
    core,
    task: runResult.task,
    sessionId: session.id,
    session,
  };
}
