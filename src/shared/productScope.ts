import type { PlatformSurfaceId } from './platform-contract.js';

/**
 * SPEC-141: a conversation's product scope. The array order is the ladder
 * `chat < code < work`, and each level includes everything below it (ADR-149 D5).
 */
export const PRODUCT_SCOPES = ['chat', 'code', 'work'] as const satisfies readonly PlatformSurfaceId[];

export type ProductScope = (typeof PRODUCT_SCOPES)[number];

export function isProductScope(value: unknown): value is ProductScope {
  return typeof value === 'string' && (PRODUCT_SCOPES as readonly string[]).includes(value);
}

/** Negative when `left` is narrower than `right`, zero when equal, positive when wider. */
export function compareProductScopes(left: ProductScope, right: ProductScope): number {
  return PRODUCT_SCOPES.indexOf(left) - PRODUCT_SCOPES.indexOf(right);
}

/**
 * The scope a conversation gets when none is stored (FR-2, FR-3): a direct lane is `chat`
 * whatever its origin; any other conversation takes its origin's level, or `chat` when no
 * origin was recorded.
 */
export function deriveProductScope(input: {
  originSurface: unknown;
  directLane: boolean;
}): ProductScope {
  if (input.directLane) {
    return 'chat';
  }
  return isProductScope(input.originSurface) ? input.originSurface : 'chat';
}
