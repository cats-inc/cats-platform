import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../../shared/i18n/index.js';

type WorkRunSummaryTranslate = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

export function presentWorkRunSummary(
  summary: string,
  t: WorkRunSummaryTranslate,
): string {
  switch (summary) {
    case 'Blocked before runtime launch completed.':
      return t(messageKeys.workRunSummaryBlockedBeforeRuntimeLaunch);
    case 'Blocked before scheduled runtime launch completed.':
      return t(messageKeys.workRunSummaryBlockedBeforeScheduledRuntimeLaunch);
    case 'Launching scheduled mission through supervised runtime boundary.':
      return t(messageKeys.workRunSummaryLaunchingScheduledMission);
    case 'Provider-agent runtime message completed.':
      return t(messageKeys.workRunSummaryProviderAgentRuntimeMessageCompleted);
    case 'Queued supervised Work run.':
      return t(messageKeys.workRunSummaryQueuedSupervisedWorkRun);
    case 'Started supervised Code task execution.':
      return t(messageKeys.workRunSummaryStartedSupervisedCodeTaskExecution);
    default:
      break;
  }

  const relayFanOutMatch = summary.match(/^Relay fan-out dispatch for (.+)\.$/u);
  if (relayFanOutMatch) {
    return t(messageKeys.workRunSummaryRelayFanOutDispatch, {
      agentLabel: relayFanOutMatch[1],
    });
  }

  return summary;
}

