import { PLATFORM_CODE_API_BASE } from '../../../shared/platformSurfaceApi.js';

function normalizeCodeApiPathToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildCodeApiDetailPath(
  basePath: string,
  id: string | null | undefined,
): string {
  const normalizedId = normalizeCodeApiPathToken(id);
  if (!normalizedId) {
    return basePath;
  }

  return `${basePath}/${encodeURIComponent(normalizedId)}`;
}

export const CODE_API_PREFIX = PLATFORM_CODE_API_BASE;
export const CODE_API_TASKS_PATH = `${CODE_API_PREFIX}/tasks`;
export const CODE_API_CODESPACES_PATH = `${CODE_API_PREFIX}/codespaces`;
export const CODE_API_ARTIFACTS_PATH = `${CODE_API_PREFIX}/artifacts`;
export const CODE_API_ARTIFACT_DECLARATIONS_PATH = `${CODE_API_ARTIFACTS_PATH}/declarations`;
export const CODE_API_BUILDS_PATH = `${CODE_API_PREFIX}/builds`;
export const CODE_API_PREVIEWS_PATH = `${CODE_API_PREFIX}/previews`;
export const CODE_API_CODESPACE_RESOLVE_PATH = `${CODE_API_CODESPACES_PATH}/resolve`;
export const CODE_API_DELIVERY_REPO_STATUS_PATH = `${CODE_API_PREFIX}/delivery/repo/status`;
export const CODE_API_DELIVERY_REPO_COMMIT_PATH = `${CODE_API_PREFIX}/delivery/repo/commit`;
export const CODE_API_DELIVERY_REPO_PUSH_PATH = `${CODE_API_PREFIX}/delivery/repo/push`;
export const CODE_API_DELIVERY_ARTIFACT_EXPORT_PATH = `${CODE_API_PREFIX}/delivery/artifacts/export`;
export const CODE_API_RELAY_THREADS_PATH = `${CODE_API_PREFIX}/relay/threads`;
export const CODE_API_LIVE_PREVIEWS_PATH = `${CODE_API_PREFIX}/live-previews`;

export const CODE_API_TASK_DETAIL_PATH_TEMPLATE = `${CODE_API_TASKS_PATH}/:taskId`;
export const CODE_API_CODESPACE_DETAIL_PATH_TEMPLATE = `${CODE_API_CODESPACES_PATH}/:codespaceId`;
export const CODE_API_TASK_EXECUTE_PATH_TEMPLATE = `${CODE_API_TASKS_PATH}/:taskId/execute`;
export const CODE_API_TASK_RESUME_PATH_TEMPLATE = `${CODE_API_TASKS_PATH}/:taskId/resume`;
export const CODE_API_TASK_PLAN_PATH_TEMPLATE = `${CODE_API_TASKS_PATH}/:taskId/plan`;
export const CODE_API_TASK_PLAN_STEP_PATH_TEMPLATE =
  `${CODE_API_TASKS_PATH}/:taskId/plan/steps/:stepId`;
export const CODE_API_ARTIFACT_DETAIL_PATH_TEMPLATE = `${CODE_API_ARTIFACTS_PATH}/:artifactId`;
export const CODE_API_ARTIFACT_DECLARATIONS_PATH_TEMPLATE = CODE_API_ARTIFACT_DECLARATIONS_PATH;
export const CODE_API_RUNTIME_SESSION_OBSERVE_PATH_TEMPLATE =
  `${CODE_API_PREFIX}/runtime/sessions/:sessionId/observe`;
export const CODE_API_RELAY_ROSTER_ENTRY_PATH_TEMPLATE =
  `${CODE_API_RELAY_THREADS_PATH}/:threadId/roster/:agentId`;
export const CODE_API_RELAY_FAN_OUT_PATH_TEMPLATE =
  `${CODE_API_RELAY_THREADS_PATH}/:threadId/fan-out`;
export const CODE_API_LIVE_PREVIEW_DETAIL_PATH_TEMPLATE =
  `${CODE_API_LIVE_PREVIEWS_PATH}/:previewId`;
export const CODE_API_LIVE_PREVIEW_LOGS_PATH_TEMPLATE =
  `${CODE_API_LIVE_PREVIEWS_PATH}/:previewId/logs`;
export const CODE_API_LIVE_PREVIEW_STOP_PATH_TEMPLATE =
  `${CODE_API_LIVE_PREVIEWS_PATH}/:previewId/stop`;

