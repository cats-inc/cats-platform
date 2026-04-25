import type { BudgetEnvelope } from './contracts.js';

export interface DeriveChildBudgetEnvelopeInput {
  parent: BudgetEnvelope;
  requested?: BudgetEnvelope;
  defaults?: BudgetEnvelope;
}

export function deriveChildBudgetEnvelope(
  input: DeriveChildBudgetEnvelopeInput,
): BudgetEnvelope {
  return {
    ...numberBudget('maxCostUsd', input),
    ...numberBudget('maxTokens', input),
    ...numberBudget('maxDurationMs', input),
    hardStop: input.parent.hardStop === true ||
      input.requested?.hardStop === true ||
      input.defaults?.hardStop === true,
  };
}

function numberBudget(
  key: 'maxCostUsd' | 'maxTokens' | 'maxDurationMs',
  input: DeriveChildBudgetEnvelopeInput,
): Pick<BudgetEnvelope, typeof key> {
  const values = [
    input.parent[key],
    input.requested?.[key],
    input.defaults?.[key],
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return values.length > 0
    ? { [key]: Math.min(...values) } as Pick<BudgetEnvelope, typeof key>
    : {};
}
