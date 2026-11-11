import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import { readProductScope, type ProductScopeSource } from '../../../shared/productScope.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';
import {
  buildCrossSurfaceChannelPath,
  resolveCrossSurfaceNavigationRouteTarget,
} from './crossSurfaceNavigationRegistry.js';
import {
  stageCrossSurfaceNavigationHandoff,
  type CrossSurfaceNavigationRouteTarget,
} from './crossSurfaceNavigationHandoff.js';

/**
 * Route persisted conversations through their owning product, retaining canvas/query state.
 * The owning product is the one of the conversation's scope (SPEC-141 FR-13), so a link made
 * before a raise, or one that hard-codes a product prefix, still arrives.
 */
export function resolveConversationOriginRoute(input: {
  sourceSurface: PlatformSurfaceId;
  currentPath: string;
  channel: ({ id: string } & ProductScopeSource) | null | undefined;
}): CrossSurfaceNavigationRouteTarget | null {
  if (!input.channel) return null;
  const targetSurface = readProductScope(input.channel);
  if (targetSurface === input.sourceSurface) return null;
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
  notice?: string;
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
      ...(input.notice ? { notice: input.notice } : {}),
    },
  });

  return route;
}
