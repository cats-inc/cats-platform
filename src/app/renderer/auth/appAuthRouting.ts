import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import { platformSurfaceRoutePrefix } from '../../../core/platformSurface.js';
import { isUnauthenticatedPlatformEnvelopeError } from '../setup/api.js';

export const PLATFORM_LOGIN_ROUTE = '/login';
export const PLATFORM_LOBBY_ROUTE = '/lobby';

export type PlatformEnvelopeLoadFailureDecision =
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

export function resolvePlatformEnvelopeLoadFailureDecision(
  error: unknown,
  fallbackMessage: string,
): PlatformEnvelopeLoadFailureDecision {
  if (isUnauthenticatedPlatformEnvelopeError(error)) {
    return { status: 'unauthenticated' };
  }
  return {
    status: 'error',
    message: error instanceof Error ? error.message : fallbackMessage,
  };
}

export function resolvePostAuthenticationEntryPath(
  envelope: Pick<PlatformHostEnvelope, 'lastProductSurface'>,
): string {
  return envelope.lastProductSurface
    ? platformSurfaceRoutePrefix(envelope.lastProductSurface)
    : PLATFORM_LOBBY_ROUTE;
}
