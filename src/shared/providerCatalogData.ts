export const PRODUCT_PROVIDER_ORDER = [
  'codex',
  'claude',
  'antigravity',
  'grok',
  'muse',
  'cursor',
  'copilot',
  'opencode',
  'kilo',
  'cline',
  'auggie',
  'pi',
  'kiro',
  'junie',
  'devin',
  'goose',
  'ollama',
  'openclaw',
] as const;

export function compareProductProviderOrder(left: string, right: string): number {
  const order: readonly string[] = PRODUCT_PROVIDER_ORDER;
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);
  return (leftIndex < 0 ? order.length : leftIndex)
    - (rightIndex < 0 ? order.length : rightIndex);
}
