import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';
import {
  resolveCrossSurfaceNavigationRouteTarget,
} from './crossSurfaceNavigationRegistry.js';
import {
  stageCrossSurfaceNavigationHandoff,
  type CrossSurfaceNavigationRouteTarget,
} from './crossSurfaceNavigationHandoff.js';

export interface StageCrossSurfaceConversationNavigationHandoffInput {
  sourceSurface: PlatformSurfaceId;
  targetSurface: PlatformSurfaceId;
  channelId: string;
  snapshotPayload?: AppShellPayload;
}

export function stageCrossSurfaceConversationNavigationHandoff(
  input: StageCrossSurfaceConversationNavigationHandoffInput,
): CrossSurfaceNavigationRouteTarget | null {
  const entityId = input.channelId.trim();
  if (!entityId || input.sourceSurface === input.targetSurface) {
    return null;
  }

  const route = resolveCrossSurfaceNavigationRouteTarget({
    surface: input.targetSurface,
    entityKind: 'conversation',
    entityId,
  });

  stageCrossSurfaceNavigationHandoff({
    kind: 'navigate-conversation',
    sourceSurface: input.sourceSurface,
    targetSurface: input.targetSurface,
    destination: {
      entityKind: 'conversation',
      entityId,
      route,
    },
    createdAt: new Date().toISOString(),
    snapshot: input.snapshotPayload
      ? { appShellPayload: input.snapshotPayload }
      : undefined,
    optimisticState: {
      pendingExecution: false,
      selectedChannelId: entityId,
    },
  });

  return route;
}
