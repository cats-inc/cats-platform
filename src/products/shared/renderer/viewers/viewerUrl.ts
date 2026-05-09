export function resolveArtifactCanvasRendererSafeUrl(
  safeUrl: string | null | undefined,
): string | null {
  const trimmed = safeUrl?.trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  return url.protocol === 'http:' || url.protocol === 'https:'
    ? trimmed
    : null;
}
