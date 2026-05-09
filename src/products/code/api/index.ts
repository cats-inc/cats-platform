import type { AppConfig } from '../../../config.js';
import type { CoreStore } from '../../../core/store.js';
import type { EvidenceEvent } from '../../../core/types.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import {
  buildCodeArtifactDetailProjection,
  buildCodeArtifactListProjection,
  buildCodeDashboardProjection,
  buildCodeTaskDetailProjection,
  buildCodeTaskListProjection,
  buildCodeWorkspaceDetailProjection,
  buildCodeWorkspaceListProjection,
  type CodeArtifactDetailProjection,
  type CodeArtifactListFilters,
  type CodeArtifactListLegacyFilter,
  type CodeArtifactListProjection,
  type CodeDashboardProjection,
  type CodeTaskDetailProjection,
  type CodeTaskListProjection,
  type CodeWorkspaceDetailProjection,
  type CodeWorkspaceListProjection,
} from './projection.js';
import { routeCodeWorkspaceApi } from './workspaceRoutes.js';
import { routeCodeTaskMutationApi } from './taskRoutes.js';
import { routeCodePlanApi } from './planRoutes.js';
import { routeCodeDeliveryApi } from './deliveryRoutes.js';
import { routeCodeRuntimeBridgeApi } from './runtimeBridgeRoutes.js';
import { routeCodeRelayApi } from './relayRoutes.js';
import { routeCodeArtifactDeclarationApi } from './artifactDeclarationRoutes.js';
import { routeCodeLivePreviewApi } from './livePreviewRoutes.js';
import {
  matchRoute,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import type { PlatformApiLogger } from '../../../shared/platformApiLogger.js';
import type { LivePreviewStopResult } from '../livePreview/contracts.js';
import type { LivePreviewLeaseStore } from '../livePreview/leaseStore.js';
import {
  CODE_API_ARTIFACT_DETAIL_PATTERN,
  CODE_API_ARTIFACTS_PATH,
  CODE_API_BUILDS_PATH,
  CODE_API_CODESPACE_DETAIL_PATTERN,
  CODE_API_CODESPACES_PATH,
  CODE_API_PREFIX,
  CODE_API_PREVIEWS_PATH,
  CODE_API_TASK_DETAIL_PATTERN,
  CODE_API_TASKS_PATH,
} from '../shared/apiPaths.js';

export const CODE_API_SLICE = 'code';

export interface CodeApiDependencies {
  coreStore: CoreStore;
  runtimeClient: RuntimeClient;
  config: AppConfig;
  logger?: PlatformApiLogger;
  evidenceDataDir?: string;
  readEvidenceEvents?: (conversationId: string) => EvidenceEvent[];
  livePreviewStore?: LivePreviewLeaseStore;
  stopLivePreview?: (previewId: string, reason?: string) => Promise<LivePreviewStopResult>;
  now?: () => Date;
}

export type CodeApiRouteContext = RouteContext<CodeApiDependencies>;

export function createCodeDashboardPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
): CodeDashboardProjection {
  return buildCodeDashboardProjection(core);
}

export function createCodeTaskListPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
): CodeTaskListProjection {
  return buildCodeTaskListProjection(core);
}

export function createCodeWorkspaceListPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
): CodeWorkspaceListProjection {
  return buildCodeWorkspaceListProjection(core);
}

export function createCodeWorkspaceDetailPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
  workspaceId: string,
): CodeWorkspaceDetailProjection | null {
  return buildCodeWorkspaceDetailProjection(core, workspaceId);
}

export function createCodeTaskDetailPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
  taskId: string,
  evidenceEvents: EvidenceEvent[] = [],
): CodeTaskDetailProjection | null {
  const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
  return task ? buildCodeTaskDetailProjection(core, task, evidenceEvents) : null;
}

