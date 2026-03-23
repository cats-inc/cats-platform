export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => normalizeWhitespace(value ?? ''))
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

export function tokenize(value: string): string[] {
  return uniqueStrings(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((part) => part.length >= 3),
  );
}

export function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
