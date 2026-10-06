import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import type { AppShellPayload } from '../api/workspaceContracts.js';
import { resolveCrossSurfaceNavigationRouteTarget } from './crossSurfaceNavigationRegistry.js';
import { stageCrossSurfaceNavigationHandoff } from './crossSurfaceNavigationHandoff.js';

export function resolveCrossSurfaceDraftDispatchState(input: {
  sourceSurface: PlatformSurfaceId;
  showingNewChatDraft: boolean;
  draftSurface: PlatformSurfaceId;
}) {
  const targetSurface = input.showingNewChatDraft ? input.draftSurface : input.sourceSurface;
  return {
    targetSurface,
    isCrossSurfaceDraftDispatch: input.showingNewChatDraft && targetSurface !== input.sourceSurface,
  };
}

export function stageCrossSurfaceDraftNavigationHandoff(input: {
  kind: 'draft-create-channel' | 'draft-create-parallel-group';
  sourceSurface: PlatformSurfaceId;
  targetSurface: PlatformSurfaceId;
  entityId: string;
  entityKind: 'channel' | 'parallel-group';
  activeChannelId?: string | null;
  snapshotPayload: AppShellPayload;
  pendingExecution: boolean;
  feedback?: string;
}): void {
  if (input.sourceSurface === input.targetSurface || !input.entityId.trim()) return;
  stageCrossSurfaceNavigationHandoff({
    kind: input.kind,
    sourceSurface: input.sourceSurface,
    targetSurface: input.targetSurface,
    destination: {
      entityKind: input.entityKind,
      entityId: input.entityId,
      route: resolveCrossSurfaceNavigationRouteTarget({
        surface: input.targetSurface,
        entityKind: input.entityKind,
        entityId: input.entityId,
        activeChannelId: input.activeChannelId,
      }),
    },
    createdAt: new Date().toISOString(),
    snapshot: { appShellPayload: input.snapshotPayload },
    optimisticState: {
      pendingExecution: input.pendingExecution,
      selectedChannelId: input.activeChannelId ?? input.entityId,
      ...(input.feedback ? { feedback: input.feedback } : {}),
    },
  });
}
