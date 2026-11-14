import type { ChatBotBindingSummary } from '../api/workspaceContracts.js';

/**
 * A direct message's send button is Telegram's paper plane only when the cat reaches Telegram: it has an
 * active Telegram binding with its bot token stored (a Boss Cat's binding names its cat too). Bindings route
 * into Chat's direct lanes only, so Work and Code keep the up arrow, as does a cat without one. Cats Bot draws
 * its direct message's button by the same rule (cats-bot SPEC-003 FR-15); Desktop has no owner-chat check.
 */
export function catReachesTelegram(
  bindings: readonly ChatBotBindingSummary[] | null | undefined,
  catId: string | null | undefined,
  surface: 'chat' | 'code' | 'work' = 'chat',
): boolean {
  if (!catId || surface !== 'chat') return false;
  return (bindings ?? []).some((binding) => binding.platform === 'telegram' && binding.catId === catId
    && binding.status === 'active' && binding.hasBotToken);
}
