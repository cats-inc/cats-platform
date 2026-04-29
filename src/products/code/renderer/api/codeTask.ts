import type { CodePlanState } from '../../state/planSteps.js';
import {
  readCodeTaskBuilderDetail,
  type CodeTaskBuilderDetailSummary,
} from '../../shared/taskDetailSummary.js';
import type {
  CodeWorkspaceKind,
  CodeWorkspaceSummary,
} from '../../shared/workspaceSummary.js';
import {
  buildCodeApiArtifactPath,
  buildCodeApiCodespacePath,
  buildCodeApiRuntimeSessionObservePath,
  buildCodeApiTaskExecutePath,
  buildCodeApiTaskPath,
  buildCodeApiTaskPlanPath,
  buildCodeApiTaskPlanStepPath,
  buildCodeApiTaskResumePath,
  CODE_API_CODESPACE_RESOLVE_PATH,
  CODE_API_CODESPACES_PATH,
  CODE_API_DELIVERY_ARTIFACT_EXPORT_PATH,
  CODE_API_DELIVERY_REPO_COMMIT_PATH,
  CODE_API_DELIVERY_REPO_PUSH_PATH,
  CODE_API_DELIVERY_REPO_STATUS_PATH,
  CODE_API_ARTIFACTS_PATH,
  CODE_API_TASKS_PATH,
} from '../../shared/apiPaths.js';

export interface CreateCodeTaskInput {
  title: string;
  summary?: string | null;
  workspacePath?: string | null;
  workspaceKind?: CodeWorkspaceKind | null;
  parentTaskId?: string | null;
  acceptanceCriteria?: string | null;
}

export interface ExecuteCodeTaskInput {
  workspacePath: string;
  workspaceKind?: CodeWorkspaceKind | null;
  provider: string;
  model?: string | null;
  instance?: string | null;
}

export interface ResolveWorkspaceInput {
  path?: string | null;
  conversationRepoPath?: string | null;
  roomWorkspacePath?: string | null;
}

export interface ResolveWorkspaceResponse {
  workspace?: CodeWorkspaceSummary | null;
  error?: string | null;
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

export interface CodeDeliveryRepoSummary {
  branch?: string;
  clean?: boolean;
  staged?: number;
  unstaged?: number;
  untracked?: number;
  ahead?: number;
  behind?: number;
  remote?: string;
  [key: string]: unknown;
}

export interface CodeDeliveryContract {
  mode?: string;
  applyRequested?: boolean;
  applyDecision?: string;
}

export interface CodeDeliveryMessage {
  code?: string;
  message?: string;
}

export interface CodeDeliveryCapability {
  state?: string;
}

export interface CodeDeliveryResult {
  action?: string;
  state?: string;
  contract?: CodeDeliveryContract;
  warnings?: CodeDeliveryMessage[];
  blockedReasons?: CodeDeliveryMessage[];
  capabilities?: Record<string, CodeDeliveryCapability>;
  repo?: CodeDeliveryRepoSummary;
  [key: string]: unknown;
}

export interface CreateCodeTaskResponse {
  task: CodeTaskBuilderDetailSummary;
}

export interface ExecuteCodeTaskResponse {
  task: CodeTaskBuilderDetailSummary;
  runId: string;
  sessionId: string;
}

export interface ResumeCodeTaskResponse {
  task: CodeTaskBuilderDetailSummary;
}

export interface RuntimeObservationSession {
  status?: string;
  [key: string]: unknown;
}

export interface RuntimeObservationResponse extends Record<string, unknown> {
  session?: RuntimeObservationSession;
}

export interface CodeArtifactSummary {
  id: string;
  title: string;
  kind: string;
  status: string;
  summary: string | null;
  path: string | null;
  updatedAt: string;
}

export interface CodeArtifactListItemSummary extends CodeArtifactSummary {
  taskId: string | null;
  taskTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  runId: string | null;
}

export interface CodeArtifactListResponse {
  filter: 'all' | 'build' | 'preview';
  artifacts: CodeArtifactListItemSummary[];
  summary: {
    totalAvailable: number;
    returned: number;
    buildCount: number;
    previewCount: number;
    readyCount: number;
    publishedCount: number;
  };
}

export interface CodeArtifactLinkSummary {
  id: string;
  title: string;
  status: string;
}

export interface CodeArtifactWorkItemSummary extends CodeArtifactLinkSummary {
  projectTitle: string | null;
}

export interface CodeArtifactConversationSummary {
  id: string;
  title: string;
  kind: string;
}

export interface CodeArtifactRelatedSummary extends CodeArtifactSummary {}

export interface CodeArtifactDetailFocus {
  kind: string;
  isReady: boolean;
  isPublished: boolean;
}

export interface CodeArtifactDetailResponse {
  artifact: CodeArtifactSummary;
  task: CodeArtifactLinkSummary | null;
  workItem: CodeArtifactWorkItemSummary | null;
  project: CodeArtifactLinkSummary | null;
  conversation: CodeArtifactConversationSummary | null;
  relatedArtifacts: CodeArtifactRelatedSummary[];
  focus: CodeArtifactDetailFocus;
}

export type CodeWorkspaceStatus = 'active' | 'ready' | 'draft' | 'archived';
export type CodeWorkspaceSource =
  | 'task_workspace'
  | 'conversation_repo'
  | 'runtime_cwd'
  | 'artifact_anchor';

export interface CodeWorkspaceListItemSummary {
  id: string;
  title: string;
  summary: string | null;
  path: string;
  status: CodeWorkspaceStatus;
  source: CodeWorkspaceSource;
  conversationCount: number;
  taskCount: number;
  artifactCount: number;
  lastActiveAt: string;
}

export interface CodeWorkspaceConversationSummary {
  id: string;
  title: string;
  kind: string;
  status: string;
  repoPath: string | null;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface CodeWorkspaceListResponse {
  workspaces: CodeWorkspaceListItemSummary[];
  summary: {
    totalAvailable: number;
    returned: number;
    activeCount: number;
    taskBackedCount: number;
    artifactBackedCount: number;
  };
}

export interface CodeWorkspaceDetailResponse {
  workspace: CodeWorkspaceListItemSummary;
  conversations: CodeWorkspaceConversationSummary[];
  tasks: CodeArtifactLinkSummary[];
  artifacts: CodeArtifactListItemSummary[];
}

export async function resolveWorkspace(
  input: ResolveWorkspaceInput,
): Promise<ResolveWorkspaceResponse> {
  return postJson<ResolveWorkspaceResponse>(CODE_API_CODESPACE_RESOLVE_PATH, input);
}

export async function createCodeTask(input: CreateCodeTaskInput): Promise<CreateCodeTaskResponse> {
  const response = await postJson<{ task: unknown }>(CODE_API_TASKS_PATH, input);
  return {
    task: readCodeTaskBuilderDetail(response.task),
  };
}

export async function executeCodeTask(
  taskId: string,
  input: ExecuteCodeTaskInput,
): Promise<ExecuteCodeTaskResponse> {
  const response = await postJson<{ task: unknown; runId: string; sessionId: string }>(
    buildCodeApiTaskExecutePath(taskId),
    input,
  );
  return {
    task: readCodeTaskBuilderDetail(response.task),
    runId: response.runId,
    sessionId: response.sessionId,
  };
}

export async function resumeCodeTask(taskId: string): Promise<ResumeCodeTaskResponse> {
  const response = await postJson<{ task: unknown }>(
    buildCodeApiTaskResumePath(taskId),
    {},
  );
  return {
    task: readCodeTaskBuilderDetail(response.task),
  };
}

export async function fetchCodePlan(taskId: string): Promise<CodePlanState | null> {
  const response = await fetchJson<{ plan?: CodePlanState | null }>(
    buildCodeApiTaskPlanPath(taskId),
  );
  return response.plan ?? null;
}

export async function updateCodePlan(
  taskId: string,
  steps: PlanStepInput[],
  replan = false,
): Promise<unknown> {
  return postJson(buildCodeApiTaskPlanPath(taskId), {
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
    buildCodeApiTaskPlanStepPath(taskId, stepId),
    { status },
    'PATCH',
  );
}

export async function inspectRepoStatus(input: DeliveryRepoInput): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_REPO_STATUS_PATH, input);
}

export async function previewCommit(input: DeliveryRepoInput): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_REPO_COMMIT_PATH, {
    ...input,
    apply: false,
  });
}

