export type ChatEventKind =
  | 'room_updated'
  | 'recents_changed'
  | 'unread_changed'
  | 'transport_ingress'
  | 'transport_outbound'
  | 'session_state_changed';

export interface ChatEvent {
  kind: ChatEventKind;
  channelId?: string;
  catId?: string;
  timestamp: string;
  detail?: Record<string, unknown>;
}

export type ChatEventListener = (event: ChatEvent) => void;

export class ChatEventHub {
  private listeners = new Set<ChatEventListener>();

  emit(event: ChatEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not break other subscribers.
      }
    }
  }

  subscribe(listener: ChatEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}

export function createChatEventHub(): ChatEventHub {
  return new ChatEventHub();
}
