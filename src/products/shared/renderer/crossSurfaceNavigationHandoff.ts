import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';

export type CrossSurfaceNavigationHandoffKind =
  | 'draft-create-channel'
  | 'draft-create-parallel-group'
  | 'navigate-conversation'
  | 'navigate-artifact'
  | 'navigate-task'
  | 'navigate-run';

export type CrossSurfaceNavigationDestinationEntityKind =
  | 'channel'
  | 'parallel-group'
  | 'conversation'
  | 'artifact'
  | 'task'
  | 'run';

export const IMPLEMENTED_CROSS_SURFACE_NAVIGATION_HANDOFF_KINDS = [
  'draft-create-channel',
  'draft-create-parallel-group',
] as const;

export type ImplementedCrossSurfaceNavigationHandoffKind =
  typeof IMPLEMENTED_CROSS_SURFACE_NAVIGATION_HANDOFF_KINDS[number];

export interface CrossSurfaceNavigationRouteTarget {
  surface: PlatformSurfaceId;
  path: string;
}

export interface CrossSurfaceNavigationSnapshot {
  appShellPayload?: AppShellPayload;
}

export interface CrossSurfaceNavigationOptimisticState {
  pendingExecution: boolean;
  selectedChannelId?: string | null;
}

export interface CrossSurfaceNavigationHandoffBundle {
  kind: CrossSurfaceNavigationHandoffKind;
  sourceSurface: PlatformSurfaceId;
  targetSurface: PlatformSurfaceId;
  destination: {
    entityKind: CrossSurfaceNavigationDestinationEntityKind;
    entityId: string;
    route: CrossSurfaceNavigationRouteTarget;
  };
  createdAt: string;
  snapshot?: CrossSurfaceNavigationSnapshot;
  optimisticState?: CrossSurfaceNavigationOptimisticState;
}

export interface CrossSurfaceNavigationHandoffMatch {
  surface: PlatformSurfaceId;
  path: string;
}

export const CROSS_SURFACE_NAVIGATION_HANDOFF_TTL_MS = 60_000;

const stagedCrossSurfaceNavigationHandoffs = new Map<
  string,
  CrossSurfaceNavigationHandoffBundle
>();
const loggedCrossSurfaceNavigationHandoffMisses = new Set<string>();

