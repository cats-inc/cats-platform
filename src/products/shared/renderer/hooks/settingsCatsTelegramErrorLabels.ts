const LOCAL_FALLBACK_PATTERNS = [
  /^telegram transport status returned \d+$/u,
  /^telegram transport diagnostics returned \d+$/u,
  /^polling reconnect returned \d+$/u,
];

export function formatSettingsCatsTelegramLoadError(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof Error) && typeof error !== 'string') {
    return fallback;
  }
  const message = error instanceof Error ? error.message : error;
  return LOCAL_FALLBACK_PATTERNS.some((pattern) => pattern.test(message))
    ? fallback
    : message;
}
