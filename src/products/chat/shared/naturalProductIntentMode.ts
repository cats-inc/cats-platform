export const CHAT_NATURAL_PRODUCT_INTENT_MODES = [
  'off',
  'cat_tool',
  'heuristic_prefilter',
] as const;

export type ChatNaturalProductIntentMode =
  (typeof CHAT_NATURAL_PRODUCT_INTENT_MODES)[number];

export function isChatNaturalProductIntentMode(
  value: unknown,
): value is ChatNaturalProductIntentMode {
  return typeof value === 'string'
    && CHAT_NATURAL_PRODUCT_INTENT_MODES.includes(value as ChatNaturalProductIntentMode);
}

export function parseChatNaturalProductIntentMode(
  value: string | undefined,
): ChatNaturalProductIntentMode {
  const normalized = value?.trim();
  if (!normalized) {
    return 'off';
  }
  if (isChatNaturalProductIntentMode(normalized)) {
    return normalized;
  }
  throw new Error(
    `Invalid CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE value: ${value}`,
  );
}

export function resolveEffectiveChatNaturalProductIntentMode(input: {
  deploymentMode: ChatNaturalProductIntentMode | undefined;
  ownerEnabled: boolean | undefined;
}): ChatNaturalProductIntentMode {
  const deploymentMode = input.deploymentMode ?? 'off';
  if (deploymentMode === 'off' || input.ownerEnabled !== true) {
    return 'off';
  }

  return deploymentMode;
}
