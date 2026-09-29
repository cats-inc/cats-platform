import {
  VITE_LIVE_PREVIEW_PROFILE,
  withBuiltinLivePreviewProfiles,
  type LivePreviewConfig,
} from './contracts.js';
import type { LivePreviewProcessAdapter } from './processAdapter.js';
import { selectLivePreviewProcessAdapter } from './processAdapterFactory.js';
import { createRealLivePreviewProcessAdapter } from './realProcessAdapter.js';
import { createCodeLivePreviewProcessAdapter } from './staticAdapter.js';
import { LivePreviewSupervisor, type LivePreviewProcessRegistry } from './supervisor.js';

export interface CodeLivePreviewHostOptions {
  /**
   * The user's Settings > Code opt-in "Cats may run preview servers". When
   * given, the reviewed Vite profile is available and spawns real processes
   * only while this returns true (SPEC-123 CAP-07/CAP-08).
   */
  previewServersAllowed?: () => Promise<boolean>;
  /** Records running dev servers for the next start's orphan sweep (CAP-13). */
  processRegistry?: LivePreviewProcessRegistry;
}

/**
 * The Platform host's Cats Code live-preview supervisor (SPEC-123 CAP-05/13).
 * The in-process static profile is always available. Process profiles need
 * either the operator's `useRealProcessAdapter` config or the user's opt-in.
 */
export function createCodeLivePreviewSupervisor(
  config: LivePreviewConfig,
  options: CodeLivePreviewHostOptions = {},
): LivePreviewSupervisor {
  const allowed = options.previewServersAllowed;
  const operatorEnabled = config.enabled && config.useRealProcessAdapter === true;
  const withOptIn = allowed && !config.commandProfiles.some((profile) => profile.id === VITE_LIVE_PREVIEW_PROFILE.id)
    ? { ...config, commandProfiles: [...config.commandProfiles, { ...VITE_LIVE_PREVIEW_PROFILE, enabled: true }] }
    : config;
  const effective = withBuiltinLivePreviewProfiles(withOptIn);
  const processAdapter = !operatorEnabled && allowed
    ? createOptInProcessAdapter(allowed)
    : selectLivePreviewProcessAdapter(effective);
  return new LivePreviewSupervisor({
    config: effective,
    processAdapter: createCodeLivePreviewProcessAdapter(processAdapter),
    ...(options.processRegistry ? { processRegistry: options.processRegistry } : {}),
  });
}

/** Spawns real processes only while the user's opt-in holds. */
export function createOptInProcessAdapter(
  allowed: () => Promise<boolean>,
  real: LivePreviewProcessAdapter = createRealLivePreviewProcessAdapter(),
): LivePreviewProcessAdapter {
  return {
    async spawn(input) {
      if (!await allowed()) {
        throw new Error('Preview servers are off. Turn on "Cats may run preview servers" in Settings > Code.');
      }
      return real.spawn(input);
    },
  };
}
