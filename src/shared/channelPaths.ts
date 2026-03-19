const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const NEW_CHAT_PATH = '/new';
export const SETUP_PATH = '/setup';

export function resolveAppEntryPath(setupCompleteAt: string | null | undefined): string {
  return setupCompleteAt ? NEW_CHAT_PATH : SETUP_PATH;
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

export function slugifyChannelLabel(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

export function createChannelExportFilename(title: string, fallbackId: string): string {
  const slug = slugifyChannelLabel(title);
  return `channel-${slug || fallbackId}.json`;
}