export async function applyCommit(input: DeliveryRepoInput): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_REPO_COMMIT_PATH, {
    ...input,
    apply: true,
  });
}

export async function previewPush(input: DeliveryRepoInput): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_REPO_PUSH_PATH, {
    ...input,
    apply: false,
  });
}

export async function applyPush(input: DeliveryRepoInput): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_REPO_PUSH_PATH, {
    ...input,
    apply: true,
  });
}

export async function exportArtifacts(input: {
  workspacePath?: string | null;
  sessionId?: string | null;
  artifactIds?: string[];
}): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_ARTIFACT_EXPORT_PATH, input);
}

export async function fetchCodeTaskDetail(
  taskId: string,
): Promise<CodeTaskBuilderDetailSummary> {
  return readCodeTaskBuilderDetail(
    await fetchJson(buildCodeApiTaskPath(taskId)),
  );
}

export async function fetchCodeArtifactDetail(
  artifactId: string,
): Promise<CodeArtifactDetailResponse> {
  return fetchJson<CodeArtifactDetailResponse>(
    buildCodeApiArtifactPath(artifactId),
  );
}

export async function fetchCodeArtifacts(): Promise<CodeArtifactListResponse> {
  return fetchJson<CodeArtifactListResponse>(CODE_API_ARTIFACTS_PATH);
}

export async function fetchCodeWorkspaces(): Promise<CodeWorkspaceListResponse> {
  return fetchJson<CodeWorkspaceListResponse>(CODE_API_CODESPACES_PATH);
}

export async function fetchCodeWorkspaceDetail(
  workspaceId: string,
): Promise<CodeWorkspaceDetailResponse> {
  return fetchJson<CodeWorkspaceDetailResponse>(
    buildCodeApiCodespacePath(workspaceId),
  );
}

export async function observeRuntimeSession(
  sessionId: string,
): Promise<RuntimeObservationResponse> {
  return fetchJson<RuntimeObservationResponse>(
    buildCodeApiRuntimeSessionObservePath(sessionId),
  );
}

function fetchJson<T>(url: string): Promise<T> {
  return fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`GET ${url} failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  });
}

function postJson<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  return fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`${method} ${url} failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  });
}
