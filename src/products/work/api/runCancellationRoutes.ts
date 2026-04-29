/**
 * SPEC-096 / PLAN-085 Phase 3 — public Run stop and Mission cancel REST
 * surface. Both endpoints delegate to the generic cancellation service
 * in `platform/supervision/runCancellation.ts`. Status mapping follows
 * SPEC #31:
 *   200: stopped, cancelled, or already terminal
 *   404: mission or run not found
 *   409: not stoppable / blocked
 *   500: unexpected persistence/runtime failure (handled via
 *        `handleCoreError`)
 */

import { OWNER_ACTOR_ID } from '../../../core/actors.js';
import { handleCoreError } from '../../../core/api/shared.js';
import {
  cancelMission,
  stopRun,
} from '../../../platform/supervision/runCancellation.js';
import type {
  WorkCancellationRequest,
  WorkMissionCancelResponse,
  WorkRunStopResponse,
} from '../../../platform/supervision/runCancellationContracts.js';
import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../shared/http.js';
import {
  WORK_API_MISSION_CANCEL_PATTERN,
  WORK_API_RUN_STOP_PATTERN,
} from '../shared/apiPaths.js';
import type { WorkApiRouteContext } from './index.js';

export async function routeWorkRunCancellationApi(
  context: WorkApiRouteContext,
): Promise<boolean> {
  const runStopMatch = matchRoute(context.url.pathname, WORK_API_RUN_STOP_PATTERN);
  if (runStopMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    const runId = runStopMatch[0];
    if (!runId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_run_id', message: 'Run id is required.' },
      });
      return true;
    }

    try {
      const body = await readOptionalCancellationBody(context);
      const result = await stopRun(
        {
          coreStore: context.dependencies.coreStore,
          runtimeClient: context.dependencies.runtimeClient,
          now: context.dependencies.now,
        },
        runId,
        {
          ...body,
          source: 'run_stop',
        },
      );
      if (!result) {
        sendJson(context.response, 404, {
          error: {
            code: 'run_not_found',
            message: `Run not found: ${runId}`,
          },
        });
        return true;
      }
      sendJson(context.response, statusForRunStop(result), result);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  const missionCancelMatch = matchRoute(
    context.url.pathname,
    WORK_API_MISSION_CANCEL_PATTERN,
  );
  if (missionCancelMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    const missionId = missionCancelMatch[0];
    if (!missionId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_mission_id', message: 'Mission id is required.' },
      });
      return true;
    }

    try {
      const body = await readOptionalCancellationBody(context);
      const result = await cancelMission(
        {
          coreStore: context.dependencies.coreStore,
          runtimeClient: context.dependencies.runtimeClient,
          now: context.dependencies.now,
        },
        missionId,
        body,
      );
      if (!result) {
        sendJson(context.response, 404, {
          error: {
            code: 'mission_not_found',
            message: `Mission not found: ${missionId}`,
          },
        });
        return true;
      }
      sendJson(context.response, statusForMissionCancel(result), result);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  return false;
}

async function readOptionalCancellationBody(
  context: WorkApiRouteContext,
): Promise<WorkCancellationRequest> {
  const length = Number(context.request.headers['content-length'] ?? '0');
  if (!Number.isFinite(length) || length <= 0) {
    return { requestedByActorId: OWNER_ACTOR_ID };
  }
  const raw = await readJsonBody<Record<string, unknown> | null>(context.request);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { requestedByActorId: OWNER_ACTOR_ID };
  }
  return {
    requestedByActorId:
      typeof raw.requestedByActorId === 'string' && raw.requestedByActorId.trim().length > 0
        ? raw.requestedByActorId.trim()
        : OWNER_ACTOR_ID,
    reason:
      typeof raw.reason === 'string' && raw.reason.trim().length > 0
        ? raw.reason.trim()
        : undefined,
    idempotencyKey:
      typeof raw.idempotencyKey === 'string' && raw.idempotencyKey.trim().length > 0
        ? raw.idempotencyKey.trim()
        : undefined,
  };
}

function statusForRunStop(result: WorkRunStopResponse): number {
  return result.status === 'not_stoppable' ? 409 : 200;
}

function statusForMissionCancel(result: WorkMissionCancelResponse): number {
  return result.status === 'blocked' ? 409 : 200;
}
