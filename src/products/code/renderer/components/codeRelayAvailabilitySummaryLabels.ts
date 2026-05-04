import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import type { CodeRelayRosterEntryPayload } from '../api/relay.js';

type CodeRelayTranslate = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

function fallbackRelayAvailabilitySummary(
  entry: CodeRelayRosterEntryPayload,
  t: CodeRelayTranslate,
): string {
  return `${entry.provider}:${entry.instance ?? t(messageKeys.codeRelayLabelDefault)}`;
}

export function presentCodeRelayAvailabilitySummary(
  entry: CodeRelayRosterEntryPayload,
  t: CodeRelayTranslate,
): string {
  const summary = entry.availabilitySummary;
  if (!summary) {
    return fallbackRelayAvailabilitySummary(entry, t);
  }

  switch (summary.kind) {
    case 'runtime_config_unavailable':
      return t(messageKeys.codeRelayAvailabilityRuntimeConfigUnavailable);
    case 'provider_path_missing':
      return t(messageKeys.codeRelayAvailabilityProviderPathMissing, {
        providerLabel: summary.providerLabel,
      });
    case 'instance_unavailable':
      return t(messageKeys.codeRelayAvailabilityInstanceUnavailable, {
        providerLabel: summary.providerLabel,
        instance: summary.instance,
      });
    case 'runtime_ready_via':
      return t(messageKeys.codeRelayAvailabilityRuntimeReadyVia, {
        target: summary.target,
      });
    case 'provider_path_ready':
      return t(messageKeys.codeRelayAvailabilityProviderPathReady, {
        providerLabel: summary.providerLabel,
      });
  }
}

