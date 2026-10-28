import { existsSync } from 'node:fs';
import type { RuntimeClient, RuntimeSendMessageInput } from '../../runtime/client.js';
import { readPlatformPreferences, writePlatformPreferences } from '../../shared/platformPreferences.js';
import { createDesktopControlHelperClient } from './helper.js';
import { createDesktopControlService, type DesktopControlTurnResolution } from './service.js';

export { DESKTOP_CONTROL_MCP_PATH } from './service.js';

/** The owner message metadata the channel route stamps for a local owner send (SPEC-133 DC-05). */
export const DESKTOP_CONTROL_ENTRY_KEY = 'desktopControlEntry';

interface ChatStoreLike {
  read(): Promise<{ channels: Array<{ id: string; messages: Array<{ id: string; senderKind: string; metadata: Record<string, unknown> }> }> }>;
}

/**
 * DC-05: a turn is owner-present when it dispatches a Chat owner message that the channel route
 * stamped as sent by the local owner. Heartbeats, schedules, delegation, Telegram and Mobile
 * sends resolve to their channel but are not owner-present.
 */
export async function resolveDesktopControlTurn(chatStore: ChatStoreLike, input: RuntimeSendMessageInput):
  Promise<DesktopControlTurnResolution | null> {
  const meta = input.context?.metadata;
  if (meta?.supervisionProduct !== 'cats-chat' || typeof meta.supervisionRunId !== 'string') return null;
  const runId = meta.supervisionRunId;
  const state = await chatStore.read();
  const channel = state.channels.find((row) => row.id === runId || `chat:${row.id}` === runId);
  if (!channel) return null;
  const sourceId = meta.sourceMessageId;
  const ownerPresent = meta.supervisionSurface === 'runtime-dispatch' && typeof sourceId === 'string'
    && channel.messages.some((message) => message.id === sourceId && message.senderKind === 'user'
      && message.metadata[DESKTOP_CONTROL_ENTRY_KEY] === 'local');
  return { channelId: channel.id, ownerPresent };
}

export function createDesktopControlForServer(options: {
  endpoint(): string | null;
  chatStatePath: string;
  chatStore(): ChatStoreLike;
  runtimeClient: RuntimeClient;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const helperPath = env.CATS_DESKTOP_CONTROL_HELPER?.trim();
  // DC-01: only a Windows Platform server that the Desktop host started with a helper path.
  const reason = platform !== 'win32' ? 'not_windows'
    : !helperPath ? 'no_helper'
      : !existsSync(helperPath) ? 'helper_missing'
        : null;
  const helper = reason || !helperPath ? null : createDesktopControlHelperClient({
    path: helperPath,
    // The Platform server, its Desktop host parent and their executables are never grantable.
    selfProcessIds: [process.pid, process.ppid].filter((id) => id > 0),
    selfExecutables: [process.execPath, env.CATS_DESKTOP_HOST_EXECUTABLE].filter((value): value is string => Boolean(value)),
  });
  const statePath = options.chatStatePath;
  return createDesktopControlService({
    helper,
    unavailableReason: reason,
    endpoint: options.endpoint,
    async readSettings() {
      const preferences = await readPlatformPreferences(statePath);
      return { enabled: preferences.desktopControlEnabled, conversations: preferences.desktopControlConversations };
    },
    async writeSettings(next) {
      await writePlatformPreferences(statePath, { ...await readPlatformPreferences(statePath),
        desktopControlEnabled: next.enabled, desktopControlConversations: next.conversations });
    },
    resolveTurn: (_sessionId, input) => resolveDesktopControlTurn(options.chatStore(), input),
    capabilities: async (sessionId) => await options.runtimeClient.getSessionCapabilities?.(sessionId) ?? null,
  });
}
