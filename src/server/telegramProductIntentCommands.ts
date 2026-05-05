import { parseProductIntentCommand } from '../products/chat/shared/productIntentCommands.js';

export function shouldBridgeTelegramProductIntentCommand(text: string): boolean {
  const parsed = parseProductIntentCommand(text);
  return parsed?.kind === 'product_intent_command';
}
