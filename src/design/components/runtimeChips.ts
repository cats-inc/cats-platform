import type { SettingsStatusChipTone } from './settings/index.js';
import type { RuntimeStatusSummary } from '../../platform/runtime/client.js';

export function resolveRuntimeConnectionChip(
  runtime: RuntimeStatusSummary,
): { tone: SettingsStatusChipTone; label: string } {
  if (!runtime.reachable) {
    return { tone: 'warm', label: 'Runtime unavailable' };
  }

  const status = typeof runtime.status === 'string' ? runtime.status.toLowerCase() : '';
  if (status === 'degraded' || status === 'warming' || status === 'starting') {
    return { tone: 'warm', label: 'Runtime degraded' };
  }

  return { tone: 'ready', label: 'Runtime connected' };
}
