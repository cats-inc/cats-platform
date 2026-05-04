import type {
  MessageInterpolationValues,
  MessageKey,
} from '../../../../shared/i18n/index.js';
import type {
  WorkMissionCancelResponse,
  WorkRunStopResponse,
} from '../api/runCancellation.js';

type WorkTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

type MissionCancelBlocker = WorkMissionCancelResponse['blockers'][number];

const NO_RUNTIME_SESSION_REASON =
  'Running run is not stoppable: no supervised runtime session is bridged.';
const RUNTIME_CLIENT_UNAVAILABLE_REASON =
  'Runtime client is unavailable; cannot request runtime cancellation.';
const RUN_NOT_STOPPABLE_REASON = 'Run is not stoppable.';
const RUNTIME_CANCELLATION_FAILED_PREFIX = 'Runtime cancellation failed: ';

export function formatRunCancellationBlockerReason(
  reason: string | null | undefined,
  t: WorkTranslator,
): string {
  const value = reason?.trim();
  if (!value || value === RUN_NOT_STOPPABLE_REASON) {
    return t('workCancellationBlockerRunNotStoppable');
  }
  if (value === NO_RUNTIME_SESSION_REASON) {
    return t('workCancellationBlockerNoRuntimeSession');
  }
  if (value === RUNTIME_CLIENT_UNAVAILABLE_REASON) {
    return t('workCancellationBlockerRuntimeClientUnavailable');
  }
  if (value.startsWith(RUNTIME_CANCELLATION_FAILED_PREFIX)) {
    const error = value.slice(RUNTIME_CANCELLATION_FAILED_PREFIX.length).trim();
    return error
      ? t('workCancellationBlockerRuntimeCancellationFailed', { error })
      : t('workRunStopErrorFallback');
  }
  return value;
}

export function formatRunStopBlockerMessage(
  result: WorkRunStopResponse,
  t: WorkTranslator,
): string {
  if (result.message) {
    return formatRunCancellationBlockerReason(result.message, t);
  }
  if (result.runtimeAbort.status === 'failed') {
    if (result.runtimeAbort.error === 'runtime_client_unavailable') {
      return t('workCancellationBlockerRuntimeClientUnavailable');
    }
    return result.runtimeAbort.error
      ? t('workCancellationBlockerRuntimeCancellationFailed', {
          error: result.runtimeAbort.error,
        })
      : t('workRunStopErrorFallback');
  }
  if (result.runtimeAbort.status === 'not_applicable') {
    return t('workCancellationBlockerNoRuntimeSession');
  }
  return t('workCancellationBlockerRunNotStoppable');
}

export function formatMissionCancelBlockerDetail(
  blockers: readonly MissionCancelBlocker[],
  t: WorkTranslator,
): string {
  return blockers
    .map((blocker) =>
      `${blocker.runId}: ${formatRunCancellationBlockerReason(blocker.reason, t)}`,
    )
    .join('; ');
}

export function formatMissionCancelBlockedMessage(
  blockers: readonly MissionCancelBlocker[],
  t: WorkTranslator,
): string {
  const detail = formatMissionCancelBlockerDetail(blockers, t);
  return t('workMissionCancelBlocked', {
    detail: detail || t('workMissionCancelBlockedNoDetails'),
  });
}
