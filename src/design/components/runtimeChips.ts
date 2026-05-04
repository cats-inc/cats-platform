import type { RuntimeStatusSummary } from '../../platform/runtime/client.js';
import {
  messageKeys,
  t as defaultTranslate,
  type MessageKey,
} from '../../shared/i18n/index.js';
import type { SettingsStatusChipTone } from './settings/SettingsStatusChipTone.js';

export type RuntimeConnectionChipTone = 'ready' | 'warm' | 'muted';
export type RuntimeConnectionChipTranslator = (key: MessageKey) => string;

export function resolveRuntimeConnectionChip(
  runtime: RuntimeStatusSummary,
  translate: RuntimeConnectionChipTranslator = defaultTranslate,
): { tone: RuntimeConnectionChipTone; label: string } {
  if (!runtime.reachable) {
    return {
      tone: 'warm',
      label: translate(messageKeys.sharedRuntimeStatusChipUnavailable),
    };
  }

  const status = typeof runtime.status === 'string' ? runtime.status.toLowerCase() : '';
  if (status === 'degraded' || status === 'warming' || status === 'starting') {
    return {
      tone: 'warm',
      label: translate(messageKeys.sharedRuntimeStatusChipDegraded),
    };
  }

  return {
    tone: 'ready',
    label: translate(messageKeys.sharedRuntimeStatusChipReady),
  };
}
