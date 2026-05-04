const LOCAL_FALLBACK_PATTERNS = [
  /^setup reset returned \d+$/u,
];

export function formatSettingsDataMutationError(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  return LOCAL_FALLBACK_PATTERNS.some((pattern) => pattern.test(error.message))
    ? fallback
    : error.message;
}
