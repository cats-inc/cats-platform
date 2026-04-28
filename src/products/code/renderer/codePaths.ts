import { resolvePlatformSurfaceRoutePrefix } from '../../../shared/platformProducts.js';

export const CODE_ROUTE_PREFIX = resolvePlatformSurfaceRoutePrefix('code');
export const CODE_RELAY_PATH = `${CODE_ROUTE_PREFIX}/relay`;
export const CODE_BUILD_PATH = `${CODE_ROUTE_PREFIX}/build`;
export const CODE_ARTIFACTS_PATH = `${CODE_ROUTE_PREFIX}/artifacts`;
export const CODE_WORKSPACES_PATH = `${CODE_ROUTE_PREFIX}/workspaces`;

export function buildCodeArtifactPath(artifactId?: string | null): string {
  const normalized = artifactId?.trim();
  return normalized
    ? `${CODE_ARTIFACTS_PATH}/${encodeURIComponent(normalized)}`
    : CODE_ARTIFACTS_PATH;
}

export function buildCodeWorkspacePath(workspaceId?: string | null): string {
  const normalized = workspaceId?.trim();
  return normalized
    ? `${CODE_WORKSPACES_PATH}/${encodeURIComponent(normalized)}`
    : CODE_WORKSPACES_PATH;
}

export function isCodeRelayPath(pathname: string): boolean {
  return pathname.startsWith(CODE_RELAY_PATH);
}

export function isCodeBuildPath(pathname: string): boolean {
  return pathname.startsWith(CODE_BUILD_PATH);
}

export function isCodeWorkspacesPath(pathname: string): boolean {
  return pathname.startsWith(CODE_WORKSPACES_PATH);
}

/**
 * The artifacts surface owns both the list page (`/code/artifacts`) and
 * detail page (`/code/artifacts/:artifactId`). Active-sidebar logic
 * matches both so the Artifacts entry stays highlighted from a deep
 * link.
 */
export function isCodeArtifactsPath(pathname: string): boolean {
  return pathname.startsWith(CODE_ARTIFACTS_PATH);
}

/** True only on the artifacts list (`/code/artifacts` with no id). */
export function isCodeArtifactsListPath(pathname: string): boolean {
  return pathname === CODE_ARTIFACTS_PATH;
}
