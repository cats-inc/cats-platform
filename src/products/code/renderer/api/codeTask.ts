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
  buildCodeApiLivePreviewLogsPath,
  buildCodeApiLivePreviewPath,
  buildCodeApiLivePreviewStopPath,
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
import { messageKeys, t as translate } from '../../../../shared/i18n/index.js';
import type { CanvasSurfaceKind } from '../../../shared/artifactCanvas/contracts.js';

export interface CreateCodeTaskInput {
  title: string;
  summary?: string | null;
  workspacePath?: string | null;
  workspaceKind?: CodeWorkspaceKind | null;
  parentTaskId?: string | null;
  acceptanceCriteria?: string | null;
  workItemId?: string | null;
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
  errorCode?: 'selected_path_invalid' | 'no_valid_workspace_path' | null;
  errorPath?: string | null;
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

export type CodeLivePreviewSurfaceKind = Extract<
  CanvasSurfaceKind,
  'code_codespace' | 'code_task'
>;

export type CodeLivePreviewStatus =
  | 'expired'
  | 'failed'
  | 'ready'
  | 'starting'
  | 'stopped'
  | 'stopping';

export interface CodeLivePreviewDiagnostic {
  code: string;
  severity: 'error' | 'info' | 'warning';
  message: string;
}

export interface CodeLivePreviewSummary {
  previewId: string;
  commandProfileId: string;
  surface: {
    kind: CanvasSurfaceKind;
    surfaceId: string;
  };
  workspace: {
    id: string;
    rootPath: string;
  };
  origin: string;
  status: CodeLivePreviewStatus;
  artifactId: string | null;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string;
  stoppedAt: string | null;
  stopReason: string | null;
  diagnostic: CodeLivePreviewDiagnostic | null;
}

export interface CodeLivePreviewDetail extends CodeLivePreviewSummary {
  host: string;
  port: number;
  processId: number | null;
  logPath: string;
  logs: string | null;
}

export interface CodeLivePreviewListResponse {
  previews: CodeLivePreviewSummary[];
}

export interface CodeLivePreviewLogsResponse {
  previewId: string;
  logs: string;
}

export interface CodeLivePreviewStopResponse {
  status: 'accepted';
  previewId: string;
  stopReason: string;
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

export type CodeArtifactDispositionSummary = 'candidate' | 'record';

export interface CodeArtifactListItemSummary extends CodeArtifactSummary {
  taskId: string | null;
  taskTitle: string | null;
  workItemId: string | null;
  workItemTitle: string | null;
  runId: string | null;
  conversationId: string | null;
  workspacePath: string | null;
  producerLabel: string | null;
  disposition: CodeArtifactDispositionSummary | null;
}

export interface CodeArtifactListFiltersSummary {
  kind?: string;
  status?: string;
  producerLabel?: string;
  workspacePath?: string;
  taskId?: string;
  runId?: string;
  excludeUndeclaredSourceEdits?: boolean;
}

export interface CodeArtifactListResponse {
  filter: 'all' | 'build' | 'preview';
  filters: CodeArtifactListFiltersSummary;
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
  errorMessage = translate(messageKeys.codeBuilderErrorCodespaceResolve),
): Promise<ResolveWorkspaceResponse> {
  return postJson<ResolveWorkspaceResponse>(
    CODE_API_CODESPACE_RESOLVE_PATH,
    input,
    'POST',
    errorMessage,
  );
}

export async function createCodeTask(
  input: CreateCodeTaskInput,
  errorMessage = translate(messageKeys.codeBuilderErrorTaskCreate),
): Promise<CreateCodeTaskResponse> {
  const response = await postJson<{ task: unknown }>(
    CODE_API_TASKS_PATH,
    input,
    'POST',
    errorMessage,
  );
  return {
    task: readCodeTaskBuilderDetail(response.task),
  };
}

export async function executeCodeTask(
  taskId: string,
  input: ExecuteCodeTaskInput,
  errorMessage = translate(messageKeys.codeBuilderErrorTaskExecution),
): Promise<ExecuteCodeTaskResponse> {
  const response = await postJson<{ task: unknown; runId: string; sessionId: string }>(
    buildCodeApiTaskExecutePath(taskId),
    input,
    'POST',
    errorMessage,
  );
  return {
    task: readCodeTaskBuilderDetail(response.task),
    runId: response.runId,
    sessionId: response.sessionId,
  };
}

export async function resumeCodeTask(
  taskId: string,
  errorMessage = translate(messageKeys.codeBuilderErrorTaskResume),
): Promise<ResumeCodeTaskResponse> {
  const response = await postJson<{ task: unknown }>(
    buildCodeApiTaskResumePath(taskId),
    {},
    'POST',
    errorMessage,
  );
  return {
    task: readCodeTaskBuilderDetail(response.task),
  };
}

export async function fetchCodePlan(
  taskId: string,
  errorMessage = translate(messageKeys.codePlanLoadError),
): Promise<CodePlanState | null> {
  const response = await fetchJson<{ plan?: CodePlanState | null }>(
    buildCodeApiTaskPlanPath(taskId),
    errorMessage,
  );
  return response.plan ?? null;
}

export async function updateCodePlan(
  taskId: string,
  steps: PlanStepInput[],
  replan = false,
  errorMessage = translate(messageKeys.codePlanUpdateError),
): Promise<unknown> {
  return postJson(buildCodeApiTaskPlanPath(taskId), {
    steps,
    replan,
  }, 'PUT', errorMessage);
}

export async function updateCodePlanStep(
  taskId: string,
  stepId: string,
  status: PlanStepInput['status'],
  errorMessage = translate(messageKeys.codePlanStepUpdateError),
): Promise<unknown> {
  return postJson(
    buildCodeApiTaskPlanStepPath(taskId, stepId),
    { status },
    'PATCH',
    errorMessage,
  );
}

export async function inspectRepoStatus(
  input: DeliveryRepoInput,
  errorMessage = translate(messageKeys.codeDeliveryErrorRepoStatusUnavailable),
): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(
    CODE_API_DELIVERY_REPO_STATUS_PATH,
    input,
    'POST',
    errorMessage,
  );
}

export async function previewCommit(
  input: DeliveryRepoInput,
  errorMessage = translate(messageKeys.codeDeliveryCommitFailed),
): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_REPO_COMMIT_PATH, {
    ...input,
    apply: false,
  }, 'POST', errorMessage);
}

