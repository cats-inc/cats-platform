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
 * Whether a conversation at `scope` has everything `level` gives (ADR-149 D5): Work includes
 * Code, and both include Chat. A value that is not a scope includes nothing.
 */
export function productScopeIncludes(scope: unknown, level: ProductScope): boolean {
  return isProductScope(scope) && compareProductScopes(scope, level) >= 0;
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

/**
 * What the read rule looks at. A stored conversation, a view, a summary and the metadata
 * copied onto a Core record all fit: each carries the kind or a routing mode in its own place.
 */
export interface ProductScopeSource {
  productScope?: unknown;
  originSurface?: unknown;
  channelKind?: unknown;
  /** A summary's routing mode. */
  roomMode?: unknown;
  /** A stored conversation's and a view's routing state. */
  roomRouting?: { mode?: unknown } | null;
}

const DIRECT_MESSAGE = 'direct_message';

/** A direct lane, by its kind or by its routing mode, whichever the shape carries. */
export function isDirectLaneSource(source: ProductScopeSource): boolean {
  return source.channelKind === DIRECT_MESSAGE
    || source.roomMode === DIRECT_MESSAGE
    || source.roomRouting?.mode === DIRECT_MESSAGE;
}

/**
 * SPEC-141: the scope every reader uses, in this order.
 * - A direct lane is `chat` whatever is stored (S6). The stored value is left alone.
 * - A valid stored value is used as stored, even below the origin, so reading never raises a
 *   scope (FR-3).
 * - Otherwise the scope is derived: the origin's level, or `chat` when no origin was recorded.
 */
export function readProductScope(source: ProductScopeSource): ProductScope {
  if (isDirectLaneSource(source)) {
    return 'chat';
  }
  return isProductScope(source.productScope)
    ? source.productScope
    : deriveProductScope({ originSurface: source.originSurface, directLane: false });
}
