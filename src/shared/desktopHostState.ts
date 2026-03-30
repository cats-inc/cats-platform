import { readFile } from 'node:fs/promises';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function readDesktopHostBootstrapAttemptId(
  hostStatePath: string | null | undefined,
): Promise<string | null> {
  if (!hostStatePath) {
    return null;
  }

  try {
    const raw = await readFile(hostStatePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed)) {
      return null;
    }
    const diagnostics = parsed.diagnostics;
    if (!isObjectRecord(diagnostics)) {
      return null;
    }
    return readString(diagnostics.activeAttemptId);
  } catch {
    return null;
  }
}
