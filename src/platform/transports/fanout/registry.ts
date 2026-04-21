import type { BotBindingPlatform, BotBindingRecord } from '../../../core/types.js';
import type { ChatMessage, MessageOrigin } from '../../../products/chat/api/contracts.js';

export interface TransportFanoutDeliveryInput {
  channelId: string;
  binding: BotBindingRecord;
  message: ChatMessage;
  origin: MessageOrigin;
  sourceTransportBindingId: string | null;
}

export interface TransportFanoutDeliveryResult {
  status: 'delivered' | 'skipped';
  reason?: string;
}

export interface TransportDeliverer {
  platform: BotBindingPlatform;
  deliver(input: TransportFanoutDeliveryInput): Promise<TransportFanoutDeliveryResult>;
}

export class TransportDelivererRegistry {
  private readonly deliverers = new Map<BotBindingPlatform, TransportDeliverer>();

  register(deliverer: TransportDeliverer): void {
    this.deliverers.set(deliverer.platform, deliverer);
  }

  get(platform: BotBindingPlatform): TransportDeliverer | null {
    return this.deliverers.get(platform) ?? null;
  }
}
