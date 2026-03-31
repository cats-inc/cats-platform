import type { RuntimeStatusSummary } from '../../platform/runtime/client.js';

export function resolveRuntimeConnectionChip(
  runtime: RuntimeStatusSummary,
): { className: string; label: string } {
  if (!runtime.reachable) {
    return {
      className: 'statusChip statusChipWarm',
      label: 'Runtime unavailable',
    };
  }

  const status = typeof runtime.status === 'string' ? runtime.status.toLowerCase() : '';
  if (status === 'degraded' || status === 'warming' || status === 'starting') {
    return {
      className: 'statusChip statusChipWarm',
      label: 'Runtime degraded',
    };
  }

  return {
    className: 'statusChip statusChipReady',
    label: 'Runtime connected',
  };
}
