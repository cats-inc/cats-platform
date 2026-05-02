import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import { resolvePlatformSurfaceFromPath } from '../../../core/platformSurface.js';
import { normalizePlatformSurface } from '../../../shared/platformSurfaces.js';
import {
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
  type RuntimeTooltipTranslator,
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
  originSurface?: PlatformSurfaceId | null;
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
  originSurface: PlatformSurfaceId | null | undefined,
): PlatformSurfaceId | null {
  return normalizePlatformSurface(originSurface);
}

function channelMatchesActiveSurface<TChannel extends ConversationSidebarChannel>(
  channel: TChannel,
  activeSurface: PlatformSurfaceId,
): boolean {
  return resolveConversationSidebarChannelSurface(channel.originSurface) === activeSurface;
}

function filterRecentEntryBySurface<TChannel extends ConversationSidebarChannel>(
  entry: ConversationSidebarRecentEntry<TChannel>,
  activeSurface: PlatformSurfaceId,
): ConversationSidebarRecentEntry<TChannel> | null {
  if (entry.kind === 'channel') {
    return channelMatchesActiveSurface(entry.channel, activeSurface) ? entry : null;
  }

  const channels = entry.channels.filter((channelEntry) =>
    channelMatchesActiveSurface(channelEntry.channel, activeSurface),
  );
  if (channels.length === 0) {
    return null;
  }

  const groupSurface = entry.originSurface ?? channels[0]?.channel.originSurface ?? null;
  if (resolveConversationSidebarChannelSurface(groupSurface) !== activeSurface) {
    return null;
  }

  return {
    ...entry,
    channels,
  };
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
  t?: RuntimeTooltipTranslator;
}) {
  const { payload, helpers, recentEntries, currentPath, t } = input;
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
      && channelMatchesActiveSurface(channel, activeSurface),
  );
  const resolvedRecentEntries = recentEntries
    ? recentEntries
      .map((entry) => filterRecentEntryBySurface(entry, activeSurface))
      .filter((entry): entry is ConversationSidebarRecentEntry<TChannel> => entry != null)
    : recentsChannels.map((channel) => ({ kind: 'channel', channel } as const));
  const runtimeFooterStatus = resolveRuntimePresentationStatus(resolvedRuntime);

  return {
    activeSurface,
    showMyCats: visibleCats.length > 0,
    visibleCats,
    resolvedRuntime,
    telegramBoundCatIds,
    resolvedRecentEntries,
    runtimeFooterStatus,
    runtimeFooterLabel: resolveRuntimeTooltip(runtimeFooterStatus, t),
  };
}
