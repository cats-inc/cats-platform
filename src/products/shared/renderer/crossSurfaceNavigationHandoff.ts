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

// -------------------------- observability seam --------------------------
//
// Pluggable hook so product/telemetry wiring can count hit/miss/stage rates
// without this module taking a hard dependency on a telemetry client. The
// default observer is null so zero cost in prod until wired.

export type CrossSurfaceNavigationHandoffObservationEvent =
  | {
      kind: 'stage';
      bundle: CrossSurfaceNavigationHandoffBundle;
    }
  | {
      kind: 'hit';
      match: CrossSurfaceNavigationHandoffMatch;
      bundle: CrossSurfaceNavigationHandoffBundle;
    }
  | {
      kind: 'miss';
      match: CrossSurfaceNavigationHandoffMatch;
      reason: 'missing' | 'stale' | 'invalid';
    };

export type CrossSurfaceNavigationHandoffObserver = (
  event: CrossSurfaceNavigationHandoffObservationEvent,
) => void;

let crossSurfaceNavigationHandoffObserver: CrossSurfaceNavigationHandoffObserver | null = null;

export function setCrossSurfaceNavigationHandoffObserver(
  next: CrossSurfaceNavigationHandoffObserver | null,
): void {
  crossSurfaceNavigationHandoffObserver = next;
}

function emitCrossSurfaceNavigationHandoffEvent(
  event: CrossSurfaceNavigationHandoffObservationEvent,
): void {
  if (!crossSurfaceNavigationHandoffObserver) {
    return;
  }
  try {
    crossSurfaceNavigationHandoffObserver(event);
  } catch {
    // Observer errors must not break the seam.
  }
}

// -------------------------- store + dedup log --------------------------

const stagedCrossSurfaceNavigationHandoffs = new Map<
  string,
  CrossSurfaceNavigationHandoffBundle
>();
const loggedCrossSurfaceNavigationHandoffMisses = new Set<string>();

// Every state mutation (set/delete/clear) resets the miss-log dedup window so
// miss warnings become observable again against the new store state. All
// mutation paths must route through these helpers rather than touching the
// Map directly, to keep the reset guarantee local and auditable.

function setStagedCrossSurfaceNavigationHandoff(
  key: string,
  bundle: CrossSurfaceNavigationHandoffBundle,
): void {
  stagedCrossSurfaceNavigationHandoffs.set(key, bundle);
  loggedCrossSurfaceNavigationHandoffMisses.clear();
}

function deleteStagedCrossSurfaceNavigationHandoff(key: string): boolean {
  const deleted = stagedCrossSurfaceNavigationHandoffs.delete(key);
  if (deleted) {
    loggedCrossSurfaceNavigationHandoffMisses.clear();
  }
  return deleted;
}

function clearAllStagedCrossSurfaceNavigationHandoffs(): void {
  stagedCrossSurfaceNavigationHandoffs.clear();
  loggedCrossSurfaceNavigationHandoffMisses.clear();
}

// -------------------------- path normalization --------------------------

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

// -------------------------- freshness + miss log --------------------------

