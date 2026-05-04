import {
  createTranslator,
  messageKeys,
  normalizeMessageLocale,
  type MessageKey,
  type MessageLocale,
} from '../../../shared/i18n/index.js';

export interface TelegramCommandContext {
  args: string;
  chatId: string;
  senderName: string;
  botName: string;
  catName: string | null;
  catId: string | null;
  currentMode: TelegramInteractionMode | null;
  inboundMode: 'polling' | 'webhook' | null;
  locale?: MessageLocale;
  setMode?: (mode: TelegramInteractionMode) => Promise<TelegramInteractionMode>;
}

export interface TelegramCommandResult {
  replyText: string;
  handled: boolean;
}

export type TelegramInteractionMode = 'companion' | 'agent';

export interface TelegramCommand {
  name: string;
  description: string;
  descriptionKey?: MessageKey;
  execute(context: TelegramCommandContext): TelegramCommandResult | Promise<TelegramCommandResult>;
}

export class TelegramCommandRouter {
  private commands = new Map<string, TelegramCommand>();

  register(command: TelegramCommand): void {
    this.commands.set(command.name.toLowerCase(), command);
  }

  registerAll(commands: TelegramCommand[]): void {
    for (const command of commands) {
      this.register(command);
    }
  }

  isCommand(text: string): boolean {
    return text.startsWith('/');
  }

  parseCommand(text: string): { name: string; args: string } | null {
    if (!this.isCommand(text)) return null;
    const trimmed = text.trim();
    const spaceIndex = trimmed.indexOf(' ');
    const rawName = spaceIndex === -1
      ? trimmed.slice(1)
      : trimmed.slice(1, spaceIndex);
    const name = rawName.split('@')[0]!.toLowerCase();
    const args = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();
    return { name, args };
  }

  async dispatch(
    text: string,
    context: Omit<TelegramCommandContext, 'args'>,
  ): Promise<TelegramCommandResult | null> {
    const parsed = this.parseCommand(text);
    if (!parsed) return null;

    const command = this.commands.get(parsed.name);
    if (!command) {
      const t = createTranslator(normalizeMessageLocale(context.locale));
      return {
        replyText: t(messageKeys.telegramCommandUnknownCommand, {
          command: parsed.name,
        }),
        handled: true,
      };
    }

    return command.execute({ ...context, args: parsed.args });
  }

  getCommandList(locale: MessageLocale = 'en'): Array<{ command: string; description: string }> {
    const t = createTranslator(locale);
    return Array.from(this.commands.values()).map((cmd) => ({
      command: cmd.name,
      description: cmd.descriptionKey ? t(cmd.descriptionKey) : cmd.description,
    }));
  }
}

export function createTelegramCommandRouter(): TelegramCommandRouter {
  return new TelegramCommandRouter();
}
