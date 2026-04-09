import type { AppShellPayload } from '../../api/contracts.js';

import {
  createTelegramApi,
  fetchTelegramTransportDiagnostics,
  fetchTelegramTransportStatus,
  reconnectTelegramPolling,
  type TelegramTransportBindingDiagnostics,
  type TelegramTransportDiagnostics,
  type TelegramTransportPollingStatus,
  type TelegramTransportReceiptSummary,
  type TelegramTransportRoomRouting,
  type TelegramTransportStatus,
} from '../../../shared/renderer/api/telegram.js';

import { refetchAfterMutation } from './appShell.js';

export type {
  TelegramTransportBindingDiagnostics,
  TelegramTransportDiagnostics,
  TelegramTransportPollingStatus,
  TelegramTransportReceiptSummary,
  TelegramTransportRoomRouting,
  TelegramTransportStatus,
};

const chatTelegramApi = createTelegramApi<AppShellPayload>({
  refetchAfterMutation,
});

export const createBotBindingApi = chatTelegramApi.createBotBindingApi;
export const deleteBotBindingApi = chatTelegramApi.deleteBotBindingApi;
export const updateBotBindingApi = chatTelegramApi.updateBotBindingApi;
export {
  fetchTelegramTransportDiagnostics,
  fetchTelegramTransportStatus,
  reconnectTelegramPolling,
};