export function createCodeArtifactListPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
  filtersOrLegacy: CodeArtifactListFilters | CodeArtifactListLegacyFilter = {},
): CodeArtifactListProjection {
  return buildCodeArtifactListProjection(core, filtersOrLegacy);
}

export function createCodeArtifactDetailPayload(
  core: Awaited<ReturnType<CoreStore['readCore']>>,
  artifactId: string,
): CodeArtifactDetailProjection | null {
  const artifact = core.artifacts.find((candidate) => candidate.id === artifactId) ?? null;
  return artifact ? buildCodeArtifactDetailProjection(core, artifact) : null;
}

const ALLOWED_ARTIFACT_KIND_FILTERS = new Set<string>([
  'all',
  'build',
  'preview',
  'document',
  'report',
  'attachment',
  'transcript_export',
  'dataset',
]);

const ALLOWED_ARTIFACT_STATUS_FILTERS = new Set<string>([
  'draft',
  'ready',
  'published',
  'archived',
]);

export interface InvalidArtifactListFilterError {
  field: 'kind' | 'status';
  value: string;
  allowed: readonly string[];
}

export function readArtifactListFiltersFromQuery(
  url: URL,
):
  | { ok: true; filters: CodeArtifactListFilters }
  | { ok: false; error: InvalidArtifactListFilterError } {
  const filters: CodeArtifactListFilters = {};
  const kind = url.searchParams.get('kind')?.trim();
  if (kind) {
    if (!ALLOWED_ARTIFACT_KIND_FILTERS.has(kind)) {
      return {
        ok: false,
        error: {
          field: 'kind',
          value: kind,
          allowed: [...ALLOWED_ARTIFACT_KIND_FILTERS],
        },
      };
    }
    filters.kind = kind as CodeArtifactListFilters['kind'];
  }
  const status = url.searchParams.get('status')?.trim();
  if (status) {
    if (!ALLOWED_ARTIFACT_STATUS_FILTERS.has(status)) {
      return {
        ok: false,
        error: {
          field: 'status',
          value: status,
          allowed: [...ALLOWED_ARTIFACT_STATUS_FILTERS],
        },
      };
    }
    filters.status = status as CodeArtifactListFilters['status'];
  }
  const producerLabel = url.searchParams.get('producerLabel')?.trim();
  if (producerLabel) {
    filters.producerLabel = producerLabel;
  }
  const workspacePath = url.searchParams.get('workspacePath')?.trim();
  if (workspacePath) {
    filters.workspacePath = workspacePath;
  }
  const taskId = url.searchParams.get('taskId')?.trim();
  if (taskId) {
    filters.taskId = taskId;
  }
  const runId = url.searchParams.get('runId')?.trim();
  if (runId) {
    filters.runId = runId;
  }
  const excludeUndeclaredSourceEdits = url.searchParams.get('excludeUndeclaredSourceEdits');
  if (excludeUndeclaredSourceEdits === 'true' || excludeUndeclaredSourceEdits === '1') {
    filters.excludeUndeclaredSourceEdits = true;
  }
  return { ok: true, filters };
}

