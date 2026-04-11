import type { AppConfig } from '../../../config.js';
import type { AssistantPresetRecord, GuideCatRecord } from '../../../core/types.js';
import type { RuntimeStatusSummary } from '../../../platform/runtime/client.js';
import type {
  GuideCatSidecarMode,
  PlatformDesktopPreferences,
  PlatformLobbyCatSummary,
  PlatformLobbyPreferences,
  PlatformSurfaceId,
} from '../../../shared/platform-contract.js';
import { buildCatExecutionLabel } from '../../../shared/executionLabel.js';
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
    desktop?: PlatformDesktopPreferences;
    lobby?: PlatformLobbyPreferences;
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
    desktop?: PlatformDesktopPreferences;
    lobby?: PlatformLobbyPreferences;
    runtimeSetup?: RuntimeSetupSummary;
    guideCat?: GuideCatRecord | null;
    guideCatSidecarSeen?: boolean;
    guideCatSidecarMode?: GuideCatSidecarMode;
    assistantPresets?: AssistantPresetRecord[];
  },
): AppShellPayload {
  const summary = summarizeState(chat);
  const botBindings: ChatBotBindingSummary[] = setup?.botBindings ?? [];
  const resolvedSetupCompleteAt = resolveSetupCompleteAt(chat, now, setup);

  return {
    app: {
      name: 'cats-platform',
      stage: 'phase-2-shell',
      runtimeBoundary: 'cats-runtime',
    },
    products: listPlatformProductDescriptors(),
    desktop: {
      startAtLogin: setup?.desktop?.startAtLogin ?? true,
      openWindowOnStartup: setup?.desktop?.openWindowOnStartup ?? false,
      systemTrayEnabled: setup?.desktop?.systemTrayEnabled !== false,
    },
    lobby: {
      animationMode: setup?.lobby?.animationMode ?? 'reduced',
      cats: buildLobbyCats(summary.cats, chat.bossCatId),
    },
    chat: {
      id: chat.id,
      name: chat.name,
      selectedChannelId: chat.selectedChannelId,
      bossCatId: chat.bossCatId,
      cats: summary.cats,
      channels: summary.channels,
      parallelChatGroups: summary.parallelChatGroups,
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
        maxChatParticipants: config.maxChatParticipants,
        maxAudienceParticipants: config.maxAudienceParticipants,
        maxParallelChats: config.maxParallelChats,
        debugLiveTrace: config.debugLiveTrace,
        availableSurfaces: listEnabledPlatformSurfaces(),
      },
      showVerboseMessages: chat.showVerboseMessages,
      showLiveProgressDetails: chat.showLiveProgressDetails ?? false,
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
    guideCatSidecarSeen: setup?.guideCatSidecarSeen ?? false,
    guideCatSidecarMode: setup?.guideCatSidecarMode ?? 'auto',
    assistantPresets: structuredClone(setup?.assistantPresets ?? []),
  };
}

function buildLobbyCats(
  cats: readonly {
    id: string;
    name: string;
    avatarColor: string | null;
    avatarUrl: string | null;
    status: string;
    defaultExecutionTarget?: { provider: string; instance?: string | null; model?: string | null } | null;
    defaultModelSelection?: { controls?: Record<string, string | number | boolean> | null } | null;
  }[],
  bossCatId: string | null,
): PlatformLobbyCatSummary[] {
  return cats
    .filter((cat) => cat.status === 'active')
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      avatarColor: cat.avatarColor,
      avatarUrl: cat.avatarUrl,
      isBoss: cat.id === bossCatId,
      executionLabel: cat.defaultExecutionTarget
        ? buildCatExecutionLabel(cat as { defaultExecutionTarget: { provider: string; instance?: string | null; model?: string | null }; defaultModelSelection?: { controls?: Record<string, string | number | boolean> | null } | null })
        : null,
    }));
}
