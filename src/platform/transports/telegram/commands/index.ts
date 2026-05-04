import type {
  TelegramCommand,
  TelegramCommandContext,
  TelegramCommandResult,
  TelegramInteractionMode,
} from '../commandRouter.js';
import type { TelegramBotApiCommand } from '../delivery.js';
import {
  createTranslator,
  messageKeys,
  normalizeMessageLocale,
  type MessageKey,
  type MessageLocale,
} from '../../../../shared/i18n/index.js';

function ok(text: string): TelegramCommandResult {
  return { replyText: text, handled: true };
}

function readTelegramTranslator(context: TelegramCommandContext) {
  return createTranslator(normalizeMessageLocale(context.locale));
}

function commandDescription(key: MessageKey, locale: MessageLocale = 'en'): string {
  return createTranslator(locale)(key);
}

function formatModeLabel(
  mode: TelegramInteractionMode | null,
  t = createTranslator('en'),
): string {
  return mode === 'companion'
    ? t(messageKeys.telegramCommandModeCompanion)
    : t(messageKeys.telegramCommandModeAgent);
}

function buildHelpText(t = createTranslator('en')): string {
  return t(messageKeys.telegramCommandHelpText);
}

const startCommand: TelegramCommand = {
  name: 'start',
  description: commandDescription(messageKeys.telegramCommandStartDescription),
  descriptionKey: messageKeys.telegramCommandStartDescription,
  execute(context: TelegramCommandContext): TelegramCommandResult {
    const t = readTelegramTranslator(context);
    const greeting = context.catName
      ? t(messageKeys.telegramCommandStartGreetingBound, {
        catName: context.catName,
        botName: context.botName,
        mode: formatModeLabel(context.currentMode, t),
      })
      : t(messageKeys.telegramCommandStartGreetingUnbound, {
        botName: context.botName,
      });
    return ok(greeting);
  },
};

const helpCommand: TelegramCommand = {
  name: 'help',
  description: commandDescription(messageKeys.telegramCommandHelpDescription),
  descriptionKey: messageKeys.telegramCommandHelpDescription,
  execute(context: TelegramCommandContext): TelegramCommandResult {
    return ok(buildHelpText(readTelegramTranslator(context)));
  },
};

const commandsCommand: TelegramCommand = {
  name: 'commands',
  description: commandDescription(messageKeys.telegramCommandCommandsDescription),
  descriptionKey: messageKeys.telegramCommandCommandsDescription,
  execute(context: TelegramCommandContext): TelegramCommandResult {
    return ok(buildHelpText(readTelegramTranslator(context)));
  },
};

const statusCommand: TelegramCommand = {
  name: 'status',
  description: commandDescription(messageKeys.telegramCommandStatusDescription),
  descriptionKey: messageKeys.telegramCommandStatusDescription,
  execute(context: TelegramCommandContext): TelegramCommandResult {
    const t = readTelegramTranslator(context);
    const lines = [
      t(messageKeys.telegramCommandStatusBotLine, { botName: context.botName }),
    ];
    if (context.catName) {
      lines.push(t(messageKeys.telegramCommandStatusLinkedCatLine, {
        catName: context.catName,
      }));
    }
    if (context.currentMode) {
      lines.push(t(messageKeys.telegramCommandStatusModeLine, {
        mode: formatModeLabel(context.currentMode, t),
      }));
    }
    if (context.inboundMode) {
      lines.push(t(messageKeys.telegramCommandStatusInboundLine, {
        inboundMode: context.inboundMode,
      }));
    }
    lines.push(t(messageKeys.telegramCommandStatusChatLine, {
      chatId: context.chatId,
    }));
    lines.push(t(messageKeys.telegramCommandStatusConnectedLine));
    return ok(lines.join('\n'));
  },
};

const openCommand: TelegramCommand = {
  name: 'open',
  description: commandDescription(messageKeys.telegramCommandOpenDescription),
  descriptionKey: messageKeys.telegramCommandOpenDescription,
  execute(context: TelegramCommandContext): TelegramCommandResult {
    const t = readTelegramTranslator(context);
    const name = context.catName ?? context.botName;
    return ok(t(messageKeys.telegramCommandOpenReply, { name }));
  },
};

const modeCommand: TelegramCommand = {
  name: 'mode',
  description: commandDescription(messageKeys.telegramCommandModeDescription),
  descriptionKey: messageKeys.telegramCommandModeDescription,
  async execute(context: TelegramCommandContext): Promise<TelegramCommandResult> {
    const t = readTelegramTranslator(context);
    if (!context.catId || !context.currentMode) {
      return ok(t(messageKeys.telegramCommandModeNotConfigurable));
    }

    const requestedMode = context.args.trim().toLowerCase();
    if (!requestedMode) {
      return ok(t(messageKeys.telegramCommandModeCurrent, {
        mode: formatModeLabel(context.currentMode, t),
      }));
    }

    if (requestedMode !== 'companion' && requestedMode !== 'agent') {
      return ok(t(messageKeys.telegramCommandModeUnknown, {
        mode: context.args.trim(),
      }));
    }

    if (!context.setMode) {
      return ok(t(messageKeys.telegramCommandModeSwitchUnavailable));
    }

    const nextMode = await context.setMode(requestedMode);
    return ok(t(messageKeys.telegramCommandModeSwitched, {
      name: context.catName ?? context.botName,
      mode: formatModeLabel(nextMode, t),
    }));
  },
};

export function createDefaultCommands(): TelegramCommand[] {
  return [
    startCommand,
    helpCommand,
    commandsCommand,
    statusCommand,
    openCommand,
    modeCommand,
  ];
}

export function createTelegramBotCommandCatalog(
  locale: MessageLocale = 'en',
): TelegramBotApiCommand[] {
  const t = createTranslator(locale);
  return createDefaultCommands().map((command) => ({
    command: command.name,
    description: command.descriptionKey ? t(command.descriptionKey) : command.description,
  }));
}

export function createTelegramBotCommandCatalogVariants(): Array<{
  languageCode: string | null;
  commands: TelegramBotApiCommand[];
}> {
  return [
    {
      languageCode: null,
      commands: createTelegramBotCommandCatalog('en'),
    },
    {
      languageCode: 'zh',
      commands: createTelegramBotCommandCatalog('zh-TW'),
    },
  ];
}
