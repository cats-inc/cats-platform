import type { AppConfig } from '../../../config.js';
import type { RuntimeStatusSummary } from '../../../platform/runtime/client.js';
import type { SuiteSurfaceId } from '../../../shared/suite-contract.js';
import type { AppShellPayload, ChatBotBindingSummary, ChatState } from '../api/contracts.js';
import { summarizeState } from './model/index.js';

export function createAppShell(
  config: AppConfig,
  runtime: RuntimeStatusSummary,
  chat: ChatState,
  now: Date = new Date(),
  setup?: {
    setupCompleteAt: string | null;
    ownerDisplayName: string;
    ownerAvatarColor: string | null;
    botBindings?: ChatBotBindingSummary[];
    lastProductSurface?: SuiteSurfaceId | null;
  },
): AppShellPayload {
  const summary = summarizeState(chat);
  const botBindings: ChatBotBindingSummary[] = setup?.botBindings ?? [];

  return {
    app: {
      name: 'cats',
      stage: 'phase-2-shell',
      runtimeBoundary: 'cats-runtime',
    },
    chat: {
      id: chat.id,
      name: chat.name,
      selectedChannelId: chat.selectedChannelId,
      bossCatId: chat.bossCatId,
      cats: summary.cats,
      channels: summary.channels,
      selectedChannel: summary.selectedChannel,
      globalOrchestrator: {
        ...summary.globalOrchestrator,
        status: runtime.reachable ? 'ready' : 'warming',
      },
      capabilities: chat.capabilities,
      showVerboseMessages: chat.showVerboseMessages,
      botBindings,
    },
    runtime,
    metadata: {
      generatedAt: now.toISOString(),
      host: config.host,
      port: config.port,
    },
    setupCompleteAt: setup?.setupCompleteAt ?? null,
    ownerDisplayName: setup?.ownerDisplayName ?? 'Owner',
    ownerAvatarColor: setup?.ownerAvatarColor ?? null,
    lastProductSurface: setup?.lastProductSurface ?? null,
  };
}