function isFreshCrossSurfaceNavigationHandoff(bundle: CrossSurfaceNavigationHandoffBundle): boolean {
  const stagedAt = Date.parse(bundle.createdAt);
  if (Number.isNaN(stagedAt)) {
    // Malformed createdAt is treated as stale so buggy bundles do not linger
    // in the store forever waiting for an explicit clear.
    return false;
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
  // Dedup within the current store epoch. Any state mutation (stage / delete /
  // clear) resets the log via the mutation helpers above, so a fresh state
  // epoch automatically re-opens the warning window.
  const warningFingerprint = `${reason}:${requestedKey}`;
  if (loggedCrossSurfaceNavigationHandoffMisses.has(warningFingerprint)) {
    return;
  }
  loggedCrossSurfaceNavigationHandoffMisses.add(warningFingerprint);

  const stagedTargets = [...stagedCrossSurfaceNavigationHandoffs.values()].map((bundle) =>
    `${bundle.targetSurface}:${bundle.destination.route.path}`);
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

// -------------------------- resolver --------------------------
//
// Peek path (no options): pure read, does not mutate the store and does not
// log or emit. Consume path (consume: true): GCs invalid/stale entries it
// encounters, emits hit/miss events, and logs miss warnings in dev.

function resolveStagedCrossSurfaceNavigationHandoff(
  match: CrossSurfaceNavigationHandoffMatch,
  options?: { consume?: boolean },
): CrossSurfaceNavigationHandoffBundle | null {
  const consume = options?.consume === true;
  const handoffKey = buildCrossSurfaceNavigationHandoffKey(match);
  const stagedBundle = stagedCrossSurfaceNavigationHandoffs.get(handoffKey) ?? null;

  if (!stagedBundle) {
    if (consume) {
      logCrossSurfaceNavigationHandoffMiss(match, 'missing');
      emitCrossSurfaceNavigationHandoffEvent({ kind: 'miss', match, reason: 'missing' });
    }
    return null;
  }

  if (!matchesCrossSurfaceNavigationHandoff(stagedBundle, match)) {
    if (consume) {
      deleteStagedCrossSurfaceNavigationHandoff(handoffKey);
      logCrossSurfaceNavigationHandoffMiss(match, 'invalid');
      emitCrossSurfaceNavigationHandoffEvent({ kind: 'miss', match, reason: 'invalid' });
    }
    return null;
  }

  if (!isFreshCrossSurfaceNavigationHandoff(stagedBundle)) {
    if (consume) {
      deleteStagedCrossSurfaceNavigationHandoff(handoffKey);
      logCrossSurfaceNavigationHandoffMiss(match, 'stale');
      emitCrossSurfaceNavigationHandoffEvent({ kind: 'miss', match, reason: 'stale' });
    }
    return null;
  }

  if (consume) {
    deleteStagedCrossSurfaceNavigationHandoff(handoffKey);
    emitCrossSurfaceNavigationHandoffEvent({ kind: 'hit', match, bundle: stagedBundle });
  }

  return stagedBundle;
}

// -------------------------- public API --------------------------

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
  setStagedCrossSurfaceNavigationHandoff(
    buildCrossSurfaceNavigationHandoffKey(normalizedBundle.destination.route),
    normalizedBundle,
  );
  emitCrossSurfaceNavigationHandoffEvent({ kind: 'stage', bundle: normalizedBundle });
}

/**
 * Dev/test inspector that returns the most recently staged bundle that is
 * still valid and fresh. Iterates the store in reverse insertion order and
 * opportunistically GCs invalid/stale entries it encounters. Not intended for
 * production route resolution — consumers should key off
 * `peekCrossSurfaceNavigationHandoffForMatch` /
 * `consumeCrossSurfaceNavigationHandoff` instead.
 */
export function inspectLatestStagedCrossSurfaceNavigationHandoff(): CrossSurfaceNavigationHandoffBundle | null {
  const stagedEntries = [...stagedCrossSurfaceNavigationHandoffs.entries()];
  for (let index = stagedEntries.length - 1; index >= 0; index -= 1) {
    const [handoffKey, bundle] = stagedEntries[index];
    if (!matchesCrossSurfaceNavigationHandoff(bundle, bundle.destination.route)) {
      deleteStagedCrossSurfaceNavigationHandoff(handoffKey);
      continue;
    }
    if (!isFreshCrossSurfaceNavigationHandoff(bundle)) {
      deleteStagedCrossSurfaceNavigationHandoff(handoffKey);
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
    clearAllStagedCrossSurfaceNavigationHandoffs();
    return;
  }

  deleteStagedCrossSurfaceNavigationHandoff(
    buildCrossSurfaceNavigationHandoffKey(match),
  );
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
  return resolveStagedCrossSurfaceNavigationHandoff(match, { consume: true });
}
