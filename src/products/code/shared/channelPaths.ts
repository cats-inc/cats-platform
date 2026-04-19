import type { ChatChannelSummary } from '../api/contracts.js';
import {
  buildWorkspaceNewGroupChatPath,
  buildWorkspaceNewParallelChatPath,
  buildWorkspaceChannelPath,
  buildWorkspaceMyCatPath,
  buildWorkspaceNewChatPath,
  readWorkspaceNewChatPreset,
  readWorkspaceNewChatLeadCatId,
  resolveWorkspaceAppEntryPath,
  resolveWorkspaceDefaultChatPath,
  resolveWorkspaceMyCatsPathPrefix,
  resolveWorkspaceNewChatPath,
  resolveWorkspaceVisibleChatPath,
} from '../../shared/channelPaths.js';
export {
  UUID_PATTERN,
  NEW_CHAT_CAT_QUERY_PARAM,
  NEW_CHAT_PRESET_GROUP,
  NEW_CHAT_PRESET_PARALLEL,
  NEW_CHAT_PRESET_QUERY_PARAM,
  SETUP_PATH,
  escapeContentDispositionFilename,
  isOpaqueChannelId,
  isOptimisticDraftChannelId,
  slugifyChannelLabel,
  createChannelExportFilename,
} from '../../shared/channelPaths.js';

export const CHAT_PREFIX = '/code';
export const NEW_CHAT_PATH = resolveWorkspaceNewChatPath(CHAT_PREFIX);
export const MY_CATS_PATH_PREFIX = resolveWorkspaceMyCatsPathPrefix(CHAT_PREFIX);

export function resolveAppEntryPath(setupCompleteAt: string | null | undefined): string {
  return resolveWorkspaceAppEntryPath(CHAT_PREFIX, setupCompleteAt);
}

export function buildNewChatPath(defaultRecipientCatId?: string | null): string {
  return buildWorkspaceNewChatPath(CHAT_PREFIX, defaultRecipientCatId);
}

export function buildNewGroupChatPath(): string {
  return buildWorkspaceNewGroupChatPath(CHAT_PREFIX);
}

export function buildNewParallelChatPath(): string {
  return buildWorkspaceNewParallelChatPath(CHAT_PREFIX);
}

export function buildMyCatPath(catId: string): string {
  return buildWorkspaceMyCatPath(CHAT_PREFIX, catId);
}

export function readNewChatDefaultRecipientCatId(search: string): string | null {
  return readWorkspaceNewChatLeadCatId(search);
}

export function readNewChatPreset(search: string) {
  return readWorkspaceNewChatPreset(search);
}

export function buildChannelPath(channelId: string): string {
  return buildWorkspaceChannelPath(CHAT_PREFIX, channelId);
}

export function resolveDefaultChatPath(selectedChannelId: string | null | undefined): string {
  return resolveWorkspaceDefaultChatPath(CHAT_PREFIX, selectedChannelId);
}

export function resolveVisibleChatPath(
  channels: ReadonlyArray<Pick<ChatChannelSummary, 'id' | 'roomMode' | 'channelKind'>>,
  selectedChannelId: string | null | undefined,
): string {
  return resolveWorkspaceVisibleChatPath(CHAT_PREFIX, channels, selectedChannelId);
}

export function isNewChatPath(pathname: string): boolean {
  return pathname === NEW_CHAT_PATH;
}
