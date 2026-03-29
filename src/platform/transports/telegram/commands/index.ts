import type { TelegramCommand, TelegramCommandContext, TelegramCommandResult } from '../commandRouter.js';

function ok(text: string): TelegramCommandResult {
  return { replyText: text, handled: true };
}

const startCommand: TelegramCommand = {
  name: 'start',
  description: 'Start a conversation',
  execute(context: TelegramCommandContext): TelegramCommandResult {
    const greeting = context.catName
      ? `Hello! I'm ${context.catName} (via ${context.botName}). How can I help you?`
      : `Hello! I'm ${context.botName}. How can I help you?`;
    return ok(greeting);
  },
};

const helpCommand: TelegramCommand = {
  name: 'help',
  description: 'Show available commands',
  execute(): TelegramCommandResult {
    return ok(
      'Available commands:\n'
      + '/start - Start a conversation\n'
      + '/help - Show this help message\n'
      + '/commands - List all commands\n'
      + '/status - Show connection status\n'
      + '/open - Open a new chat room',
    );
  },
};

const commandsCommand: TelegramCommand = {
  name: 'commands',
  description: 'List all commands',
  execute(): TelegramCommandResult {
    return ok(
      'Available commands:\n'
      + '/start - Start a conversation\n'
      + '/help - Show this help message\n'
      + '/commands - List all commands\n'
      + '/status - Show connection status\n'
      + '/open - Open a new chat room',
    );
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
    return ok(`Starting a new conversation with ${name}. Send your first message to begin.`);
  },
};

export function createDefaultCommands(): TelegramCommand[] {
  return [
    startCommand,
    helpCommand,
    commandsCommand,
    statusCommand,
    openCommand,
  ];
}