export const CODE_API_TASK_DETAIL_PATTERN = /^\/api\/code\/tasks\/([^/]+)$/u;
export const CODE_API_CODESPACE_DETAIL_PATTERN = /^\/api\/code\/codespaces\/([^/]+)$/u;
export const CODE_API_TASK_EXECUTE_PATTERN = /^\/api\/code\/tasks\/([^/]+)\/execute$/u;
export const CODE_API_TASK_RESUME_PATTERN = /^\/api\/code\/tasks\/([^/]+)\/resume$/u;
export const CODE_API_TASK_PLAN_PATTERN = /^\/api\/code\/tasks\/([^/]+)\/plan$/u;
export const CODE_API_TASK_PLAN_STEP_PATTERN =
  /^\/api\/code\/tasks\/([^/]+)\/plan\/steps\/([^/]+)$/u;
export const CODE_API_ARTIFACT_DETAIL_PATTERN = /^\/api\/code\/artifacts\/([^/]+)$/u;
export const CODE_API_ARTIFACT_DECLARATIONS_PATTERN =
  /^\/api\/code\/artifacts\/declarations$/u;
export const CODE_API_RUNTIME_SESSION_OBSERVE_PATTERN =
  /^\/api\/code\/runtime\/sessions\/([^/]+)\/observe$/u;
export const CODE_API_RELAY_ROSTER_ENTRY_PATTERN =
  /^\/api\/code\/relay\/threads\/([^/]+)\/roster\/([^/]+)$/u;
export const CODE_API_RELAY_FAN_OUT_PATTERN = /^\/api\/code\/relay\/threads\/([^/]+)\/fan-out$/u;
export const CODE_API_LIVE_PREVIEW_DETAIL_PATTERN =
  /^\/api\/code\/live-previews\/([^/]+)$/u;
export const CODE_API_LIVE_PREVIEW_LOGS_PATTERN =
  /^\/api\/code\/live-previews\/([^/]+)\/logs$/u;
export const CODE_API_LIVE_PREVIEW_STOP_PATTERN =
  /^\/api\/code\/live-previews\/([^/]+)\/stop$/u;

export function buildCodeApiTaskPath(taskId?: string | null): string {
  return buildCodeApiDetailPath(CODE_API_TASKS_PATH, taskId);
}

export function buildCodeApiCodespacePath(codespaceId?: string | null): string {
  return buildCodeApiDetailPath(CODE_API_CODESPACES_PATH, codespaceId);
}

export function buildCodeApiTaskExecutePath(taskId: string): string {
  return `${buildCodeApiTaskPath(taskId)}/execute`;
}

export function buildCodeApiTaskResumePath(taskId: string): string {
  return `${buildCodeApiTaskPath(taskId)}/resume`;
}

export function buildCodeApiTaskPlanPath(taskId: string): string {
  return `${buildCodeApiTaskPath(taskId)}/plan`;
}

export function buildCodeApiTaskPlanStepPath(taskId: string, stepId: string): string {
  return `${buildCodeApiTaskPlanPath(taskId)}/steps/${encodeURIComponent(stepId)}`;
}

export function buildCodeApiArtifactPath(artifactId?: string | null): string {
  return buildCodeApiDetailPath(CODE_API_ARTIFACTS_PATH, artifactId);
}

export function buildCodeApiRuntimeSessionObservePath(sessionId: string): string {
  return `${CODE_API_PREFIX}/runtime/sessions/${encodeURIComponent(sessionId)}/observe`;
}

export function buildCodeApiRelayRosterEntryPath(threadId: string, agentId: string): string {
  return `${CODE_API_RELAY_THREADS_PATH}/${encodeURIComponent(threadId)}/roster/${encodeURIComponent(agentId)}`;
}

export function buildCodeApiRelayFanOutPath(threadId: string): string {
  return `${CODE_API_RELAY_THREADS_PATH}/${encodeURIComponent(threadId)}/fan-out`;
}

export function buildCodeApiLivePreviewPath(previewId?: string | null): string {
  return buildCodeApiDetailPath(CODE_API_LIVE_PREVIEWS_PATH, previewId);
}

export function buildCodeApiLivePreviewLogsPath(previewId: string): string {
  return `${buildCodeApiLivePreviewPath(previewId)}/logs`;
}

export function buildCodeApiLivePreviewStopPath(previewId: string): string {
  return `${buildCodeApiLivePreviewPath(previewId)}/stop`;
}
