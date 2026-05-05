export type ProductIntentCommandName = 'chat' | 'work' | 'code';
export type ProductIntentPosture = ProductIntentCommandName;
export type ProductIntentTargetProduct = ProductIntentCommandName;

export const PRODUCT_INTENT_COMMAND_NAMES = ['chat', 'work', 'code'] as const;

const PRODUCT_INTENT_COMMAND_NAME_SET: ReadonlySet<string> =
  new Set<string>(PRODUCT_INTENT_COMMAND_NAMES);

export interface ParsedProductIntentCommand {
  kind: 'product_intent_command';
  command: ProductIntentCommandName;
  posture: ProductIntentPosture;
  targetProduct: ProductIntentTargetProduct;
  rawCommandToken: string;
  botSuffix: string | null;
  argumentText: string;
  originalText: string;
  normalizedText: string;
}

export interface ParsedNonProductSlashCommand {
  kind: 'non_product_slash_command';
  commandName: string;
  rawCommandToken: string;
  botSuffix: string | null;
  argumentText: string;
  originalText: string;
  normalizedText: string;
}

export type ProductIntentCommandParseResult =
  | ParsedProductIntentCommand
  | ParsedNonProductSlashCommand;

export function isProductIntentCommandName(
  commandName: string,
): commandName is ProductIntentCommandName {
  return PRODUCT_INTENT_COMMAND_NAME_SET.has(commandName);
}

function splitCommandToken(rawCommandToken: string): {
  commandName: string;
  botSuffix: string | null;
} {
  const suffixIndex = rawCommandToken.indexOf('@');
  const rawCommandName = suffixIndex === -1
    ? rawCommandToken
    : rawCommandToken.slice(0, suffixIndex);
  const rawBotSuffix = suffixIndex === -1
    ? null
    : rawCommandToken.slice(suffixIndex + 1).trim();

  return {
    commandName: rawCommandName.toLowerCase(),
    botSuffix: rawBotSuffix ? rawBotSuffix : null,
  };
}

export function parseProductIntentCommand(
  rawText: string | null | undefined,
): ProductIntentCommandParseResult | null {
  if (typeof rawText !== 'string') {
    return null;
  }

  const normalizedText = rawText.trim();
  if (!normalizedText.startsWith('/')) {
    return null;
  }

  const commandText = normalizedText.slice(1);
  const whitespaceMatch = /[\s]/u.exec(commandText);
  const tokenEndIndex = whitespaceMatch?.index ?? commandText.length;
  const rawCommandToken = commandText.slice(0, tokenEndIndex);
  const argumentText = commandText.slice(tokenEndIndex).trim();
  const { commandName, botSuffix } = splitCommandToken(rawCommandToken);
  const base = {
    rawCommandToken,
    botSuffix,
    argumentText,
    originalText: rawText,
    normalizedText,
  };

  if (!isProductIntentCommandName(commandName)) {
    return {
      kind: 'non_product_slash_command',
      commandName,
      ...base,
    };
  }

  return {
    kind: 'product_intent_command',
    command: commandName,
    posture: commandName,
    targetProduct: commandName,
    ...base,
  };
}