export async function routeCodeApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  if (await routeCodeRuntimeBridgeApi(context)) {
    return true;
  }
  if (await routeCodeDeliveryApi(context)) {
    return true;
  }
  if (await routeCodePlanApi(context)) {
    return true;
  }
  if (await routeCodeTaskMutationApi(context)) {
    return true;
  }
  if (await routeCodeWorkspaceApi(context)) {
    return true;
  }
  if (await routeCodeRelayApi(context)) {
    return true;
  }
  if (await routeCodeArtifactDeclarationApi(context)) {
    return true;
  }
  if (await routeCodeLivePreviewApi(context)) {
    return true;
  }

  const codespaceDetailMatch = matchRoute(context.url.pathname, CODE_API_CODESPACE_DETAIL_PATTERN);
  if (codespaceDetailMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    const codespaceId = codespaceDetailMatch[0];
    if (!codespaceId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_codespace_id', message: 'Codespace id is required.' },
      });
      return true;
    }

    const payload = createCodeWorkspaceDetailPayload(
      await context.dependencies.coreStore.readCore(),
      codespaceId,
    );
    if (!payload) {
      sendJson(context.response, 404, {
        error: {
          code: 'codespace_not_found',
          message: `No codespace found for id ${codespaceId}.`,
        },
      });
      return true;
    }

    sendJson(context.response, 200, payload);
    return true;
  }

  if (context.url.pathname === CODE_API_CODESPACES_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(
      context.response,
      200,
      createCodeWorkspaceListPayload(await context.dependencies.coreStore.readCore()),
    );
    return true;
  }

  const artifactDetailMatch = matchRoute(context.url.pathname, CODE_API_ARTIFACT_DETAIL_PATTERN);
  if (artifactDetailMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    const artifactId = artifactDetailMatch[0];
    if (!artifactId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_artifact_id', message: 'Artifact id is required.' },
      });
      return true;
    }

    const payload = createCodeArtifactDetailPayload(
      await context.dependencies.coreStore.readCore(),
      artifactId,
    );
    if (!payload) {
      sendJson(context.response, 404, {
        error: { code: 'artifact_not_found', message: `No artifact found for id ${artifactId}.` },
      });
      return true;
    }

    sendJson(context.response, 200, payload);
    return true;
  }

  if (context.url.pathname === CODE_API_ARTIFACTS_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    const parsed = readArtifactListFiltersFromQuery(context.url);
    if (!parsed.ok) {
      sendJson(context.response, 400, {
        error: {
          code: 'invalid_artifact_list_filter',
          message: `Invalid value '${parsed.error.value}' for ${parsed.error.field}. `
            + `Allowed: ${parsed.error.allowed.join(', ')}.`,
          details: {
            field: parsed.error.field,
            value: parsed.error.value,
            allowed: parsed.error.allowed,
          },
        },
      });
      return true;
    }
    sendJson(
      context.response,
      200,
      createCodeArtifactListPayload(
        await context.dependencies.coreStore.readCore(),
        parsed.filters,
      ),
    );
    return true;
  }

  if (context.url.pathname === CODE_API_BUILDS_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(
      context.response,
      200,
      createCodeArtifactListPayload(await context.dependencies.coreStore.readCore(), 'build'),
    );
    return true;
  }

  if (context.url.pathname === CODE_API_PREVIEWS_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(
      context.response,
      200,
      createCodeArtifactListPayload(await context.dependencies.coreStore.readCore(), 'preview'),
    );
    return true;
  }

  const taskDetailMatch = matchRoute(context.url.pathname, CODE_API_TASK_DETAIL_PATTERN);
  if (taskDetailMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    const taskId = taskDetailMatch[0];
    if (!taskId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_task_id', message: 'Task id is required.' },
      });
      return true;
    }

    const core = await context.dependencies.coreStore.readCore();
    const task = core.tasks.find((candidate) => candidate.id === taskId) ?? null;
    const evidenceEvents = task?.conversationId
      ? context.dependencies.readEvidenceEvents?.(task.conversationId) ?? []
      : [];
    const payload = task
      ? buildCodeTaskDetailProjection(core, task, evidenceEvents)
      : null;
    if (!payload) {
      sendJson(context.response, 404, {
        error: { code: 'task_not_found', message: `No task found for id ${taskId}.` },
      });
      return true;
    }

    sendJson(context.response, 200, payload);
    return true;
  }

  if (context.url.pathname === CODE_API_TASKS_PATH) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(
      context.response,
      200,
      createCodeTaskListPayload(await context.dependencies.coreStore.readCore()),
    );
    return true;
  }

  if (context.url.pathname === CODE_API_PREFIX) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }

    sendJson(
      context.response,
      200,
      createCodeDashboardPayload(await context.dependencies.coreStore.readCore()),
    );
    return true;
  }

  return false;
}
