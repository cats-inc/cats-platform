import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';
import {
  buildCrossSurfaceChannelPath,
  resolveCrossSurfaceNavigationRouteTarget,
} from './crossSurfaceNavigationRegistry.js';
import {
  stageCrossSurfaceNavigationHandoff,
  type CrossSurfaceNavigationRouteTarget,
} from './crossSurfaceNavigationHandoff.js';

/** Route persisted conversations through their owning product, retaining canvas/query state. */
export function resolveConversationOriginRoute(input: {
  sourceSurface: PlatformSurfaceId;
  currentPath: string;
  channel: { id: string; originSurface?: PlatformSurfaceId | null } | null | undefined;
}): CrossSurfaceNavigationRouteTarget | null {
  const targetSurface = input.channel?.originSurface;
  if (!input.channel || !targetSurface || targetSurface === input.sourceSurface) return null;
  const sourcePath = buildCrossSurfaceChannelPath(input.sourceSurface, input.channel.id);
  const suffix = input.currentPath.slice(sourcePath.length);
  if (!input.currentPath.startsWith(sourcePath) || (suffix && !/^[/?#]/u.test(suffix))) return null;
  return {
    surface: targetSurface,
    path: buildCrossSurfaceChannelPath(targetSurface, input.channel.id) + suffix,
  };
}

export interface StageCrossSurfaceConversationNavigationHandoffInput {
  sourceSurface: PlatformSurfaceId;
  targetSurface: PlatformSurfaceId;
  channelId: string;
  snapshotPayload?: AppShellPayload;
  pendingExecution?: boolean;
  parallelGroupId?: string;
  destinationPath?: string;
}

export function stageCrossSurfaceConversationNavigationHandoff(
  input: StageCrossSurfaceConversationNavigationHandoffInput,
): CrossSurfaceNavigationRouteTarget | null {
  const entityId = input.channelId.trim();
  if (!entityId || input.sourceSurface === input.targetSurface) {
    return null;
  }

  const entityKind = input.parallelGroupId ? 'parallel-group' : 'conversation';
  const route = resolveCrossSurfaceNavigationRouteTarget({
    surface: input.targetSurface,
    entityKind,
    entityId: input.parallelGroupId ?? entityId,
    activeChannelId: entityId,
  });
  if (input.destinationPath) route.path = input.destinationPath;

  stageCrossSurfaceNavigationHandoff({
    kind: 'navigate-conversation',
    sourceSurface: input.sourceSurface,
    targetSurface: input.targetSurface,
    destination: {
      entityKind,
      entityId: input.parallelGroupId ?? entityId,
      route,
    },
    createdAt: new Date().toISOString(),
    snapshot: input.snapshotPayload
      ? { appShellPayload: input.snapshotPayload }
      : undefined,
    optimisticState: {
      pendingExecution: input.pendingExecution ?? false,
      selectedChannelId: entityId,
    },
  });

  return route;
}
