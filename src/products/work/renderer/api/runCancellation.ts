/**
 * Renderer-facing Run stop / Mission cancel API helpers (SPEC-096).
 * Delegates to the public POST endpoints landed in PLAN-085 Phase 3.
 */

import type {
  WorkCancellationRequest,
  WorkMissionCancelResponse,
  WorkRunStopResponse,
} from '../../../../platform/supervision/runCancellationContracts.js';
import {
  messageKeys,
  t as translate,
} from '../../../../shared/i18n/index.js';
import {
  buildWorkApiMissionCancelPath,
  buildWorkApiRunStopPath,
} from '../../shared/apiPaths.js';

export type {
  WorkCancellationRequest,
  WorkMissionCancelResponse,
  WorkRunStopResponse,
};

export interface CancellationRouteError extends Error {
  statusCode: number;
}

export interface WorkCancellationErrorMessages {
  fallbackMessage: string;
  routeFallback: (statusCode: number) => string;
}

function createRouteError(statusCode: number, message: string): CancellationRouteError {
  const error = new Error(message) as CancellationRouteError;
  error.statusCode = statusCode;
  return error;
}

function defaultStopRunMessages(): WorkCancellationErrorMessages {
  return {
    fallbackMessage: translate(messageKeys.workRunStopError),
    routeFallback: (statusCode) =>
      translate(messageKeys.workRunStopRouteFailed, { statusCode }),
  };
}

function defaultCancelMissionMessages(): WorkCancellationErrorMessages {
  return {
    fallbackMessage: translate(messageKeys.workMissionCancelError),
    routeFallback: (statusCode) =>
      translate(messageKeys.workMissionCancelRouteFailed, { statusCode }),
  };
}

async function postCancellation<T>(
  url: string,
  body: WorkCancellationRequest | undefined,
  messages: WorkCancellationErrorMessages,
): Promise<T> {
  const init: RequestInit = {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  };
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // Fall through with payload === null; status mapping below decides
      // whether to surface a generic error.
    }
  }
  if (!response.ok) {
    const message = (() => {
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const candidate = (payload as { error?: { message?: string } }).error?.message;
        if (typeof candidate === 'string' && candidate.length > 0) {
          return candidate;
        }
      }
      return messages.routeFallback(response.status) || messages.fallbackMessage;
    })();
    throw createRouteError(response.status, message);
  }
  return payload as T;
}

export async function stopWorkRun(
  runId: string,
  body?: WorkCancellationRequest,
  messages: WorkCancellationErrorMessages = defaultStopRunMessages(),
): Promise<WorkRunStopResponse> {
  return postCancellation<WorkRunStopResponse>(
    buildWorkApiRunStopPath(runId),
    body,
    messages,
  );
}

export async function cancelWorkMission(
  missionId: string,
  body?: WorkCancellationRequest,
  messages: WorkCancellationErrorMessages = defaultCancelMissionMessages(),
): Promise<WorkMissionCancelResponse> {
  return postCancellation<WorkMissionCancelResponse>(
    buildWorkApiMissionCancelPath(missionId),
    body,
    messages,
  );
}
