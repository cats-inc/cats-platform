import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CatteryMembershipStatus,
  CatteryRole,
  ClowderRole,
  MembershipStatus,
  PlatformDirectoryView,
} from '../../../shared/platform-contract.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';

export class DirectoryRequestError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'DirectoryRequestError';
  }
}

interface DirectoryResponse {
  directory?: PlatformDirectoryView;
  error?: { code?: string; message?: string };
}

async function readPayload(response: Response): Promise<DirectoryResponse | null> {
  try {
    return await response.json() as DirectoryResponse;
  } catch {
    return null;
  }
}

async function request(method: string, path: string, body?: unknown): Promise<PlatformDirectoryView> {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await readPayload(response);
  if (!response.ok || !payload?.directory) {
    throw new DirectoryRequestError(
      payload?.error?.code ?? 'request_failed',
      payload?.error?.message ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  return payload.directory;
}

const clowderPath = (clowderId: string) => `/api/platform/clowders/${encodeURIComponent(clowderId)}`;
const catteryPath = (catteryId: string) => `/api/platform/catteries/${encodeURIComponent(catteryId)}`;

export interface ClowderMemberPatch {
  role?: ClowderRole;
  status?: MembershipStatus;
  expiresAt?: string | null;
}

export interface CatteryMemberPatch {
  role?: CatteryRole;
  status?: CatteryMembershipStatus;
}

/** SPEC-103 Directory API; every call answers with the whole directory. */
export const directoryApi = {
  read: () => request('GET', '/api/platform/directory'),
  createClowder: (input: {
    name: string;
    description?: string | null;
    parentCatteryId?: string | null;
    members?: Array<{ catId: string } & ClowderMemberPatch>;
  }) => request('POST', '/api/platform/clowders', input),
  updateClowder: (clowderId: string, patch: { name?: string; description?: string | null }) =>
    request('PATCH', clowderPath(clowderId), patch),
  deleteClowder: (clowderId: string) => request('DELETE', clowderPath(clowderId)),
  addClowderMember: (clowderId: string, member: { catId: string } & ClowderMemberPatch) =>
    request('POST', `${clowderPath(clowderId)}/members`, member),
  updateClowderMember: (clowderId: string, catId: string, patch: ClowderMemberPatch) =>
    request('PATCH', `${clowderPath(clowderId)}/members/${encodeURIComponent(catId)}`, patch),
  removeClowderMember: (clowderId: string, catId: string) =>
    request('DELETE', `${clowderPath(clowderId)}/members/${encodeURIComponent(catId)}`),
  moveClowderMember: (clowderId: string, catId: string, toClowderId: string) =>
    request('POST', `${clowderPath(clowderId)}/members/${encodeURIComponent(catId)}/move`, { toClowderId }),
  createCattery: (input: {
    name: string;
    description?: string | null;
    domain?: string | null;
    members?: Array<{ catId: string } & CatteryMemberPatch>;
  }) => request('POST', '/api/platform/catteries', input),
  updateCattery: (catteryId: string, patch: { name?: string; description?: string | null; domain?: string | null }) =>
    request('PATCH', catteryPath(catteryId), patch),
  deleteCattery: (catteryId: string) => request('DELETE', catteryPath(catteryId)),
  addCatteryMember: (catteryId: string, member: { catId: string } & CatteryMemberPatch) =>
    request('POST', `${catteryPath(catteryId)}/members`, member),
  updateCatteryMember: (catteryId: string, catId: string, patch: CatteryMemberPatch) =>
    request('PATCH', `${catteryPath(catteryId)}/members/${encodeURIComponent(catId)}`, patch),
  removeCatteryMember: (catteryId: string, catId: string) =>
    request('DELETE', `${catteryPath(catteryId)}/members/${encodeURIComponent(catId)}`),
};

export type DirectoryLoadState =
  | { status: 'loading' }
  | { status: 'ready'; directory: PlatformDirectoryView }
  | { status: 'error'; error: DirectoryRequestError };

function asRequestError(error: unknown): DirectoryRequestError {
  return error instanceof DirectoryRequestError
    ? error
    : new DirectoryRequestError('request_failed', error instanceof Error ? error.message : String(error), 0);
}

/**
 * The canvas's copy of the directory. A change replaces it with the server's
 * answer and refreshes the platform envelope, whose lobby summaries feed the
 * Directory sidebar and cards.
 */
export function useDirectory(): {
  state: DirectoryLoadState;
  pending: boolean;
  reload: () => Promise<void>;
  run: (operation: () => Promise<PlatformDirectoryView>) => Promise<PlatformDirectoryView>;
} {
  const [state, setState] = useState<DirectoryLoadState>({ status: 'loading' });
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const directory = await directoryApi.read();
      if (mounted.current) setState({ status: 'ready', directory });
    } catch (error) {
      if (mounted.current) setState({ status: 'error', error: asRequestError(error) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(async (operation: () => Promise<PlatformDirectoryView>) => {
    setPending(true);
    try {
      const directory = await operation();
      if (mounted.current) setState({ status: 'ready', directory });
      dispatchPlatformEnvelopeRefresh();
      return directory;
    } catch (error) {
      throw asRequestError(error);
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  return { state, pending, reload, run };
}
