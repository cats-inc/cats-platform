export interface CollaborationPreparationBudget {
  maxDurationMs: number;
  maxTokens: number;
}

const fields = {
  maxDurationMs: { key: 'CATS_CHAT_COLLABORATION_PREPARATION_MAX_DURATION_MS', default: 30_000, maximum: 300_000 },
  maxTokens: { key: 'CATS_CHAT_COLLABORATION_PREPARATION_MAX_TOKENS', default: 8000, maximum: 80_000 },
} as const;

/** Host policy only. Model proposals and incoming message bodies are not configuration. */
export function resolveCollaborationPreparationBudget(
  input: Partial<CollaborationPreparationBudget> = {},
): Readonly<CollaborationPreparationBudget> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !Object.hasOwn(fields, key))) {
    throw new Error('Invalid collaboration preparation budget configuration');
  }
  const result = {} as CollaborationPreparationBudget;
  for (const name of ['maxDurationMs', 'maxTokens'] as const) {
    const field = fields[name];
    const configured = input[name];
    const value = configured === undefined ? field.default : configured;
    if (!Number.isInteger(value) || value <= 0 || value > field.maximum) {
      throw new Error(`Invalid ${field.key}: expected an integer from 1 to ${field.maximum}`);
    }
    result[name] = value;
  }
  return Object.freeze(result);
}

export function readCollaborationPreparationBudget(
  env: Record<string, string | undefined>,
): Readonly<CollaborationPreparationBudget> {
  const input: Partial<CollaborationPreparationBudget> = {};
  for (const name of ['maxDurationMs', 'maxTokens'] as const) {
    const text = env[fields[name].key]?.trim();
    if (text) input[name] = /^\d+$/u.test(text) ? Number(text) : NaN;
  }
  return resolveCollaborationPreparationBudget(input);
}
