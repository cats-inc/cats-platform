export function parseDesktopBoolean(
  rawValue: string | undefined,
  fallback: boolean,
): boolean {
  const trimmed = rawValue?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed === '1' || trimmed === 'true' || trimmed === 'yes') {
    return true;
  }
  if (trimmed === '0' || trimmed === 'false' || trimmed === 'no') {
    return false;
  }
  return fallback;
}
