export interface CreateCodeTaskInput {
  title: string;
  summary?: string | null;
  workspacePath?: string | null;
  parentTaskId?: string | null;
  acceptanceCriteria?: string | null;
}

export interface ExecuteCodeTaskInput {
  workspacePath: string;
  provider: string;
  model?: string | null;
  instance?: string | null;
}

export interface ResolveWorkspaceInput {
  path?: string | null;
  conversationRepoPath?: string | null;
  roomWorkspacePath?: string | null;
}

export interface PlanStepInput {
  id: string;
  ordinal: number;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  detail?: string | null;
}

export interface DeliveryRepoInput {
  workspacePath: string;
  sessionId?: string | null;
  message?: string | null;
  stageAll?: boolean;
  apply?: boolean;
  remote?: string | null;
  branch?: string | null;
}

export async function resolveWorkspace(input: ResolveWorkspaceInput): Promise<unknown> {
  return postJson('/api/code/workspace/resolve', input);
}

export async function createCodeTask(input: CreateCodeTaskInput): Promise<unknown> {
  return postJson('/api/code/tasks', input);
}

export async function executeCodeTask(
  taskId: string,
  input: ExecuteCodeTaskInput,
): Promise<unknown> {
  return postJson(`/api/code/tasks/${encodeURIComponent(taskId)}/execute`, input);
}

export async function resumeCodeTask(taskId: string): Promise<unknown> {
  return postJson(`/api/code/tasks/${encodeURIComponent(taskId)}/resume`, {});
}

export async function fetchCodePlan(taskId: string): Promise<unknown> {
  return fetchJson(`/api/code/tasks/${encodeURIComponent(taskId)}/plan`);
}

export async function updateCodePlan(
  taskId: string,
  steps: PlanStepInput[],
  replan = false,
): Promise<unknown> {
  return postJson(`/api/code/tasks/${encodeURIComponent(taskId)}/plan`, {
    steps,
    replan,
  }, 'PUT');
}

export async function updateCodePlanStep(
  taskId: string,
  stepId: string,
  status: PlanStepInput['status'],
): Promise<unknown> {
  return postJson(
    `/api/code/tasks/${encodeURIComponent(taskId)}/plan/steps/${encodeURIComponent(stepId)}`,
    { status },
    'PATCH',
  );
}

export async function inspectRepoStatus(input: DeliveryRepoInput): Promise<unknown> {
  return postJson('/api/code/delivery/repo/status', input);
}

export async function previewCommit(input: DeliveryRepoInput): Promise<unknown> {
  return postJson('/api/code/delivery/repo/commit', { ...input, apply: false });
}

export async function applyCommit(input: DeliveryRepoInput): Promise<unknown> {
  return postJson('/api/code/delivery/repo/commit', { ...input, apply: true });
}

export async function previewPush(input: DeliveryRepoInput): Promise<unknown> {
  return postJson('/api/code/delivery/repo/push', { ...input, apply: false });
}

export async function applyPush(input: DeliveryRepoInput): Promise<unknown> {
  return postJson('/api/code/delivery/repo/push', { ...input, apply: true });
}

export async function exportArtifacts(input: {
  workspacePath?: string | null;
  sessionId?: string | null;
  artifactIds?: string[];
}): Promise<unknown> {
  return postJson('/api/code/delivery/artifacts/export', input);
}

export async function fetchCodeTaskDetail(taskId: string): Promise<unknown> {
  return fetchJson(`/api/code/tasks/${encodeURIComponent(taskId)}`);
}

export async function observeRuntimeSession(sessionId: string): Promise<unknown> {
  return fetchJson(
    `/api/code/runtime/sessions/${encodeURIComponent(sessionId)}/observe`,
  );
}

function fetchJson(url: string): Promise<unknown> {
  return fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`GET ${url} failed: ${response.status}`);
    }
    return response.json();
  });
}

function postJson(url: string, body: unknown, method = 'POST'): Promise<unknown> {
  return fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`${method} ${url} failed: ${response.status}`);
    }
    return response.json();
  });
}
