import type { AppConfig } from '../../../config.js';
import type { CatsCoreState } from '../../../core/types.js';
import type { RuntimeStatusSummary } from '../../../platform/runtime/client.js';
import type { AppShellPayload, BotBindingSummary, ChatState } from '../../../shared/app-shell.js';
import { summarizeState } from './model.js';

export function createAppShell(
  config: AppConfig,
  runtime: RuntimeStatusSummary,
  chat: ChatState,
  now: Date = new Date(),
  setup?: { setupCompleteAt: string | null; ownerDisplayName: string; ownerAvatarColor: string | null },
  core?: CatsCoreState | null,
): AppShellPayload {
  const summary = summarizeState(chat);
  const botBindings: BotBindingSummary[] = (core?.botBindings ?? []).map((b) => ({
    id: b.id,
    platform: b.platform,
    botName: b.botName,
    boundCatId: b.boundCatId,
    defaultRoomMode: b.defaultRoomMode,
    status: b.status,
  }));

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
  };
}

