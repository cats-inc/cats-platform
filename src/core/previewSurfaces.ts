const HTTP_URL_PREFIX = /^https?:\/\//iu;
const APP_RELATIVE_URL_PREFIX = /^\//u;

export type ProductPreviewRenderHint = 'iframe' | 'open_external' | 'download' | 'none';

export interface ProductPreviewSurfaceCandidate {
  id?: string | null;
  label?: string | null;
  renderHint?: string | null;
  url?: string | null;
  path?: string | null;
  artifactId?: string | null;
}

export interface ProductPreviewSurfaceTarget {
  inlineUrl: string | null;
  actionUrl: string | null;
  renderHint: ProductPreviewRenderHint;
  artifactId: string | null;
  label: string | null;
}

export interface ProductPreviewArtifactFallbackCandidate {
  id: string;
  title?: string | null;
  kind: string;
  path: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizePreviewSurfaceUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (HTTP_URL_PREFIX.test(trimmed) || APP_RELATIVE_URL_PREFIX.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function createPreviewSurfaceFallbackCandidates(
  artifacts: readonly ProductPreviewArtifactFallbackCandidate[],
): ProductPreviewSurfaceCandidate[] {
  return artifacts.map((artifact) => ({
    id: artifact.id,
    label: artifact.title ?? null,
    artifactId: artifact.id,
    renderHint: artifact.kind === 'preview' ? 'iframe' : 'download',
    path: artifact.path,
  }));
}

export function resolvePreviewSurfaceTargetFromArtifacts(
  artifacts: readonly ProductPreviewArtifactFallbackCandidate[],
): ProductPreviewSurfaceTarget | null {
  return resolvePreviewSurfaceTarget(createPreviewSurfaceFallbackCandidates(artifacts));
}

export function readRuntimePreviewSurfaceCandidates(
  observation: Record<string, unknown>,
): ProductPreviewSurfaceCandidate[] {
  const session = isRecord(observation.session) ? observation.session : null;
  const inspection = session && isRecord(session.inspection) ? session.inspection : null;
  const directCandidates = Array.isArray(session?.previewSurfaces) ? session.previewSurfaces : [];
  const nestedCandidates = Array.isArray(inspection?.previewSurfaces)
    ? inspection.previewSurfaces
    : [];

  return [...directCandidates, ...nestedCandidates]
    .filter(isRecord)
    .map((candidate) => ({
      id: readOptionalString(candidate.id),
      label: readOptionalString(candidate.label),
      renderHint: readOptionalString(candidate.renderHint),
      url: readOptionalString(candidate.url),
      path: readOptionalString(candidate.path),
      artifactId: readOptionalString(candidate.artifactId),
    }));
}

export function resolveObservedPreviewSurfaceTarget(
  observation: Record<string, unknown> | null | undefined,
  artifacts: readonly ProductPreviewArtifactFallbackCandidate[] = [],
): ProductPreviewSurfaceTarget | null {
  return resolvePreviewSurfaceTarget([
    ...(observation ? readRuntimePreviewSurfaceCandidates(observation) : []),
    ...createPreviewSurfaceFallbackCandidates(artifacts),
  ]);
}

export function resolvePreviewSurfaceTarget(
  candidates: readonly ProductPreviewSurfaceCandidate[],
): ProductPreviewSurfaceTarget | null {
  for (const candidate of candidates) {
    const resolved = resolveSinglePreviewSurfaceTarget(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveSinglePreviewSurfaceTarget(
  candidate: ProductPreviewSurfaceCandidate,
): ProductPreviewSurfaceTarget | null {
  const normalizedUrl = normalizePreviewSurfaceUrl(candidate.url)
    ?? normalizePreviewSurfaceUrl(candidate.path);

  if (!normalizedUrl) {
    return null;
  }

  const renderHint = normalizeRenderHint(candidate.renderHint);
  const artifactId = typeof candidate.artifactId === 'string' && candidate.artifactId
    ? candidate.artifactId
    : (typeof candidate.id === 'string' && candidate.id ? candidate.id : null);
  const label = typeof candidate.label === 'string' && candidate.label.trim()
    ? candidate.label.trim()
    : null;

  if (renderHint === 'iframe') {
    return {
      inlineUrl: normalizedUrl,
      actionUrl: normalizedUrl,
      renderHint,
      artifactId,
      label,
    };
  }

  if (renderHint === 'open_external' || renderHint === 'download') {
    return {
      inlineUrl: null,
      actionUrl: normalizedUrl,
      renderHint,
      artifactId,
      label,
    };
  }

  return null;
}

function normalizeRenderHint(hint: string | null | undefined): ProductPreviewRenderHint {
  switch (hint) {
    case 'iframe':
    case 'open_external':
    case 'download':
      return hint;
    default:
      return 'none';
  }
}
