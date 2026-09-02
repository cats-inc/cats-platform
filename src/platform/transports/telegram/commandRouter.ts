import {
  createTranslator,
  messageKeys,
  normalizeMessageLocale,
  type MessageKey,
  type MessageLocale,
} from '../../../shared/i18n/index.js';
import type { TelegramPollingHealth } from './contracts.js';

/**
 * What `/status` needs to answer truthfully (SPEC-114 FR-5).
 *
 * Without this the command reported "Status: Connected" and nothing else, which
 * reads as "everything is fine" even when the host cannot accept delegated work
 * at all. The connection line is still true — the message did arrive — so it
 * stays; what was missing is everything after it.
 */
export interface TelegramCommandDelegationStatus {
  /** Ingress health for this binding. `null` when it has no polling consumer. */
  bindingHealth: TelegramPollingHealth | null;
  /** Whether work delegation is switched on for this host at all. */
  enabled: boolean;
  canAcceptWork: boolean;
  /** i18n keys naming each missing prerequisite, in evaluation order. */
  blockerKeys: string[];
}

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
  /** Absent means the host could not resolve it, which `/status` says plainly. */
  delegation?: TelegramCommandDelegationStatus | null;
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
