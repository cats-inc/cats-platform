export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const NEW_CHAT_PATH = '/new';
export const NEW_CHAT_CAT_QUERY_PARAM = 'cat';
export const SETUP_PATH = '/setup';

export function resolveAppEntryPath(setupCompleteAt: string | null | undefined): string {
  return setupCompleteAt ? NEW_CHAT_PATH : SETUP_PATH;
}

function normalizeRouteToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildNewChatPath(leadCatId?: string | null): string {
  const normalizedLeadCatId = normalizeRouteToken(leadCatId);
  if (!normalizedLeadCatId) {
    return NEW_CHAT_PATH;
  }

  const params = new URLSearchParams([[NEW_CHAT_CAT_QUERY_PARAM, normalizedLeadCatId]]);
  return `${NEW_CHAT_PATH}?${params.toString()}`;
}

export function readNewChatLeadCatId(search: string): string | null {
  const params = new URLSearchParams(search);
  return normalizeRouteToken(params.get(NEW_CHAT_CAT_QUERY_PARAM));
}

export function buildChannelPath(channelId: string): string {
  return `/chats/${encodeURIComponent(channelId)}`;
}

export function resolveDefaultChatPath(selectedChannelId: string | null | undefined): string {
  const normalized = selectedChannelId?.trim();
  return normalized ? buildChannelPath(normalized) : NEW_CHAT_PATH;
}

export function isNewChatPath(pathname: string): boolean {
  return pathname === NEW_CHAT_PATH;
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
