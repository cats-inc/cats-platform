import type { AppShellPayload } from '../api/contracts';
import { deriveAppRouteState as deriveWorkspaceAppRouteState } from '../../shared/renderer/workspaceAppViewState.js';
import {
  isChatCat,
  resolveBossCatName,
  type SelectedChannelView,
  type Surface,
} from './chatUtils';
import {
  isDirectConversationMode,
  resolveConversationMode,
} from './conversationMode';
import { findDirectLaneForCat } from './myCatNavigation';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

type ChatAppViewTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultChatAppViewTranslator = createTranslator('en');

export type AppLoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function deriveAppRouteState(input: {
  state: AppLoadState;
  routeChannelId: string | null;
  draftDefaultRecipientCatId: string | null;
  showingMyCatDirectLane: boolean;
}): {
  readyPayload: AppShellPayload | null;
  readyChat: AppShellPayload['chat'] | null;
  readySelectedChannel: SelectedChannelView | null;
  selectedChannelId: string | null;
  selectedChannelViewId: string | null;
  selectedChannelEntryLifecycle: ReturnType<typeof deriveWorkspaceAppRouteState>['selectedChannelEntryLifecycle'];
  routeChannelExists: boolean;
  routeChannelTitle: string | null;
  routeDirectLaneSummary: ReturnType<typeof findDirectLaneForCat> | null;
  selectedChannel: SelectedChannelView | null;
  selectedDirectLane: SelectedChannelView | null;
  operatorRefreshKey: string;
} {
  return deriveWorkspaceAppRouteState(input) as unknown as ReturnType<typeof deriveAppRouteState>;
}

export function deriveAppViewState(input: {
  pathname: string;
  payload: AppShellPayload;
  draftDefaultRecipientCatId: string | null;
  showingGenericNewChatDraft: boolean;
  selectedChannel: SelectedChannelView | null;
  selectedDirectLane: SelectedChannelView | null;
  routeDirectLaneSummary: ReturnType<typeof findDirectLaneForCat> | null;
  showingMyCatDirectLane: boolean;
  addCatOpen: boolean;
  draftCatIds: string[];
  t?: ChatAppViewTranslator;
}) {
  const {
    addCatOpen,
    draftCatIds,
    draftDefaultRecipientCatId,
    pathname,
    payload,
    routeDirectLaneSummary,
    selectedChannel,
    selectedDirectLane,
    showingGenericNewChatDraft,
    showingMyCatDirectLane,
    t = defaultChatAppViewTranslator,
  } = input;
  const surface: Surface =
    pathname.startsWith('/settings')
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
  const activeMyCatId = draftDefaultRecipientCatId
    ? draftDefaultRecipientCatId
    : isDirectConversationMode(activeConversationMode)
      ? activeChannelView?.roomRouting.defaultRecipientId ?? null
      : null;
  const activeAssignedCats =
    activeChannelView?.assignedCats.filter((cat) => cat.status === 'active') ?? [];
  const assignedCatIds = new Set(
    activeChannelView?.assignedCats.map((cat) => cat.catId) ?? [],
  );
  const bossCatName = resolveBossCatName(payload) ?? t(messageKeys.sharedOrchestratorFallbackName);
  const bossCatAvatarColor = payload.chat.cats.find(
    (cat) => cat.id === payload.chat.bossCatId,
  )?.avatarColor ?? null;
  const showBossCatAvatar = Boolean(payload.chat.bossCatId)
    && selectedConversationMode === 'participant_thread'
    && !activeAssignedCats.some((cat) => cat.catId === payload.chat.bossCatId);
  const selectableCats = payload.chat.cats.filter(
    (cat) => cat.status === 'active' && cat.id !== payload.chat.bossCatId && isChatCat(cat),
  );
  const assignableCatCount = selectableCats.length;
  const draftCatIdSet = new Set(draftCatIds);
  const showDirectLaneBoot = Boolean(routeDirectLaneSummary && !directLaneChannel);
  const showAddCatPanel =
    addCatOpen && (Boolean(selectedChannel) || showingGenericNewChatDraft);

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
