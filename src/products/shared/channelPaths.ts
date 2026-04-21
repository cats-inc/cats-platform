import type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import type { RoomRoutingMode } from '../../shared/roomRouting.js';
import { isDirectLaneSummary, type ProductChannelKind } from './channelTopology.js';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const NEW_CHAT_CAT_QUERY_PARAM = 'cat';
export const NEW_CHAT_PRESET_QUERY_PARAM = 'preset';
export const NEW_CHAT_PRESET_GROUP = 'group';
export const NEW_CHAT_PRESET_PARALLEL = 'parallel';
export const SETUP_PATH = '/setup';
export type WorkspaceNewChatPreset = 'default' | 'group' | 'parallel';

type WorkspaceChannelSummaryRef = {
  id: string;
  roomMode?: RoomRoutingMode | null;
  channelKind?: ProductChannelKind | null;
  originSurface?: PlatformSurfaceId | null;
};

function normalizeRouteToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveWorkspaceNewChatPath(chatPrefix: string): string {
  return `${chatPrefix}/new`;
}

export function resolveWorkspaceMyCatsPathPrefix(chatPrefix: string): string {
  return `${chatPrefix}/my-cats`;
}

export function resolveWorkspaceAppEntryPath(
  chatPrefix: string,
  setupCompleteAt: string | null | undefined,
): string {
  return setupCompleteAt ? resolveWorkspaceNewChatPath(chatPrefix) : SETUP_PATH;
}

export function buildWorkspaceNewChatPath(
  chatPrefix: string,
  defaultRecipientCatId?: string | null,
): string {
  const normalizedLeadCatId = normalizeRouteToken(defaultRecipientCatId);
  const newChatPath = resolveWorkspaceNewChatPath(chatPrefix);
  if (!normalizedLeadCatId) {
    return newChatPath;
  }

  const params = new URLSearchParams([[NEW_CHAT_CAT_QUERY_PARAM, normalizedLeadCatId]]);
  return `${newChatPath}?${params.toString()}`;
}

export function buildWorkspaceNewGroupChatPath(chatPrefix: string): string {
  const params = new URLSearchParams([[NEW_CHAT_PRESET_QUERY_PARAM, NEW_CHAT_PRESET_GROUP]]);
  return `${resolveWorkspaceNewChatPath(chatPrefix)}?${params.toString()}`;
}

export function buildWorkspaceNewParallelChatPath(chatPrefix: string): string {
  const params = new URLSearchParams([[NEW_CHAT_PRESET_QUERY_PARAM, NEW_CHAT_PRESET_PARALLEL]]);
  return `${resolveWorkspaceNewChatPath(chatPrefix)}?${params.toString()}`;
}

export function buildWorkspaceMyCatPath(chatPrefix: string, catId: string): string {
  const normalizedCatId = normalizeRouteToken(catId);
  const myCatsPathPrefix = resolveWorkspaceMyCatsPathPrefix(chatPrefix);
  if (!normalizedCatId) {
    return myCatsPathPrefix;
  }

  return `${myCatsPathPrefix}/${encodeURIComponent(normalizedCatId)}`;
}

export function readWorkspaceNewChatLeadCatId(search: string): string | null {
  const params = new URLSearchParams(search);
  return normalizeRouteToken(params.get(NEW_CHAT_CAT_QUERY_PARAM));
}

export function readWorkspaceNewChatPreset(search: string): WorkspaceNewChatPreset {
  const params = new URLSearchParams(search);
  const preset = normalizeRouteToken(params.get(NEW_CHAT_PRESET_QUERY_PARAM));
  if (preset === NEW_CHAT_PRESET_PARALLEL) {
    return 'parallel';
  }
  if (preset === NEW_CHAT_PRESET_GROUP) {
    return 'group';
  }
  return 'default';
}

export function buildWorkspaceChannelPath(chatPrefix: string, channelId: string): string {
  return `${chatPrefix}/chats/${encodeURIComponent(channelId)}`;
}

export function isOptimisticDraftChannelId(channelId: string | null | undefined): boolean {
  const normalized = channelId?.trim() ?? '';
  return normalized.startsWith('draft-');
}

export function resolveWorkspaceDefaultChatPath(
  chatPrefix: string,
  selectedChannelId: string | null | undefined,
): string {
  const normalized = selectedChannelId?.trim();
  return normalized
    ? buildWorkspaceChannelPath(chatPrefix, normalized)
    : resolveWorkspaceNewChatPath(chatPrefix);
}

export function resolveWorkspaceVisibleChatPath(
  chatPrefix: string,
  channels: ReadonlyArray<WorkspaceChannelSummaryRef>,
  selectedChannelId: string | null | undefined,
  activeSurface?: PlatformSurfaceId,
): string {
  const visibleChannels = activeSurface
    ? channels.filter((channel) =>
      channel.originSurface === activeSurface)
    : channels;
  const normalized = selectedChannelId?.trim() ?? '';
  const selectedVisible = visibleChannels.find((channel) =>
    channel.id === normalized && !isDirectLaneSummary(channel),
  );
  if (selectedVisible) {
    return buildWorkspaceChannelPath(chatPrefix, selectedVisible.id);
  }

  const firstVisible = visibleChannels.find((channel) => !isDirectLaneSummary(channel));
  return firstVisible
    ? buildWorkspaceChannelPath(chatPrefix, firstVisible.id)
    : resolveWorkspaceNewChatPath(chatPrefix);
}

export function isWorkspaceNewChatPath(chatPrefix: string, pathname: string): boolean {
  return pathname === resolveWorkspaceNewChatPath(chatPrefix);
}

export function isOpaqueChannelId(channelId: string): boolean {
  return UUID_PATTERN.test(channelId.trim());
}

function rawSlugifyChannelLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugifyChannelLabel(value: string): string {
  return rawSlugifyChannelLabel(value) || 'chat';
}

export function createChannelExportFilename(title: string, fallbackId: string): string {
  const slug = rawSlugifyChannelLabel(title);
  return `channel-${slug || fallbackId}.json`;
}

export function escapeContentDispositionFilename(filename: string): string {
  return filename
    .replace(/[\r\n]+/g, '')
    .replace(/["\\]/g, '\\$&');
}
