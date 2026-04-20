import {
  useLocation,
  useMatch,
} from 'react-router-dom';

import {
  isWorkspaceNewChatPath,
  readWorkspaceNewChatPreset,
  readWorkspaceNewChatLeadCatId,
  type WorkspaceNewChatPreset,
} from '../../channelPaths.js';
import { isSettingsPath } from '../../../../shared/settingsRoute.js';

export interface WorkspaceLocationState {
  location: ReturnType<typeof useLocation>;
  settingsMode: boolean;
  routeChannelId: string | null;
  routeMyCatId: string | null;
  showingNewChatDraft: boolean;
  newChatPreset: WorkspaceNewChatPreset;
  draftDefaultRecipientCatId: string | null;
  showingMyCatDirectLane: boolean;
}

export function useWorkspaceLocationState(chatPrefix: string): WorkspaceLocationState {
  const location = useLocation();
  const channelMatch = useMatch(`${chatPrefix}/chats/:channelId`);
  const myCatMatch = useMatch(`${chatPrefix}/my-cats/:catId`);
  const routeChannelId = channelMatch?.params.channelId ?? null;
  const routeMyCatId = myCatMatch?.params.catId ?? null;
  const showingNewChatDraft = isWorkspaceNewChatPath(chatPrefix, location.pathname);
  const newChatPreset = showingNewChatDraft ? readWorkspaceNewChatPreset(location.search) : 'default';
  const draftDefaultRecipientCatId =
    routeMyCatId ?? readWorkspaceNewChatLeadCatId(location.search);

  return {
    location,
    settingsMode: isSettingsPath(location.pathname),
    routeChannelId,
    routeMyCatId,
    showingNewChatDraft,
    newChatPreset,
    draftDefaultRecipientCatId,
    showingMyCatDirectLane: Boolean(routeMyCatId),
  };
}