function compareNormalizedRouteSegment(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function normalizeRoutePath(path: string): string {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return '';
  }

  try {
    const url = new URL(
      trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`,
      'https://cats.local',
    );
    const normalizedPathname = url.pathname;
    const normalizedSearchEntries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? compareNormalizedRouteSegment(leftValue, rightValue)
        : compareNormalizedRouteSegment(leftKey, rightKey));
    const normalizedSearch = normalizedSearchEntries.length > 0
      ? `?${new URLSearchParams(normalizedSearchEntries).toString()}`
      : '';

    return `${normalizedPathname}${normalizedSearch}`;
  } catch {
    return trimmedPath;
  }
}

export function buildCrossSurfaceNavigationMatchPath(pathname: string, search = ''): string {
  return normalizeRoutePath(`${pathname}${search}`);
}

function buildCrossSurfaceNavigationHandoffKey(match: CrossSurfaceNavigationHandoffMatch): string {
  return `${match.surface}:${normalizeRoutePath(match.path)}`;
}

function resetCrossSurfaceNavigationHandoffMissLog(): void {
  loggedCrossSurfaceNavigationHandoffMisses.clear();
}

function isFreshCrossSurfaceNavigationHandoff(bundle: CrossSurfaceNavigationHandoffBundle): boolean {
  const stagedAt = Date.parse(bundle.createdAt);
  if (Number.isNaN(stagedAt)) {
    return true;
  }

  return Date.now() - stagedAt <= CROSS_SURFACE_NAVIGATION_HANDOFF_TTL_MS;
}

function shouldLogCrossSurfaceNavigationHandoffDebug(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

function logCrossSurfaceNavigationHandoffMiss(
  match: CrossSurfaceNavigationHandoffMatch,
  reason: 'missing' | 'stale' | 'invalid',
): void {
  if (
    !shouldLogCrossSurfaceNavigationHandoffDebug()
    || typeof console === 'undefined'
    || typeof console.warn !== 'function'
  ) {
    return;
  }

  const requestedKey = buildCrossSurfaceNavigationHandoffKey(match);
  const stagedTargets = [...stagedCrossSurfaceNavigationHandoffs.values()].map((bundle) =>
    `${bundle.targetSurface}:${bundle.destination.route.path}`);
  const warningFingerprint = `${reason}:${requestedKey}:${stagedTargets.join('|')}`;
  if (loggedCrossSurfaceNavigationHandoffMisses.has(warningFingerprint)) {
    return;
  }
  loggedCrossSurfaceNavigationHandoffMisses.add(warningFingerprint);

  console.warn(
    reason === 'stale'
      ? '[cats-platform] staged warm navigation handoff expired before mount; continuing with cold boot.'
      : reason === 'invalid'
        ? '[cats-platform] staged warm navigation handoff failed route validation; continuing with cold boot.'
        : '[cats-platform] no staged warm navigation handoff matched the requested route; continuing with cold boot.',
    {
      requested: requestedKey,
      stagedTargets,
    },
  );
}

function validateCrossSurfaceNavigationHandoffMatch(
  bundle: CrossSurfaceNavigationHandoffBundle,
  match: CrossSurfaceNavigationHandoffMatch,
): boolean {
  return matchesCrossSurfaceNavigationHandoff(bundle, match);
}

function resolveStagedCrossSurfaceNavigationHandoff(
  match: CrossSurfaceNavigationHandoffMatch,
  options?: { consume?: boolean; logMiss?: boolean },
): CrossSurfaceNavigationHandoffBundle | null {
  const handoffKey = buildCrossSurfaceNavigationHandoffKey(match);
  const stagedBundle = stagedCrossSurfaceNavigationHandoffs.get(handoffKey) ?? null;
  if (!stagedBundle) {
    if (options?.logMiss) {
      logCrossSurfaceNavigationHandoffMiss(match, 'missing');
    }
    return null;
  }

  if (!validateCrossSurfaceNavigationHandoffMatch(stagedBundle, match)) {
    stagedCrossSurfaceNavigationHandoffs.delete(handoffKey);
    resetCrossSurfaceNavigationHandoffMissLog();
    if (options?.logMiss) {
      logCrossSurfaceNavigationHandoffMiss(match, 'invalid');
    }
    return null;
  }

  if (!isFreshCrossSurfaceNavigationHandoff(stagedBundle)) {
    stagedCrossSurfaceNavigationHandoffs.delete(handoffKey);
    resetCrossSurfaceNavigationHandoffMissLog();
    if (options?.logMiss) {
      logCrossSurfaceNavigationHandoffMiss(match, 'stale');
    }
    return null;
  }

  if (options?.consume) {
    stagedCrossSurfaceNavigationHandoffs.delete(handoffKey);
    resetCrossSurfaceNavigationHandoffMissLog();
  }

  return stagedBundle;
}

export function isImplementedCrossSurfaceNavigationHandoffKind(
  kind: CrossSurfaceNavigationHandoffKind,
): kind is ImplementedCrossSurfaceNavigationHandoffKind {
  return (
    IMPLEMENTED_CROSS_SURFACE_NAVIGATION_HANDOFF_KINDS as readonly CrossSurfaceNavigationHandoffKind[]
  ).includes(kind);
}

export function stageCrossSurfaceNavigationHandoff(
  bundle: CrossSurfaceNavigationHandoffBundle,
): void {
  const normalizedBundle: CrossSurfaceNavigationHandoffBundle = {
    ...bundle,
    destination: {
      ...bundle.destination,
      route: {
        ...bundle.destination.route,
        path: normalizeRoutePath(bundle.destination.route.path),
      },
    },
  };
  resetCrossSurfaceNavigationHandoffMissLog();
  stagedCrossSurfaceNavigationHandoffs.set(
    buildCrossSurfaceNavigationHandoffKey(normalizedBundle.destination.route),
    normalizedBundle,
  );
}

export function peekLatestStagedCrossSurfaceNavigationHandoff(): CrossSurfaceNavigationHandoffBundle | null {
  const stagedEntries = [...stagedCrossSurfaceNavigationHandoffs.entries()].reverse();
  for (const [handoffKey, bundle] of stagedEntries) {
    if (!validateCrossSurfaceNavigationHandoffMatch(bundle, bundle.destination.route)) {
      stagedCrossSurfaceNavigationHandoffs.delete(handoffKey);
      resetCrossSurfaceNavigationHandoffMissLog();
      continue;
    }
    if (!isFreshCrossSurfaceNavigationHandoff(bundle)) {
      stagedCrossSurfaceNavigationHandoffs.delete(handoffKey);
      resetCrossSurfaceNavigationHandoffMissLog();
      continue;
    }
    return bundle;
  }

  return null;
}

export function peekCrossSurfaceNavigationHandoffForMatch(
  match: CrossSurfaceNavigationHandoffMatch,
): CrossSurfaceNavigationHandoffBundle | null {
  return resolveStagedCrossSurfaceNavigationHandoff(match);
}

export function peekCrossSurfaceNavigationSnapshot<TPayload extends AppShellPayload = AppShellPayload>(
  match: CrossSurfaceNavigationHandoffMatch,
): TPayload | null {
  return (
    peekCrossSurfaceNavigationHandoffForMatch(match)?.snapshot?.appShellPayload ?? null
  ) as TPayload | null;
}

export function consumeCrossSurfaceNavigationSnapshot<TPayload extends AppShellPayload = AppShellPayload>(
  match: CrossSurfaceNavigationHandoffMatch,
): TPayload | null {
  return (
    consumeCrossSurfaceNavigationHandoff(match)?.snapshot?.appShellPayload ?? null
  ) as TPayload | null;
}

export function clearCrossSurfaceNavigationHandoff(
  match?: CrossSurfaceNavigationHandoffMatch,
): void {
  if (!match) {
    stagedCrossSurfaceNavigationHandoffs.clear();
    resetCrossSurfaceNavigationHandoffMissLog();
    return;
  }

  stagedCrossSurfaceNavigationHandoffs.delete(
    buildCrossSurfaceNavigationHandoffKey(match),
  );
  resetCrossSurfaceNavigationHandoffMissLog();
}

export function matchesCrossSurfaceNavigationHandoff(
  bundle: CrossSurfaceNavigationHandoffBundle,
  match: CrossSurfaceNavigationHandoffMatch,
): boolean {
  return bundle.targetSurface === match.surface
    && bundle.destination.route.surface === match.surface
    && bundle.destination.route.path === normalizeRoutePath(match.path);
}

export function consumeCrossSurfaceNavigationHandoff(
  match: CrossSurfaceNavigationHandoffMatch,
): CrossSurfaceNavigationHandoffBundle | null {
  return resolveStagedCrossSurfaceNavigationHandoff(match, {
    consume: true,
    logMiss: true,
  });
}
