import type { ChatEventHub } from './chatEventHub.js';
import type { ChatMessage, MessageOrigin } from './contracts.js';

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

export function buildRoomMessageMutationDetail(message: ChatMessage): RoomMutationDetail {
  const metadata = message.metadata ?? {};
  const origin = readMetadataString(metadata, 'origin') as MessageOrigin | null;
  const sourceTransportBindingId = readMetadataString(metadata, 'sourceTransportBindingId');

  return {
    messageId: message.id,
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
