import type { AppConfig } from '../../../config.js';
import type { GuideCatRecord } from '../../../core/types.js';
import type { RuntimeStatusSummary } from '../../../platform/runtime/client.js';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import type { RuntimeSetupSummary } from '../../../shared/runtimeSetup.js';
import { listPlatformProductDescriptors } from '../../../shared/platformProducts.js';
import { listEnabledPlatformSurfaces } from '../../../shared/platformSurfaces.js';
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
    lastProductSurface?: PlatformSurfaceId | null;
    guideCat?: GuideCatRecord | null;
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
    lastProductSurface?: PlatformSurfaceId | null;
    runtimeSetup?: RuntimeSetupSummary;
    guideCat?: GuideCatRecord | null;
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
    products: listPlatformProductDescriptors(),
    chat: {
      id: chat.id,
      name: chat.name,
      selectedChannelId: chat.selectedChannelId,
      bossCatId: chat.bossCatId,
      cats: summary.cats,
      channels: summary.channels,
      concurrentGroups: summary.concurrentGroups,
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
        maxParallelChats: config.maxParallelChats,
        availableSurfaces: listEnabledPlatformSurfaces(),
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
    guideCat: setup?.guideCat ? structuredClone(setup.guideCat) : null,
  };
}
