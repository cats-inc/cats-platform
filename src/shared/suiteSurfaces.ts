import type { SuiteSurfaceId } from './suite-contract.js';

export const ALL_SUITE_SURFACES = [
  'chat',
  'work',
  'code',
] as const satisfies readonly SuiteSurfaceId[];

const ENABLED_SUITE_SURFACES = [
  'chat',
] as const satisfies readonly SuiteSurfaceId[];

const DEFAULT_CAT_PRODUCT_SURFACES = [
  'chat',
] as const satisfies readonly SuiteSurfaceId[];

interface NormalizeSuiteSurfaceListOptions {
  allowed?: readonly SuiteSurfaceId[];
  fallback?: readonly SuiteSurfaceId[] | null;
}

export function isSuiteSurfaceId(value: string): value is SuiteSurfaceId {
  return (ALL_SUITE_SURFACES as readonly string[]).includes(value);
}

function uniqueSurfaceList(
  values: readonly string[],
  allowed: readonly SuiteSurfaceId[],
): SuiteSurfaceId[] {
  const allowedSet = new Set<string>(allowed);
  const normalized: SuiteSurfaceId[] = [];
  for (const value of values) {
    if (!isSuiteSurfaceId(value) || !allowedSet.has(value) || normalized.includes(value)) {
      continue;
    }
    normalized.push(value);
  }
  return normalized;
}

export function normalizeSuiteSurfaceList(
  values: readonly string[] | null | undefined | unknown,
  options: NormalizeSuiteSurfaceListOptions = {},
): SuiteSurfaceId[] {
  const allowed = uniqueSurfaceList(
    options.allowed ?? ALL_SUITE_SURFACES,
    ALL_SUITE_SURFACES,
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

export function listEnabledSuiteSurfaces(): SuiteSurfaceId[] {
  return [...ENABLED_SUITE_SURFACES];
}

export function isEnabledSuiteSurface(surface: SuiteSurfaceId): boolean {
  return (ENABLED_SUITE_SURFACES as readonly string[]).includes(surface);
}

export function defaultCatProducts(): SuiteSurfaceId[] {
  return [...DEFAULT_CAT_PRODUCT_SURFACES];
}

export function ensureSuiteSurfaceIncluded(
  values: readonly string[],
  requiredSurface: SuiteSurfaceId,
): SuiteSurfaceId[] {
  const normalized = normalizeSuiteSurfaceList(values, {
    fallback: [requiredSurface],
  });
  if (normalized.includes(requiredSurface)) {
    return normalized;
  }
  return [...normalized, requiredSurface];
}
