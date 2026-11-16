import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MobileApiError } from '../../api/client';
import { loadMobileAuthenticatedSession } from '../../api/authSession';
import { loadConnectionConfig } from '../../api/persistence';
import {
  getMobileApiCopy,
  resolveDefaultMobileLocale,
  type MobileDirectoryRequest,
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
  /**
   * Sends one Directory change and shows the Directory it answers with.
   * Throws `MobileApiError`, whose `body` carries the server's error code.
   */
  run: (request: MobileDirectoryRequest) => Promise<MobileDirectoryView>;
  /** A change is on its way; controls should not start another. */
  pending: boolean;
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
  const [pending, setPending] = useState(false);
  const initialFocusRef = useRef(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const run = useCallback(async (request: MobileDirectoryRequest) => {
    setPending(true);
    try {
      const config = await loadConnectionConfig();
      const session = await loadMobileAuthenticatedSession(config);
      if (session.kind !== 'authenticated') {
        if (mountedRef.current) setState({ kind: session.kind });
        throw new MobileApiError(getMobileApiCopy(resolveDefaultMobileLocale()).unknownError, 401, null);
      }
      const { client } = session;
      const response = request.method === 'POST'
        ? await client.post<MobileDirectoryResponse>(request.path, request.body ?? {})
        : request.method === 'PATCH'
          ? await client.patch<MobileDirectoryResponse>(request.path, request.body ?? {})
          : await client.del<MobileDirectoryResponse>(request.path);
      if (mountedRef.current) setState({ kind: 'data', directory: response.directory });
      return response.directory;
    } catch (error) {
      throw error instanceof MobileApiError
        ? error
        : new MobileApiError(error instanceof Error ? error.message : String(error), null, null);
    } finally {
      if (mountedRef.current) setPending(false);
    }
  }, []);

  return { state, refetch, run, pending };
}
