import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import { prefetchProductSurface } from '../../../app/renderer/productSurfaceEntries.js';
import { buildChannelPath as buildChatChannelPath } from '../../chat/shared/channelPaths.js';
import { buildChannelPath as buildCodeChannelPath } from '../../code/shared/channelPaths.js';
import { buildChannelPath as buildWorkChannelPath } from '../../work/shared/channelPaths.js';
import type {
  CrossSurfaceNavigationDestinationEntityKind,
  CrossSurfaceNavigationRouteTarget,
} from './crossSurfaceNavigationHandoff.js';

export interface CrossSurfaceNavigationTarget {
  surface: PlatformSurfaceId;
  entityKind: CrossSurfaceNavigationDestinationEntityKind;
  entityId: string;
  activeChannelId?: string | null;
}

const CHANNEL_PATH_BUILDERS: Record<PlatformSurfaceId, (channelId: string) => string> = {
  chat: buildChatChannelPath,
  code: buildCodeChannelPath,
  work: buildWorkChannelPath,
};

export function buildCrossSurfaceChannelPath(
  surface: PlatformSurfaceId,
  channelId: string,
): string {
  return CHANNEL_PATH_BUILDERS[surface](channelId);
}

export function buildCrossSurfaceNavigationPath(
  target: CrossSurfaceNavigationTarget,
): string {
  switch (target.entityKind) {
    case 'channel':
    case 'conversation':
      return buildCrossSurfaceChannelPath(target.surface, target.entityId);
    case 'parallel-group': {
      const activeChannelId = target.activeChannelId?.trim();
      if (!activeChannelId) {
        throw new Error('Parallel group handoff requires an active channel route target.');
      }
      return buildCrossSurfaceChannelPath(target.surface, activeChannelId);
    }
    default:
      throw new Error(
        `No cross-surface navigation path builder is registered for ${target.entityKind}.`,
      );
  }
}

export function resolveCrossSurfaceNavigationRouteTarget(
  target: CrossSurfaceNavigationTarget,
): CrossSurfaceNavigationRouteTarget {
  return {
    surface: target.surface,
    path: buildCrossSurfaceNavigationPath(target),
  };
}

export function prefetchCrossSurfaceNavigationTarget(
  surfaceOrTarget: PlatformSurfaceId | Pick<CrossSurfaceNavigationTarget, 'surface'>,
): Promise<unknown> {
  const surface =
    typeof surfaceOrTarget === 'string'
      ? surfaceOrTarget
      : surfaceOrTarget.surface;
  return prefetchProductSurface(surface);
}
