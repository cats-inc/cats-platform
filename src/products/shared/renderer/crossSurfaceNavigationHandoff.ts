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

const stagedCrossSurfaceNavigationHandoffs = new Map<
  string,
  CrossSurfaceNavigationHandoffBundle
>();

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
    const normalizedPathname = url.pathname !== '/'
      ? url.pathname.replace(/\/+$/u, '')
      : url.pathname;
    const normalizedSearchEntries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey));
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

function readLatestStagedCrossSurfaceNavigationHandoff(): CrossSurfaceNavigationHandoffBundle | null {
  let latestBundle: CrossSurfaceNavigationHandoffBundle | null = null;
  for (const bundle of stagedCrossSurfaceNavigationHandoffs.values()) {
    latestBundle = bundle;
  }
  return latestBundle;
}

function shouldLogCrossSurfaceNavigationHandoffDebug(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

function logCrossSurfaceNavigationHandoffMiss(match: CrossSurfaceNavigationHandoffMatch): void {
  if (
    !shouldLogCrossSurfaceNavigationHandoffDebug()
    || stagedCrossSurfaceNavigationHandoffs.size === 0
    || typeof console === 'undefined'
    || typeof console.warn !== 'function'
  ) {
    return;
  }

  const stagedTargets = [...stagedCrossSurfaceNavigationHandoffs.values()].map((bundle) =>
    `${bundle.targetSurface}:${bundle.destination.route.path}`);
  console.warn(
    '[cats-platform] warm navigation handoff miss; falling back to cold boot.',
    {
      requested: buildCrossSurfaceNavigationHandoffKey(match),
      stagedTargets,
    },
  );
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
  stagedCrossSurfaceNavigationHandoffs.set(
    buildCrossSurfaceNavigationHandoffKey(normalizedBundle.destination.route),
    normalizedBundle,
  );
}

export function peekCrossSurfaceNavigationHandoff(): CrossSurfaceNavigationHandoffBundle | null {
  return readLatestStagedCrossSurfaceNavigationHandoff();
}

export function peekCrossSurfaceNavigationHandoffForMatch(
  match: CrossSurfaceNavigationHandoffMatch,
): CrossSurfaceNavigationHandoffBundle | null {
  const stagedBundle = stagedCrossSurfaceNavigationHandoffs.get(
    buildCrossSurfaceNavigationHandoffKey(match),
  ) ?? null;
  if (!stagedBundle) {
    logCrossSurfaceNavigationHandoffMiss(match);
    return null;
  }

  return stagedBundle;
}

export function peekCrossSurfaceNavigationSnapshot<TPayload extends AppShellPayload = AppShellPayload>(
  match: CrossSurfaceNavigationHandoffMatch,
): TPayload | null {
  return (
    peekCrossSurfaceNavigationHandoffForMatch(match)?.snapshot?.appShellPayload ?? null
  ) as TPayload | null;
}

export function consumeCrossSurfaceNavigationSnapshot<TPayload = AppShellPayload>(
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
    return;
  }

  stagedCrossSurfaceNavigationHandoffs.delete(
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
  const handoffKey = buildCrossSurfaceNavigationHandoffKey(match);
  const stagedBundle = stagedCrossSurfaceNavigationHandoffs.get(handoffKey) ?? null;
  if (!stagedBundle) {
    logCrossSurfaceNavigationHandoffMiss(match);
    return null;
  }

  stagedCrossSurfaceNavigationHandoffs.delete(handoffKey);
  return stagedBundle;
}
