import type { ChatEventHub } from './chatEventHub.js';
import type { MessageOrigin } from './contracts.js';

const MESSAGE_ORIGINS = new Set<MessageOrigin>([
  'web',
  'telegram',
  'browser',
  'email',
  'runtime',
  'system',
  'unknown',
]);

export function normalizeMessageOrigin(value: unknown): MessageOrigin | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && MESSAGE_ORIGINS.has(trimmed as MessageOrigin)
    ? trimmed as MessageOrigin
    : null;
}

export interface RoomMutationDetail {
  messageId?: string;
  origin?: MessageOrigin;
  sourceTransportBindingId?: string | null;
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function buildRoomMessageMutationDetail(
  message: { id?: string | null; metadata?: Record<string, unknown> | null },
): RoomMutationDetail {
  const metadata = message.metadata ?? {};
  const origin = normalizeMessageOrigin(metadata.origin);
  const sourceTransportBindingId = readMetadataString(metadata, 'sourceTransportBindingId');
  const messageId = typeof message.id === 'string' && message.id.length > 0
    ? message.id
    : null;

  return {
    ...(messageId ? { messageId } : {}),
    ...(origin ? { origin } : {}),
    ...(sourceTransportBindingId ? { sourceTransportBindingId } : {}),
  };
}

export function publishTransportIngress(
  hub: ChatEventHub | undefined,
  channelId: string,
  catId?: string,
): void {
  if (!hub) return;
  hub.emit({
    kind: 'transport_ingress',
    channelId,
    catId,
    timestamp: new Date().toISOString(),
  });
  hub.emit({
    kind: 'recents_changed',
    timestamp: new Date().toISOString(),
  });
}

export function publishTransportOutbound(
  hub: ChatEventHub | undefined,
  channelId: string,
  catId?: string,
): void {
  if (!hub) return;
  hub.emit({
    kind: 'transport_outbound',
    channelId,
    catId,
    timestamp: new Date().toISOString(),
  });
}

export function publishRoomMutation(
  hub: ChatEventHub | undefined,
  channelId: string,
  kind: 'created' | 'updated' | 'message_added',
  detail: RoomMutationDetail = {},
): void {
  if (!hub) return;
  hub.emit({
    kind: 'room_updated',
    channelId,
    timestamp: new Date().toISOString(),
    detail: { mutation: kind, ...detail },
  });
}

export function publishChannelMutation(
  hub: ChatEventHub | undefined,
  channelId: string,
  kind: 'created' | 'updated' | 'message_added' = 'updated',
  detail: RoomMutationDetail = {},
): void {
  publishRoomMutation(hub, channelId, kind, detail);
  hub?.emit({
    kind: 'recents_changed',
    channelId,
    timestamp: new Date().toISOString(),
  });
}
