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

let stagedCrossSurfaceNavigationHandoff: CrossSurfaceNavigationHandoffBundle | null = null;

function normalizeRoutePath(path: string): string {
  return path.trim();
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
  stagedCrossSurfaceNavigationHandoff = {
    ...bundle,
    destination: {
      ...bundle.destination,
      route: {
        ...bundle.destination.route,
        path: normalizeRoutePath(bundle.destination.route.path),
      },
    },
  };
}

export function peekCrossSurfaceNavigationHandoff(): CrossSurfaceNavigationHandoffBundle | null {
  return stagedCrossSurfaceNavigationHandoff;
}

export function clearCrossSurfaceNavigationHandoff(): void {
  stagedCrossSurfaceNavigationHandoff = null;
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
  const stagedBundle = stagedCrossSurfaceNavigationHandoff;
  if (!stagedBundle || !matchesCrossSurfaceNavigationHandoff(stagedBundle, match)) {
    return null;
  }

  stagedCrossSurfaceNavigationHandoff = null;
  return stagedBundle;
}
