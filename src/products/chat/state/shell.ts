import type { AppConfig } from '../../../config.js';
import type { RuntimeStatusSummary } from '../../../platform/runtime/client.js';
import type { SuiteSurfaceId } from '../../../shared/suite-contract.js';
import type { RuntimeSetupSummary } from '../../../shared/runtimeSetup.js';
import { listEnabledSuiteSurfaces } from '../../../shared/suiteSurfaces.js';
import type { AppShellPayload, ChatBotBindingSummary, ChatState } from '../api/contracts.js';
import { createUnavailableRuntimeSetupSummary } from '../../../runtime/setup.js';
import { summarizeState } from './model/index.js';
import { resolveSetupCompletionTimestamp } from './setupCompletion.js';

function resolveSetupCompleteAt(
  chat: ChatState,
  now: Date,
  setup?: {
    bootstrapAttemptId?: string | null;
    setupCompleteAt: string | null;
    ownerDisplayName: string;
    ownerAvatarColor: string | null;
    ownerAvatarUrl?: string | null;
    botBindings?: ChatBotBindingSummary[];
    lastProductSurface?: SuiteSurfaceId | null;
  },
): string | null {
  return resolveSetupCompletionTimestamp(chat, {
    explicitSetupCompleteAt: setup?.setupCompleteAt,
    ownerDisplayName: setup?.ownerDisplayName,
    botBindingCount: setup?.botBindings?.length ?? 0,
    fallbackTimestamp: chat.globalOrchestrator.updatedAt,
    now,
  });
}

export function createAppShell(
  config: AppConfig,
  runtime: RuntimeStatusSummary,
  chat: ChatState,
  now: Date = new Date(),
  setup?: {
    bootstrapAttemptId?: string | null;
    setupCompleteAt: string | null;
    ownerDisplayName: string;
    ownerAvatarColor: string | null;
    ownerAvatarUrl?: string | null;
    botBindings?: ChatBotBindingSummary[];
    lastProductSurface?: SuiteSurfaceId | null;
    runtimeSetup?: RuntimeSetupSummary;
  },
): AppShellPayload {
  const summary = summarizeState(chat);
  const botBindings: ChatBotBindingSummary[] = setup?.botBindings ?? [];
  const resolvedSetupCompleteAt = resolveSetupCompleteAt(chat, now, setup);

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
      newChatDefaults: structuredClone(chat.newChatDefaults),
      capabilities: {
        ...chat.capabilities,
        maxBossCats: config.maxBossCats,
        maxCats: config.maxCats,
        availableSurfaces: listEnabledSuiteSurfaces(),
      },
      showVerboseMessages: chat.showVerboseMessages,
      botBindings,
    },
    runtime,
    runtimeSetup: setup?.runtimeSetup ?? createUnavailableRuntimeSetupSummary(
      new Error('Runtime setup was missing while building the app shell.'),
    ),
    metadata: {
      generatedAt: now.toISOString(),
      host: config.host,
      port: config.port,
    },
    bootstrapAttemptId: setup?.bootstrapAttemptId ?? null,
    setupCompleteAt: resolvedSetupCompleteAt,
    ownerDisplayName: setup?.ownerDisplayName ?? 'Owner',
    ownerAvatarColor: setup?.ownerAvatarColor ?? null,
    ownerAvatarUrl: setup?.ownerAvatarUrl ?? null,
    lastProductSurface: setup?.lastProductSurface ?? null,
  };
}
