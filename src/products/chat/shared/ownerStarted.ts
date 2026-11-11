import type { ChatMessage, OwnerStartedSurface } from '../api/contracts.js';
import type { RouteAuthContext } from '../../../shared/http.js';

/**
 * SPEC-139 owner-started stamp. Only the authenticated owner message route sets it, on the
 * source message, so retries and queued turns read it from there. Transports, dispatch,
 * parallel members, choice answers, schedules, heartbeats and other Cats never carry it.
 */
export const OWNER_STARTED_METADATA_KEY = 'ownerStarted';

/** Desktop's cookie (CSRF already enforced by the auth gate) or mobile's bearer, owner only. */
export function resolveOwnerStartedSurface(
  auth: RouteAuthContext | null | undefined,
): OwnerStartedSurface | null {
  if (!auth?.principal?.membership.roles.includes('owner')) {
    return null;
  }
  if (auth.credentialKind === 'browser_cookie') {
    return 'desktop';
  }
  return auth.credentialKind === 'mobile_bearer' ? 'mobile' : null;
}

/** Drops any caller-supplied stamp; only the server adds it back. */
export function withoutOwnerStarted<T extends Record<string, unknown>>(
  metadata: T | null | undefined,
): Omit<T, typeof OWNER_STARTED_METADATA_KEY> {
  const { [OWNER_STARTED_METADATA_KEY]: _dropped, ...rest } = metadata ?? ({} as T);
  return rest;
}

export function readOwnerStarted(
  message: Pick<ChatMessage, 'senderKind' | 'metadata' | 'choiceResponse'> | null | undefined,
): OwnerStartedSurface | null {
  if (message?.senderKind !== 'user' || message.choiceResponse) {
    return null;
  }
  return parseOwnerStartedSurface(message.metadata?.[OWNER_STARTED_METADATA_KEY]);
}

export function parseOwnerStartedSurface(value: unknown): OwnerStartedSurface | null {
  return value === 'desktop' || value === 'mobile' ? value : null;
}
