import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import { resolvePlatformSurfaceFromPath } from '../../../core/platformSurface.js';
import { normalizePlatformSurface } from '../../../shared/platformSurfaces.js';
import {
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
} from '../../../shared/runtimeStatusPresentation.js';

interface ConversationSidebarCat {
  id: string;
  name: string;
  status: string;
  avatarColor: string | null;
  avatarUrl: string | null;
}

interface ConversationSidebarChannel {
  id: string;
  title: string;
  originSurface?: PlatformSurfaceId | null;
  defaultRecipientCatId?: string | null;
  defaultRecipientLeaseStatus?: unknown;
  channelKind?: 'boss_thread' | 'direct_lane' | 'multi_cat_room' | null;
  roomMode?: unknown;
}

interface ConversationSidebarBotBinding {
  platform: string;
  status: string;
  catId: string | null;
}

interface ConversationSidebarPayload<
  TCat extends ConversationSidebarCat = ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel = ConversationSidebarChannel,
> {
  runtime: {
    baseUrl: string;
    reachable?: boolean;
    status?: string | null;
  };
  chat: {
    cats: TCat[];
    channels: TChannel[];
    botBindings?: ConversationSidebarBotBinding[];
  };
}

interface ConversationSidebarLegacyRuntimeFields {
  runtimeBaseUrl?: string | null;
  runtimeReachable?: boolean;
}

interface ConversationSidebarRecentChannelEntry<TChannel extends ConversationSidebarChannel> {
  key?: string;
  channel: TChannel;
  titleOverride?: string;
  disableRename?: boolean;
}

interface ConversationSidebarRecentGroupEntry<TChannel extends ConversationSidebarChannel> {
  kind: 'group';
  key: string;
  title: string;
  channels: readonly ConversationSidebarRecentChannelEntry<TChannel>[];
  overflowKey?: string;
  isSelected?: boolean;
  onSelect: () => void;
  onRename?: (title: string) => void;
  onUngroup?: () => void;
  onDelete?: () => void;
  renameBusyKey?: string;
  ungroupBusyKey?: string;
  deleteBusyKey?: string;
}

type ConversationSidebarRecentEntry<TChannel extends ConversationSidebarChannel> =
  | ({ kind: 'channel' } & ConversationSidebarRecentChannelEntry<TChannel>)
  | ConversationSidebarRecentGroupEntry<TChannel>;

interface ConversationSidebarHelpers<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
  TDot extends string = string,
> {
  isVisibleCat: (cat: TCat) => boolean;
  isDirectLaneSummary: (channel: TChannel) => boolean;
}

export function resolveConversationSidebarChannelSurface(
  originSurface: unknown,
): PlatformSurfaceId {
  return normalizePlatformSurface(originSurface, 'chat') ?? 'chat';
}

export function buildConversationSidebarViewModel<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
  TPayload extends ConversationSidebarPayload<TCat, TChannel>,
  TDot extends string,
>(input: {
  payload: TPayload;
  helpers: ConversationSidebarHelpers<TCat, TChannel, TDot>;
  recentEntries?: readonly ConversationSidebarRecentEntry<TChannel>[];
  shellSurface?: PlatformSurfaceId;
  currentPath: string;
}) {
  const { payload, helpers, recentEntries, currentPath } = input;
  const activeSurface = input.shellSurface ?? resolvePlatformSurfaceFromPath(currentPath);
  const visibleCats = payload.chat.cats.filter((cat) => helpers.isVisibleCat(cat));
  const resolvedRuntime = payload.runtime ?? {
    baseUrl: (payload as ConversationSidebarLegacyRuntimeFields).runtimeBaseUrl ?? '',
    reachable: (payload as ConversationSidebarLegacyRuntimeFields).runtimeReachable,
    status: null,
  };
  const telegramBoundCatIds = new Set(
    (payload.chat.botBindings ?? [])
      .filter((binding) => binding.platform === 'telegram' && binding.status === 'active')
      .map((binding) => binding.catId)
      .filter((catId): catId is string => Boolean(catId)),
  );
  const recentsChannels = payload.chat.channels.filter(
    (channel) =>
      !helpers.isDirectLaneSummary(channel)
      && resolveConversationSidebarChannelSurface(channel.originSurface) === activeSurface,
  );
  const resolvedRecentEntries = recentEntries
    ?? recentsChannels.map((channel) => ({ kind: 'channel', channel } as const));
  const runtimeFooterStatus = resolveRuntimePresentationStatus(resolvedRuntime);

  return {
    activeSurface,
    showMyCats: visibleCats.length > 0,
    visibleCats,
    resolvedRuntime,
    telegramBoundCatIds,
    resolvedRecentEntries,
    runtimeFooterStatus,
    runtimeFooterLabel: resolveRuntimeTooltip(runtimeFooterStatus),
  };
}
