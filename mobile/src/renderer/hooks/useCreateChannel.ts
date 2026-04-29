import { useCallback, useState } from 'react';

import { createMobileApiClient, MobileApiError } from '../../api/client';
import { loadConnectionConfig } from '../../api/persistence';
import type {
  MobileCreateChannelInput,
  MobileCreateChannelResponse,
} from '../../../../src/mobile/index.js';

/**
 * Mutation hook for `POST /api/channels`. Used by the +New / +Team /
 * +Peer / +Group / +Parallel sidebar buttons so taps actually create
 * a real channel on the desktop instead of routing into a placeholder
 * id that lands on `channelNotFound`.
 */
export type CreateChannelState =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'error'; error: MobileApiError };

export interface CreateChannelHook {
  state: CreateChannelState;
  /**
   * Creates the channel and resolves with the new id, or rejects with
   * the underlying `MobileApiError`. On rejection the hook also moves
   * to `state.kind === 'error'` so the screen can render the message
   * inline if it prefers not to handle the rejection itself.
   */
  create: (input: MobileCreateChannelInput) => Promise<string>;
  /** Resets `error` back to `idle`. */
  reset: () => void;
}

const CREATE_CHANNEL_PATH = '/api/channels';

export function useCreateChannel(): CreateChannelHook {
  const [state, setState] = useState<CreateChannelState>({ kind: 'idle' });

  const create = useCallback(
    async (input: MobileCreateChannelInput): Promise<string> => {
      setState({ kind: 'creating' });
      try {
        const config = await loadConnectionConfig();
        if (!config.baseUrl) {
          const error = new MobileApiError(
            'Set a desktop base URL in Settings before creating a channel.',
            null,
            null,
          );
          setState({ kind: 'error', error });
          throw error;
        }
        const client = createMobileApiClient(config);
        const response = await client.post<MobileCreateChannelResponse>(
          CREATE_CHANNEL_PATH,
          input,
        );
        setState({ kind: 'idle' });
        return response.channel.id;
      } catch (error) {
        const apiError =
          error instanceof MobileApiError
            ? error
            : new MobileApiError(
                error instanceof Error ? error.message : 'Create channel failed.',
                null,
                error,
              );
        setState({ kind: 'error', error: apiError });
        throw apiError;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState({ kind: 'idle' });
  }, []);

  return { state, create, reset };
}
