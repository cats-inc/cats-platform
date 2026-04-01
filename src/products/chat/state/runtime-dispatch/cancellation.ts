export interface ChannelDispatchCancellationRequest {
  channelId: string;
  requestedAt: string;
  note: string;
}

export interface ChannelDispatchCancellationRegistry {
  request(channelId: string, requestedAt: string, note?: string): ChannelDispatchCancellationRequest;
  read(channelId: string): ChannelDispatchCancellationRequest | null;
  consume(channelId: string): ChannelDispatchCancellationRequest | null;
}

export const DEFAULT_CHANNEL_DISPATCH_CANCELLATION_NOTE = 'Stopped this response.';

class InMemoryChannelDispatchCancellationRegistry
implements ChannelDispatchCancellationRegistry {
  private readonly requests = new Map<string, ChannelDispatchCancellationRequest>();

  request(
    channelId: string,
    requestedAt: string,
    note: string = DEFAULT_CHANNEL_DISPATCH_CANCELLATION_NOTE,
  ): ChannelDispatchCancellationRequest {
    const request = {
      channelId,
      requestedAt,
      note,
    };
    this.requests.set(channelId, request);
    return request;
  }

  read(channelId: string): ChannelDispatchCancellationRequest | null {
    return this.requests.get(channelId) ?? null;
  }

  consume(channelId: string): ChannelDispatchCancellationRequest | null {
    const request = this.requests.get(channelId) ?? null;
    if (request) {
      this.requests.delete(channelId);
    }
    return request;
  }
}

export const channelDispatchCancellationRegistry =
  new InMemoryChannelDispatchCancellationRegistry();
