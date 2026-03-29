import type { ChatEventHub } from './chatEventHub.js';

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
): void {
  if (!hub) return;
  hub.emit({
    kind: 'room_updated',
    channelId,
    timestamp: new Date().toISOString(),
    detail: { mutation: kind },
  });
}