export async function applyCommit(
  input: DeliveryRepoInput,
  errorMessage = translate(messageKeys.codeDeliveryCommitFailed),
): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_REPO_COMMIT_PATH, {
    ...input,
    apply: true,
  }, 'POST', errorMessage);
}

export async function previewPush(
  input: DeliveryRepoInput,
  errorMessage = translate(messageKeys.codeDeliveryPushFailed),
): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_REPO_PUSH_PATH, {
    ...input,
    apply: false,
  }, 'POST', errorMessage);
}

export async function applyPush(
  input: DeliveryRepoInput,
  errorMessage = translate(messageKeys.codeDeliveryPushFailed),
): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(CODE_API_DELIVERY_REPO_PUSH_PATH, {
    ...input,
    apply: true,
  }, 'POST', errorMessage);
}

export async function exportArtifacts(
  input: {
    workspacePath?: string | null;
    sessionId?: string | null;
    artifactIds?: string[];
  },
  errorMessage = translate(messageKeys.codeDeliveryExportFailed),
): Promise<CodeDeliveryResult> {
  return postJson<CodeDeliveryResult>(
    CODE_API_DELIVERY_ARTIFACT_EXPORT_PATH,
    input,
    'POST',
    errorMessage,
  );
}

export async function fetchCodeTaskDetail(
  taskId: string,
  errorMessage = translate(messageKeys.codeBuilderErrorTaskDetailLoad),
): Promise<CodeTaskBuilderDetailSummary> {
  return readCodeTaskBuilderDetail(
    await fetchJson(buildCodeApiTaskPath(taskId), errorMessage),
  );
}

export async function fetchCodeArtifactDetail(
  artifactId: string,
  errorMessage = translate(messageKeys.codeArtifactDetailLoadFailed),
): Promise<CodeArtifactDetailResponse> {
  return fetchJson<CodeArtifactDetailResponse>(
    buildCodeApiArtifactPath(artifactId),
    errorMessage,
  );
}

