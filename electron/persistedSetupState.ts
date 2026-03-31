import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PersistedSetupCompletionState {
  setupCompleteAt: string | null;
  productSetupCompleted: boolean;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function readPersistedSetupCompleteAt(chatStatePath: string): Promise<string | null> {
  try {
    const raw = await readFile(chatStatePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed)) {
      return null;
    }
    return readNonEmptyString(parsed.setupCompleteAt);
  } catch {
    return null;
  }
}

async function readPersistedProductSetupCompleted(chatStatePath: string): Promise<boolean> {
  try {
    const raw = await readFile(
      path.join(path.dirname(chatStatePath), 'suite-onboarding-history.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed) || !Array.isArray(parsed.events)) {
      return false;
    }
    return parsed.events.some((event) => (
      isObjectRecord(event)
      && event.kind === 'setup_completed'
      && event.status === 'ok'
    ));
  } catch {
    return false;
  }
}

export async function readPersistedSetupCompletionState(
  chatStatePath: string,
): Promise<PersistedSetupCompletionState> {
  const [setupCompleteAt, productSetupCompleted] = await Promise.all([
    readPersistedSetupCompleteAt(chatStatePath),
    readPersistedProductSetupCompleted(chatStatePath),
  ]);

  return {
    setupCompleteAt,
    productSetupCompleted,
  };
}
