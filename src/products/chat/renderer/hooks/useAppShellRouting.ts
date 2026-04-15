import { doesComposerSelectionBlockChannelRoute } from '../../../../shared/composer.js';
import type { AppShellPayload } from '../../api/contracts.js';
import {
  useWorkspaceAppShellRouting,
  type WorkspaceAppShellRoutingOptions,
} from '../../../shared/renderer/hooks/useWorkspaceAppShellRouting.js';
import { CHAT_PREFIX } from '../../shared/channelPaths.js';
import {
  fetchAppShell,
  updateSelectedChannel,
} from '../api/index.js';
import {
  resolveDraftRouteContext,
  resolveMissingDraftDefaultRecipientPath,
} from '../draftParticipants.js';

export function useAppShellRouting(
  options: Omit<WorkspaceAppShellRoutingOptions<AppShellPayload>, 'chatPrefix'>,
) {
  const {
    draftDefaultRecipientCatId,
    showingMyCatDirectLane,
  } = options;

  return useWorkspaceAppShellRouting({
    ...options,
    chatPrefix: CHAT_PREFIX,
    fetchAppShell,
    updateSelectedChannel,
    isRouteSelectionBlocked: doesComposerSelectionBlockChannelRoute,
    resolveMissingDraftDefaultRecipientPath: ({
      channels,
      selectedChannelId,
    }) =>
      resolveMissingDraftDefaultRecipientPath({
        route: resolveDraftRouteContext({
          draftDefaultRecipientCatId,
          showingMyCatDirectLane,
        }),
        channels,
        selectedChannelId,
      }),
  });
}
