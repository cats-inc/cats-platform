import type { PlatformSurfaceId } from './platform-contract.js';

export const ALL_PLATFORM_SURFACES = [
  'chat',
  'work',
  'code',
] as const satisfies readonly PlatformSurfaceId[];

const ENABLED_PLATFORM_SURFACES = [
  'chat',
  'work',
  'code',
] as const satisfies readonly PlatformSurfaceId[];

const DEFAULT_CAT_PRODUCT_SURFACES = [
  'chat',
] as const satisfies readonly PlatformSurfaceId[];

interface NormalizePlatformSurfaceListOptions {
  allowed?: readonly PlatformSurfaceId[];
  fallback?: readonly PlatformSurfaceId[] | null;
}

export function isPlatformSurfaceId(value: string): value is PlatformSurfaceId {
  return (ALL_PLATFORM_SURFACES as readonly string[]).includes(value);
}

export function normalizePlatformSurface(
  value: unknown,
  fallback: PlatformSurfaceId | null = null,
): PlatformSurfaceId | null {
  return typeof value === 'string' && isPlatformSurfaceId(value)
    ? value
    : fallback;
}

function uniqueSurfaceList(
  values: readonly string[],
  allowed: readonly PlatformSurfaceId[],
): PlatformSurfaceId[] {
  const allowedSet = new Set<string>(allowed);
  const normalized: PlatformSurfaceId[] = [];
  for (const value of values) {
    if (!isPlatformSurfaceId(value) || !allowedSet.has(value) || normalized.includes(value)) {
      continue;
    }
    normalized.push(value);
  }
  return normalized;
}

export function normalizePlatformSurfaceList(
  values: readonly string[] | null | undefined | unknown,
  options: NormalizePlatformSurfaceListOptions = {},
): PlatformSurfaceId[] {
  const allowed = uniqueSurfaceList(
    options.allowed ?? ALL_PLATFORM_SURFACES,
    ALL_PLATFORM_SURFACES,
  );
  const normalized = uniqueSurfaceList(
    Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string')
      : [],
    allowed,
  );
  if (normalized.length > 0) {
    return normalized;
  }

  const fallback = options.fallback ?? null;
  if (!fallback || fallback.length === 0) {
    return [];
  }

  return uniqueSurfaceList(fallback, allowed);
}

export function hasPlatformSurface(
  values: readonly string[] | null | undefined | unknown,
  surface: PlatformSurfaceId,
  options: NormalizePlatformSurfaceListOptions = {},
): boolean {
  return normalizePlatformSurfaceList(values, options).includes(surface);
}

export function listEnabledPlatformSurfaces(): PlatformSurfaceId[] {
  return [...ENABLED_PLATFORM_SURFACES];
}

export function isEnabledPlatformSurface(surface: PlatformSurfaceId): boolean {
  return (ENABLED_PLATFORM_SURFACES as readonly string[]).includes(surface);
}

export function defaultCatProducts(): PlatformSurfaceId[] {
  return [...DEFAULT_CAT_PRODUCT_SURFACES];
}

export function ensurePlatformSurfaceIncluded(
  values: readonly string[],
  requiredSurface: PlatformSurfaceId,
): PlatformSurfaceId[] {
  const normalized = normalizePlatformSurfaceList(values, {
    fallback: [requiredSurface],
  });
  if (normalized.includes(requiredSurface)) {
    return normalized;
  }
  return [...normalized, requiredSurface];
}
