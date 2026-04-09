import type { AppShellPayload } from '../../api/workspaceContracts.js';

import { refetchAfterMutation } from './appShell.js';
import { expectJson } from './http.js';

export function createTelegramApi<TPayload>(options: {
  refetchAfterMutation: (
    mutationResponse: Response,
    errorFallback: string,
    signal?: AbortSignal,
  ) => Promise<TPayload>;
}) {
  async function createBotBindingApi(
    input: {
      botName: string;
      catId: string;
      inboundMode?: 'polling' | 'webhook';
      botToken?: string;
      webhookSecret?: string;
    },
    signal?: AbortSignal,
  ): Promise<TPayload> {
    const response = await fetch('/api/bot-bindings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ platform: 'telegram', ...input }),
      signal,
    });

    return options.refetchAfterMutation(
      response,
      `bot binding create returned ${response.status}`,
      signal,
    );
  }

  async function deleteBotBindingApi(
    bindingId: string,
    signal?: AbortSignal,
  ): Promise<TPayload> {
    const response = await fetch(`/api/bot-bindings/${encodeURIComponent(bindingId)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      signal,
    });

    return options.refetchAfterMutation(
      response,
      `bot binding delete returned ${response.status}`,
      signal,
    );
  }

  async function updateBotBindingApi(
    bindingId: string,
    input: {
      botName?: string;
      catId?: string;
      inboundMode?: 'polling' | 'webhook';
      status?: 'active' | 'disabled';
      botToken?: string | null;
      webhookSecret?: string | null;
    },
    signal?: AbortSignal,
  ): Promise<TPayload> {
    const response = await fetch(`/api/bot-bindings/${bindingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
    return expectJson(response, `update bot binding returned ${response.status}`);
  }

  return {
    createBotBindingApi,
    deleteBotBindingApi,
    updateBotBindingApi,
  };
}

export interface TelegramTransportRoomRouting {
  roomRoutingStatus: 'placeholder' | 'linked_room';
  linkedRoomId: string | null;
  note: string;
}

export interface TelegramTransportReceiptSummary {
  status?: string;
  reason?: string;
  acceptedAt?: string;
  deliveredAt?: string;
  chatId?: string | null;
  messageId?: string | null;
  bindingId?: string | null;
  errorMessage?: string | null;
}

export interface TelegramTransportBindingDiagnostics {
  telegramChatId: string;
  conversationId: string;
  bindingId: string | null;
  botName: string | null;
  roomRoutingStatus: 'placeholder' | 'linked_room';
  linkedRoomId: string | null;
  telegramChatUsername: string | null;
  lastInboundAt: string | null;
  lastInboundTextPreview: string | null;
  lastOutboundAt: string | null;
  lastOutboundMessageId: string | null;
}

export interface TelegramTransportPollingStatus {
  bindingId: string;
  health: 'healthy' | 'degraded' | 'failed' | 'stopped';
  lastPollTime: string | null;
  lastSuccessAt: string | null;
  lastPollError: string | null;
  consecutiveFailures: number;
  processedUpdateCount: number;
  lastProcessedUpdateId: number | null;
}

export interface TelegramTransportStatus {
  platform: 'telegram';
  status: 'bound' | 'unbound';
  webhookPath: string;
  diagnosticsPath: string;
  roomRouting: TelegramTransportRoomRouting;
  ingress: {
    secretTokenConfigured: boolean;
    maxBodyBytes: number;
    acceptedUpdates: number;
    ignoredUpdates: number;
    lastReceipt: TelegramTransportReceiptSummary | null;
  };
  delivery: {
    status: 'configured' | 'not_configured';
    supportedOperations: string[];
    sentCount: number;
    repliedCount: number;
    editedCount: number;
    deletedCount: number;
    failedCount: number;
    lastReceipt: TelegramTransportReceiptSummary | null;
  };
  polling?: {
    activeConsumers: number;
    statuses: TelegramTransportPollingStatus[];
  };
  note: string;
}

export interface TelegramTransportDiagnostics extends TelegramTransportStatus {
  dedupe: {
    retainedUpdateCount: number;
    maxRetainedUpdateCount: number;
  };
  bindings: TelegramTransportBindingDiagnostics[];
}

export async function fetchTelegramTransportStatus(
  signal?: AbortSignal,
): Promise<TelegramTransportStatus> {
  const response = await fetch('/api/transports/telegram', {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await expectJson<{ telegram: TelegramTransportStatus }>(
    response,
    `telegram transport status returned ${response.status}`,
  );
  return payload.telegram;
}

export async function fetchTelegramTransportDiagnostics(
  signal?: AbortSignal,
): Promise<TelegramTransportDiagnostics> {
  const response = await fetch('/api/transports/telegram/diagnostics', {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await expectJson<{ telegram: TelegramTransportDiagnostics }>(
    response,
    `telegram transport diagnostics returned ${response.status}`,
  );
  return payload.telegram;
}

export async function reconnectTelegramPolling(
  bindingId: string,
  signal?: AbortSignal,
): Promise<{ polling: TelegramTransportPollingStatus | null }> {
  const response = await fetch(`/api/transports/telegram/polling/${bindingId}/reconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });
  return expectJson(response, `polling reconnect returned ${response.status}`);
}

const workspaceTelegramApi = createTelegramApi<AppShellPayload>({
  refetchAfterMutation,
});

export const createBotBindingApi = workspaceTelegramApi.createBotBindingApi;
export const deleteBotBindingApi = workspaceTelegramApi.deleteBotBindingApi;
export const updateBotBindingApi = workspaceTelegramApi.updateBotBindingApi;
