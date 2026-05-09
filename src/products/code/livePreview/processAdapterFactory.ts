import type { LivePreviewConfig } from './contracts.js';
import type { LivePreviewProcessAdapter } from './processAdapter.js';
import { createRealLivePreviewProcessAdapter } from './realProcessAdapter.js';

/**
 * Inert process adapter that refuses to spawn anything. Returned when the
 * operator has not opted into real process spawning. Treat any spawn attempt
 * as a wiring bug — production code should check `livePreview.enabled` and
 * `livePreview.useRealProcessAdapter` before constructing a supervisor that
 * could call spawn.
 */
export function createInertLivePreviewProcessAdapter(): LivePreviewProcessAdapter {
  return {
    async spawn() {
      throw new Error(
        'Live preview process spawning is disabled. '
        + 'Set livePreview.enabled and livePreview.useRealProcessAdapter '
        + 'to true and ensure an approved profile is registered.',
      );
    },
  };
}

/**
 * Select the process adapter based on live-preview config. Returns the inert
 * adapter unless the operator has explicitly opted into the real adapter.
 *
 * Wiring contract:
 * - `config.enabled === true` AND `config.useRealProcessAdapter === true`
 *   → real `child_process.spawn`-backed adapter
 * - otherwise → inert adapter that refuses to spawn
 *
 * Tests that need to bypass real spawning should inject their own fake
 * adapter directly into `LivePreviewSupervisor` rather than going through
 * this factory.
 */
export function selectLivePreviewProcessAdapter(
  config: Pick<LivePreviewConfig, 'enabled' | 'useRealProcessAdapter'>,
): LivePreviewProcessAdapter {
  if (config.enabled && config.useRealProcessAdapter === true) {
    return createRealLivePreviewProcessAdapter();
  }
  return createInertLivePreviewProcessAdapter();
}
