import { withBuiltinLivePreviewProfiles, type LivePreviewConfig } from './contracts.js';
import { selectLivePreviewProcessAdapter } from './processAdapterFactory.js';
import { createCodeLivePreviewProcessAdapter } from './staticAdapter.js';
import { LivePreviewSupervisor } from './supervisor.js';

/**
 * The Platform host's Cats Code live-preview supervisor (SPEC-123 CAP-05/13).
 * The in-process static profile is always available. Real process profiles
 * still require `useRealProcessAdapter` and an enabled, reviewed profile.
 */
export function createCodeLivePreviewSupervisor(config: LivePreviewConfig): LivePreviewSupervisor {
  const effective = withBuiltinLivePreviewProfiles(config);
  return new LivePreviewSupervisor({
    config: effective,
    processAdapter: createCodeLivePreviewProcessAdapter(selectLivePreviewProcessAdapter(effective)),
  });
}
