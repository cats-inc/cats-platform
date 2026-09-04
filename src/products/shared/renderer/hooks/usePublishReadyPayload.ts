import {
  startTransition,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';

export type ReadyPayloadLoadState<TPayload> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

function readGeneratedAt(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const metadata = (payload as { metadata?: unknown }).metadata;
  if (typeof metadata !== 'object' || metadata === null) {
    return null;
  }
  const generatedAt = (metadata as { generatedAt?: unknown }).generatedAt;
  if (typeof generatedAt !== 'string') {
    return null;
  }
  const timestamp = Date.parse(generatedAt);
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * Mutation responses each carry a full app-shell payload, and the direct-lane
 * model picker can have more than one of them in flight at once -- a pick and
 * the label reconciliation that follows it. Responses land in any order, so
 * without this check the earlier request's payload could arrive last and put
 * the previous provider/model back over the one just chosen. The SSE refresher
 * already refuses stale payloads by `metadata.generatedAt`; hold mutation
 * publishes to the same rule. Payloads without a parseable timestamp apply
 * unconditionally, as before.
 */
export function shouldPublishReadyPayload(
  current: unknown,
  next: unknown,
): boolean {
  const currentGeneratedAt = readGeneratedAt(current);
  const nextGeneratedAt = readGeneratedAt(next);
  if (currentGeneratedAt === null || nextGeneratedAt === null) {
    return true;
  }
  return nextGeneratedAt >= currentGeneratedAt;
}

export function usePublishReadyPayload<TPayload>(
  setState: Dispatch<SetStateAction<ReadyPayloadLoadState<TPayload>>>,
) {
  return useCallback(
    (payload: TPayload): void => {
      startTransition(() => setState((current) => (
        current.status === 'ready' && !shouldPublishReadyPayload(current.payload, payload)
          ? current
          : { status: 'ready', payload }
      )));
    },
    [setState],
  );
}
