import { Navigate, useParams } from 'react-router-dom';

import { platformSurfaceRoutePrefix } from '../../../core/platformSurface.js';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import { buildMyCatPathForPrefix } from './myCatNavigation.js';

/**
 * Direct messages are Chat-owned (ADR-129). Code and Work used to
 * register their own `/{prefix}/dm/:catId` route; the platform router
 * keeps those URLs only to forward bookmarks and history entries to
 * Chat's direct message, before the Code or Work app ever boots.
 */
export const LEGACY_DIRECT_MESSAGE_SURFACES = ['code', 'work'] as const satisfies readonly PlatformSurfaceId[];

export function resolveLegacyDirectMessageRedirectPath(catId: string): string {
  return buildMyCatPathForPrefix(platformSurfaceRoutePrefix('chat'), catId);
}

export function LegacyDirectMessageRedirect() {
  const { catId = '' } = useParams();
  return <Navigate to={resolveLegacyDirectMessageRedirectPath(catId)} replace />;
}
