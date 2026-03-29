import type { TelegramDeliveryClient } from '../../platform/transports/telegram/delivery.js';
import { createTelegramBotApiDeliveryClient } from '../../platform/transports/telegram/delivery.js';
import { createTelegramBotCommandCatalog } from '../../platform/transports/telegram/commands/index.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import { readTelegramActiveBindings } from '../../server/routes/telegram.js';

export interface TelegramCommandSurfaceSync {
  reconcile(options?: {
    staleBotTokens?: Array<string | null | undefined>;
  }): Promise<void>;
}

interface TelegramCommandSurfaceSyncOptions {
  chatStore: ChatStore;
  defaultBotToken?: string | null;
  resolveClient?: (
    botToken: string,
  ) => Pick<TelegramDeliveryClient, 'setMyCommands' | 'deleteMyCommands' | 'setChatMenuButton'>;
}

const DEFAULT_COMMAND_SCOPE = { type: 'default' } as const;
const DEFAULT_MENU_BUTTON = { type: 'commands' } as const;

function trimBotToken(botToken: string | null | undefined): string | null {
  if (typeof botToken !== 'string') {
    return null;
  }
  const trimmed = botToken.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveUniqueBotTokens(
  tokens: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const token of tokens) {
    const trimmed = trimBotToken(token);
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

export function createTelegramCommandSurfaceSync(
  options: TelegramCommandSurfaceSyncOptions,
): TelegramCommandSurfaceSync {
  const defaultBotToken = trimBotToken(options.defaultBotToken);
  const clientCache = new Map<
    string,
    Pick<TelegramDeliveryClient, 'setMyCommands' | 'deleteMyCommands' | 'setChatMenuButton'>
  >();
  const resolveClient = options.resolveClient ?? ((botToken: string) => {
    const existing = clientCache.get(botToken);
    if (existing) {
      return existing;
    }
    const client = createTelegramBotApiDeliveryClient({ botToken });
    clientCache.set(botToken, client);
    return client;
  });

  return {
    async reconcile(reconcileOptions = {}): Promise<void> {
      const [bindings, core] = await Promise.all([
        readTelegramActiveBindings(options.chatStore),
        options.chatStore.readCore(),
      ]);
      const botTokens = resolveUniqueBotTokens(
        bindings.map((binding) => trimBotToken(binding.botToken) ?? defaultBotToken),
      );
      const knownBotTokens = resolveUniqueBotTokens([
        ...core.botBindings
          .filter((binding) => binding.platform === 'telegram')
          .map((binding) => binding.botToken),
        defaultBotToken,
        ...(reconcileOptions.staleBotTokens ?? []),
      ]);
      const activeBotTokenSet = new Set(botTokens);

      const commands = createTelegramBotCommandCatalog();
      for (const botToken of botTokens) {
        const client = resolveClient(botToken);
        await client.setMyCommands({
          commands,
          scope: DEFAULT_COMMAND_SCOPE,
        });
        await client.setChatMenuButton({
          menuButton: DEFAULT_MENU_BUTTON,
        });
      }

      for (const botToken of knownBotTokens) {
        if (activeBotTokenSet.has(botToken)) {
          continue;
        }
        const client = resolveClient(botToken);
        await client.deleteMyCommands({
          scope: DEFAULT_COMMAND_SCOPE,
        });
      }
    },
  };
}
