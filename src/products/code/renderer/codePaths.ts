import { resolvePlatformSurfaceRoutePrefix } from '../../../shared/platformProducts.js';

export const CODE_ROUTE_PREFIX = resolvePlatformSurfaceRoutePrefix('code');
export const CODE_RELAY_PATH = `${CODE_ROUTE_PREFIX}/relay`;
export const CODE_BUILD_PATH = `${CODE_ROUTE_PREFIX}/build`;
export const CODE_ARTIFACTS_PATH = `${CODE_ROUTE_PREFIX}/artifacts`;

export function buildCodeArtifactPath(artifactId?: string | null): string {
  const normalized = artifactId?.trim();
  return normalized
    ? `${CODE_ARTIFACTS_PATH}/${encodeURIComponent(normalized)}`
    : CODE_ARTIFACTS_PATH;
}

export function isCodeRelayPath(pathname: string): boolean {
  return pathname.startsWith(CODE_RELAY_PATH);
}

export function isCodeBuildPath(pathname: string): boolean {
  return pathname.startsWith(CODE_BUILD_PATH);
}
