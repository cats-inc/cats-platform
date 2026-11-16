import { useCallback, useEffect, useRef, useState } from 'react';

import { MobileApiError, type MobileApiClient } from '../../api/client';
import { loadMobileAuthenticatedSession } from '../../api/authSession';
import { loadConnectionConfig } from '../../api/persistence';
import {
  getMobileApiCopy,
  mobileProviderPaths,
  resolveDefaultMobileLocale,
  type MobileCatRequest,
  type MobileProviderModelCatalog,
  type MobileProviderModelsResponse,
  type MobileProviderRegistry,
} from '../../../../src/mobile/index.js';

async function withClient<T>(use: (client: MobileApiClient) => Promise<T>): Promise<T> {
  const config = await loadConnectionConfig();
  const session = await loadMobileAuthenticatedSession(config);
  if (session.kind !== 'authenticated') {
    throw new MobileApiError(getMobileApiCopy(resolveDefaultMobileLocale()).unknownError, 401, null);
  }
  return use(session.client);
}

export interface MobileCatActions {
  /** Sends one Cat change and answers with the server's JSON. Throws `MobileApiError`. */
  send: <T>(request: MobileCatRequest) => Promise<T>;
  readProviders: () => Promise<MobileProviderRegistry>;
  readModels: (provider: string, instance: string | null) => Promise<MobileProviderModelCatalog>;
  pending: boolean;
}

/**
 * Cat changes from the phone (`/api/cats`) and the provider picker's reads
 * (`/api/providers`), with the bearer session. The caller refreshes the
 * app shell after a change.
 */
export function useMobileCatActions(): MobileCatActions {
  const [pending, setPending] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const send = useCallback(async <T,>(request: MobileCatRequest): Promise<T> => {
    setPending(true);
    try {
      return await withClient((client) => (
        request.method === 'POST'
          ? client.post<T>(request.path, request.body ?? {})
          : request.method === 'PATCH'
            ? client.patch<T>(request.path, request.body ?? {})
            : client.del<T>(request.path)
      ));
    } finally {
      if (mountedRef.current) setPending(false);
    }
  }, []);

  const readProviders = useCallback(
    () => withClient((client) => client.get<MobileProviderRegistry>(mobileProviderPaths.registry)),
    [],
  );
  const readModels = useCallback(
    (provider: string, instance: string | null) => withClient(async (client) => (
      (await client.get<MobileProviderModelsResponse>(mobileProviderPaths.models(provider, instance))).catalog
    )),
    [],
  );

  return { send, readProviders, readModels, pending };
}
