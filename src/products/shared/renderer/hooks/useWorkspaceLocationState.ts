import {
  useLocation,
  useMatch,
} from 'react-router-dom';

import {
  isWorkspaceNewChatPath,
  readWorkspaceNewChatMode,
  readWorkspaceNewChatLeadCatId,
  type WorkspaceNewChatMode,
} from '../../channelPaths.js';

export interface WorkspaceLocationState {
  location: ReturnType<typeof useLocation>;
  settingsMode: boolean;
  routeChannelId: string | null;
  routeMyCatId: string | null;
  showingNewChatDraft: boolean;
  newChatMode: WorkspaceNewChatMode;
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
  const newChatMode = showingNewChatDraft ? readWorkspaceNewChatMode(location.search) : 'default';
  const draftDefaultRecipientCatId =
    routeMyCatId ?? readWorkspaceNewChatLeadCatId(location.search);

  return {
    location,
    settingsMode:
      location.pathname === '/settings' || location.pathname.startsWith('/settings/'),
    routeChannelId,
    routeMyCatId,
    showingNewChatDraft,
    newChatMode,
    draftDefaultRecipientCatId,
    showingMyCatDirectLane: Boolean(routeMyCatId),
  };
}
