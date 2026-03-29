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
