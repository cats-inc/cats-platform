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

export function usePublishReadyPayload<TPayload>(
  setState: Dispatch<SetStateAction<ReadyPayloadLoadState<TPayload>>>,
) {
  return useCallback(
    (payload: TPayload): void => {
      startTransition(() => setState({ status: 'ready', payload }));
    },
    [setState],
  );
}
