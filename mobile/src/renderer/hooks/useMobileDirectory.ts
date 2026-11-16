import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MobileApiError } from '../../api/client';
import { loadMobileAuthenticatedSession } from '../../api/authSession';
import { loadConnectionConfig } from '../../api/persistence';
import {
  getMobileApiCopy,
  resolveDefaultMobileLocale,
  type MobileDirectoryResponse,
  type MobileDirectoryView,
} from '../../../../src/mobile/index.js';

export type MobileDirectoryState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; error: MobileApiError }
  | { kind: 'data'; directory: MobileDirectoryView };

export interface MobileDirectoryHook {
  state: MobileDirectoryState;
  refetch: () => void;
}

const DIRECTORY_PATH = '/api/platform/directory';

/**
 * The Clowders and Catteries from `/api/platform/directory` (SPEC-103).
 * Directory changes publish no chat event, so this reads again whenever
 * its screen comes back into focus, keeping the last answer on screen
 * meanwhile, like `useMobileAppShell`.
 */
export function useMobileDirectory(): MobileDirectoryHook {
  const [state, setState] = useState<MobileDirectoryState>({ kind: 'loading' });
  const [version, setVersion] = useState(0);
  const initialFocusRef = useRef(true);

  useEffect(() => {
    let active = true;
    setState((current) => (current.kind === 'data' ? current : { kind: 'loading' }));
    (async () => {
      try {
        const config = await loadConnectionConfig();
        if (!active) return;
        if (!config.baseUrl) {
          setState({ kind: 'unconfigured' });
          return;
        }
        const session = await loadMobileAuthenticatedSession(config);
        if (!active) return;
        if (session.kind !== 'authenticated') {
          setState({ kind: session.kind });
          return;
        }
        const response = await session.client.get<MobileDirectoryResponse>(DIRECTORY_PATH);
        if (active) setState({ kind: 'data', directory: response.directory });
      } catch (error) {
        if (!active) return;
        setState({
          kind: 'error',
          error: error instanceof MobileApiError
            ? error
            : new MobileApiError(
                error instanceof Error ? error.message : getMobileApiCopy(resolveDefaultMobileLocale()).unknownError,
                null,
                error,
              ),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [version]);

  useFocusEffect(
    useCallback(() => {
      if (initialFocusRef.current) {
        initialFocusRef.current = false;
        return;
      }
      setVersion((current) => current + 1);
    }, []),
  );

  const refetch = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  return { state, refetch };
}