export async function fetchCodeArtifacts(
  errorMessage = translate(messageKeys.codeArtifactListLoadFailed),
  filters: CodeArtifactListFiltersSummary = {},
): Promise<CodeArtifactListResponse> {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.status) params.set('status', filters.status);
  if (filters.producerLabel) params.set('producerLabel', filters.producerLabel);
  if (filters.workspacePath) params.set('workspacePath', filters.workspacePath);
  if (filters.taskId) params.set('taskId', filters.taskId);
  if (filters.runId) params.set('runId', filters.runId);
  if (filters.excludeUndeclaredSourceEdits) {
    params.set('excludeUndeclaredSourceEdits', 'true');
  }
  const query = params.toString();
  const url = query ? `${CODE_API_ARTIFACTS_PATH}?${query}` : CODE_API_ARTIFACTS_PATH;
  return fetchJson<CodeArtifactListResponse>(url, errorMessage);
}

export async function fetchCodeWorkspaces(
  errorMessage = translate(messageKeys.codeWorkspacesLoadError),
): Promise<CodeWorkspaceListResponse> {
  return fetchJson<CodeWorkspaceListResponse>(CODE_API_CODESPACES_PATH, errorMessage);
}

export async function fetchCodeWorkspaceDetail(
  workspaceId: string,
  errorMessage = translate(messageKeys.codeWorkspaceDetailError),
): Promise<CodeWorkspaceDetailResponse> {
  return fetchJson<CodeWorkspaceDetailResponse>(
    buildCodeApiCodespacePath(workspaceId),
    errorMessage,
  );
}

export async function fetchCodeLivePreviews(
  surfaceKind: CodeLivePreviewSurfaceKind,
  surfaceId: string,
  errorMessage = translate(messageKeys.codeLivePreviewErrorLoad),
): Promise<CodeLivePreviewListResponse> {
  const searchParams = new URLSearchParams({ surfaceKind, surfaceId });
  const response = await fetchJsonOrNullOnStatus<CodeLivePreviewListResponse>(
    `${buildCodeApiLivePreviewPath()}?${searchParams.toString()}`,
    [503],
    errorMessage,
  );
  return response ?? { previews: [] };
}

export async function fetchCodeLivePreviewLogs(
  previewId: string,
  errorMessage = translate(messageKeys.codeLivePreviewErrorLogs),
): Promise<CodeLivePreviewLogsResponse> {
  return fetchJson<CodeLivePreviewLogsResponse>(
    buildCodeApiLivePreviewLogsPath(previewId),
    errorMessage,
  );
}

export async function stopCodeLivePreview(
  previewId: string,
  errorMessage = translate(messageKeys.codeLivePreviewErrorStop),
): Promise<CodeLivePreviewStopResponse> {
  return postJson<CodeLivePreviewStopResponse>(
    buildCodeApiLivePreviewStopPath(previewId),
    {},
    'POST',
    errorMessage,
  );
}

export async function observeRuntimeSession(
  sessionId: string,
  errorMessage = translate(messageKeys.codeBuilderRuntimeObservationFailed),
): Promise<RuntimeObservationResponse> {
  return fetchJson<RuntimeObservationResponse>(
    buildCodeApiRuntimeSessionObservePath(sessionId),
    errorMessage,
  );
}

async function fetchJson<T>(url: string, errorMessage: string): Promise<T> {
  try {
    const response = await fetch(url);
    return await expectCodeJson<T>(response, errorMessage);
  } catch (error) {
    if (error instanceof Error && error.message === errorMessage) {
      throw error;
    }
    throw new Error(errorMessage);
  }
}

async function fetchJsonOrNullOnStatus<T>(
  url: string,
  emptyStatuses: readonly number[],
  errorMessage: string,
): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (emptyStatuses.includes(response.status)) {
      return null;
    }
    return await expectCodeJson<T>(response, errorMessage);
  } catch (error) {
    if (error instanceof Error && error.message === errorMessage) {
      throw error;
    }
    throw new Error(errorMessage);
  }
}

async function postJson<T>(
  url: string,
  body: unknown,
  method = 'POST',
  errorMessage = translate(messageKeys.codeBuilderErrorCodespaceResolve),
): Promise<T> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await expectCodeJson<T>(response, errorMessage);
  } catch (error) {
    if (error instanceof Error && error.message === errorMessage) {
      throw error;
    }
    throw new Error(errorMessage);
  }
}

async function expectCodeJson<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return response.json() as Promise<T>;
}
