import type {
  TelegramCommand,
  TelegramCommandContext,
  TelegramCommandResult,
  TelegramInteractionMode,
} from '../commandRouter.js';
import type { TelegramBotApiCommand } from '../delivery.js';

function ok(text: string): TelegramCommandResult {
  return { replyText: text, handled: true };
}

function formatModeLabel(mode: TelegramInteractionMode | null): string {
  return mode === 'companion'
    ? 'Companion'
    : 'Agent';
}

function buildHelpText(): string {
  return [
    'Available commands:',
    '/start - Show the bound Cat and how this bot works',
    '/help - Show this help message',
    '/commands - List all commands',
    '/status - Show bot, binding, and mode status',
    '/open - Open or continue the bound Cat lane',
    '/mode - Show the current mode',
    '/mode companion - Switch to companion behavior',
    '/mode agent - Switch to agent behavior',
  ].join('\n');
}

const startCommand: TelegramCommand = {
  name: 'start',
  description: 'Start a conversation',
  execute(context: TelegramCommandContext): TelegramCommandResult {
    const greeting = context.catName
      ? [
        `Hello! I'm ${context.catName} (via ${context.botName}).`,
        `Current mode: ${formatModeLabel(context.currentMode)}.`,
        'Send a normal message to chat, or /mode to switch behavior.',
      ].join(' ')
      : `Hello! I'm ${context.botName}. How can I help you?`;
    return ok(greeting);
  },
};

const helpCommand: TelegramCommand = {
  name: 'help',
  description: 'Show available commands',
  execute(): TelegramCommandResult {
    return ok(buildHelpText());
  },
};

const commandsCommand: TelegramCommand = {
  name: 'commands',
  description: 'List all commands',
  execute(): TelegramCommandResult {
    return ok(buildHelpText());
  },
};

const statusCommand: TelegramCommand = {
  name: 'status',
  description: 'Show connection status',
  execute(context: TelegramCommandContext): TelegramCommandResult {
    const lines = [
      `Bot: ${context.botName}`,
    ];
    if (context.catName) {
      lines.push(`Linked Cat: ${context.catName}`);
    }
    if (context.currentMode) {
      lines.push(`Mode: ${formatModeLabel(context.currentMode)}`);
    }
    if (context.inboundMode) {
      lines.push(`Inbound: ${context.inboundMode}`);
    }
    lines.push(`Chat: ${context.chatId}`);
    lines.push('Status: Connected');
    return ok(lines.join('\n'));
  },
};

const openCommand: TelegramCommand = {
  name: 'open',
  description: 'Open a new chat room',
  execute(context: TelegramCommandContext): TelegramCommandResult {
    const name = context.catName ?? context.botName;
    return ok(
      `Open the private lane with ${name} in Cats, or just send a normal `
      + 'message here to continue chatting.',
    );
  },
};

const modeCommand: TelegramCommand = {
  name: 'mode',
  description: 'Show or switch companion and agent mode',
  async execute(context: TelegramCommandContext): Promise<TelegramCommandResult> {
    if (!context.catId || !context.currentMode) {
      return ok('This bot is not currently bound to a configurable Cat.');
    }

    const requestedMode = context.args.trim().toLowerCase();
    if (!requestedMode) {
      return ok(
        `Current mode: ${formatModeLabel(context.currentMode)}\n`
        + 'Use /mode companion or /mode agent to switch.',
      );
    }

    if (requestedMode !== 'companion' && requestedMode !== 'agent') {
      return ok(
        `Unknown mode: ${context.args.trim()}\n`
        + 'Use /mode companion or /mode agent.',
      );
    }

    if (!context.setMode) {
      return ok('Mode switching is unavailable for this bot binding right now.');
    }

    const nextMode = await context.setMode(requestedMode);
    return ok(
      `Switched ${context.catName ?? context.botName} `
      + `to ${formatModeLabel(nextMode)} mode.\n`
      + 'Future normal messages in this chat will use that mode.',
    );
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

export function createTelegramBotCommandCatalog(): TelegramBotApiCommand[] {
  return createDefaultCommands().map((command) => ({
    command: command.name,
    description: command.description,
  }));
}
