import type { AppShellPayload } from '../api/contracts';
import {
  normalizeSelectedChannelView,
  resolveSelectedChannelEntryLifecycle,
} from '../shared/channelEntry';
import {
  isChatCat,
  resolveBossCatName,
  type SelectedChannelView,
  type Surface,
} from './chatUtils';
import {
  isDirectConversationMode,
  isSoloThreadConversationMode,
  resolveConversationMode,
} from './conversationMode';
import { findDirectLaneForCat } from './myCatNavigation';

export type AppLoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

function isDirectLaneSelectedForCat(
  channel: SelectedChannelView | null,
  catId: string | null,
): channel is SelectedChannelView {
  if (!channel || !catId) {
    return false;
  }

  return isDirectConversationMode(resolveConversationMode(channel))
    && channel.roomRouting.leadParticipantId === catId;
}

export function deriveAppRouteState(input: {
  state: AppLoadState;
  routeChannelId: string | null;
  draftLeadCatId: string | null;
  showingMyCatDirectLane: boolean;
}) {
  const { draftLeadCatId, routeChannelId, showingMyCatDirectLane, state } = input;
  const readyPayload = state.status === 'ready' ? state.payload : null;
  const readyChat = state.status === 'ready' ? state.payload.chat : null;
  const readySelectedChannel = normalizeSelectedChannelView(readyChat?.selectedChannel ?? null);
  const selectedChannelId = readyChat?.selectedChannelId ?? null;
  const selectedChannelViewId = readySelectedChannel?.id ?? null;
  const selectedChannelEntryLifecycle =
    resolveSelectedChannelEntryLifecycle(readySelectedChannel);
  const routeChannelExists = Boolean(
    routeChannelId && readyChat?.channels.some((channel) => channel.id === routeChannelId),
  );
  const routeChannelTitle = routeChannelId
    ? readyChat?.channels.find((channel) => channel.id === routeChannelId)?.title ?? null
    : null;
  const routeDirectLaneSummary =
    showingMyCatDirectLane && draftLeadCatId && readyChat
      ? findDirectLaneForCat(readyChat.channels, draftLeadCatId)
      : null;
  const selectedChannel = routeChannelId
    && readySelectedChannel?.id === routeChannelId
    ? readySelectedChannel
    : null;
  const selectedDirectLane =
    showingMyCatDirectLane
    && draftLeadCatId
    && isDirectLaneSelectedForCat(readySelectedChannel, draftLeadCatId)
      ? readySelectedChannel
      : null;
  const operatorRefreshKey = readyChat
    ? [
        readyChat.selectedChannelId,
        readySelectedChannel?.id ?? '',
        readySelectedChannel?.updatedAt ?? '',
        readySelectedChannel?.messages.length ?? 0,
        readySelectedChannel?.roomRouting.workflow.activeTurn?.updatedAt ?? '',
        readyChat.channels.length,
      ].join('|')
    : '';

  return {
    readyPayload,
    readyChat,
    readySelectedChannel,
    selectedChannelId,
    selectedChannelViewId,
    selectedChannelEntryLifecycle,
    routeChannelExists,
    routeChannelTitle,
    routeDirectLaneSummary,
    selectedChannel,
    selectedDirectLane,
    operatorRefreshKey,
  };
}

export function deriveAppViewState(input: {
  pathname: string;
  payload: AppShellPayload;
  draftLeadCatId: string | null;
  selectedChannel: SelectedChannelView | null;
  selectedDirectLane: SelectedChannelView | null;
  routeDirectLaneSummary: ReturnType<typeof findDirectLaneForCat> | null;
  showingMyCatDirectLane: boolean;
  addCatOpen: boolean;
  showingNewChatDraft: boolean;
  draftCatIds: string[];
}) {
  const {
    addCatOpen,
    draftCatIds,
    draftLeadCatId,
    pathname,
    payload,
    routeDirectLaneSummary,
    selectedChannel,
    selectedDirectLane,
    showingMyCatDirectLane,
    showingNewChatDraft,
  } = input;
  const surface: Surface =
    pathname.startsWith('/settings')
    || pathname === '/chat/settings'
    || pathname.startsWith('/chat/settings/')
      ? 'settings'
      : 'chats';
  const directLaneChannel = showingMyCatDirectLane ? selectedDirectLane : null;
  const activeChannelView = selectedChannel ?? directLaneChannel;
  const activeConversationMode = activeChannelView
    ? resolveConversationMode(activeChannelView)
    : null;
  const selectedConversationMode = selectedChannel
    ? resolveConversationMode(selectedChannel)
    : null;
  const activeMyCatId = draftLeadCatId
    ? draftLeadCatId
    : isDirectConversationMode(activeConversationMode)
      ? activeChannelView?.roomRouting.leadParticipantId ?? null
      : null;
  const activeAssignedCats =
    activeChannelView?.assignedCats.filter((cat) => cat.status === 'active') ?? [];
  const assignedCatIds = new Set(
    activeChannelView?.assignedCats.map((cat) => cat.catId) ?? [],
  );
  const bossCatName = resolveBossCatName(payload) ?? 'Orchestrator';
  const bossCatAvatarColor = payload.chat.cats.find(
    (cat) => cat.id === payload.chat.bossCatId,
  )?.avatarColor ?? null;
  const showBossCatAvatar = Boolean(payload.chat.bossCatId)
    && !isSoloThreadConversationMode(selectedConversationMode)
    && !isDirectConversationMode(selectedConversationMode)
    && !activeAssignedCats.some((cat) => cat.catId === payload.chat.bossCatId);
  const selectableCats = payload.chat.cats.filter(
    (cat) => cat.status === 'active' && cat.id !== payload.chat.bossCatId && isChatCat(cat),
  );
  const assignableCatCount = selectableCats.length;
  const draftCatIdSet = new Set(draftCatIds);
  const showDirectLaneBoot = Boolean(routeDirectLaneSummary && !directLaneChannel);
  const showAddCatPanel =
    addCatOpen && (Boolean(selectedChannel) || (showingNewChatDraft && !draftLeadCatId));

  return {
    surface,
    directLaneChannel,
    activeConversationMode,
    activeMyCatId,
    activeAssignedCats,
    assignedCatIds,
    bossCatName,
    bossCatAvatarColor,
    showBossCatAvatar,
    selectableCats,
    assignableCatCount,
    draftCatIdSet,
    showDirectLaneBoot,
    showAddCatPanel,
  };
}
