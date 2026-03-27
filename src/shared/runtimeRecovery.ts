export interface RuntimeDispatchRecoveryPolicy {
  staleSessionRetryLimit: number;
}

export const DEFAULT_RUNTIME_STALE_SESSION_RETRY_LIMIT = 1;

export function normalizeRuntimeDispatchRecoveryPolicy(
  input?: Partial<RuntimeDispatchRecoveryPolicy> | null,
): RuntimeDispatchRecoveryPolicy {
  const rawLimit = input?.staleSessionRetryLimit;
  const staleSessionRetryLimit =
    typeof rawLimit === 'number' && Number.isFinite(rawLimit)
      ? Math.max(0, Math.trunc(rawLimit))
      : DEFAULT_RUNTIME_STALE_SESSION_RETRY_LIMIT;

  return {
    staleSessionRetryLimit,
  };
}
