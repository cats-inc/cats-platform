export interface TelegramCommandContext {
  args: string;
  chatId: string;
  senderName: string;
  botName: string;
  catName: string | null;
  catId: string | null;
  currentMode: TelegramInteractionMode | null;
  inboundMode: 'polling' | 'webhook' | null;
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
      return {
        replyText: `Unknown command: /${parsed.name}\nType /help to see available commands.`,
        handled: true,
      };
    }

    return command.execute({ ...context, args: parsed.args });
  }

  getCommandList(): Array<{ command: string; description: string }> {
    return Array.from(this.commands.values()).map((cmd) => ({
      command: cmd.name,
      description: cmd.description,
    }));
  }
}

export function createTelegramCommandRouter(): TelegramCommandRouter {
  return new TelegramCommandRouter();
}
