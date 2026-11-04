import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * What the first-run wizard remembers about itself (SPEC-136 FR-39): which page it was on, its
 * ticks and its last results. The page's own data, so it can go to Platform and come back. In
 * memory while the process lives; a restart the wizard asked for writes it to a file, which the
 * next start reads once and removes.
 *
 * The host treats it as opaque, and nothing privileged reads it. It holds no password: pages 4
 * and 5 belong to Platform and keep theirs in memory.
 */
const STATE_LIMIT_BYTES = 256 * 1024;

export function validSetupWizardState(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  let text: string;
  try { text = JSON.stringify(value); } catch { return null; }
  return Buffer.byteLength(text, 'utf8') <= STATE_LIMIT_BYTES ? value as Record<string, unknown> : null;
}

export function writeSetupWizardDraft(path: string, state: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(state), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Read once: whatever it holds, the file does not survive this call. */
export function takeSetupWizardDraft(path: string): Record<string, unknown> | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  try { rmSync(path, { force: true }); } catch { /* It is read again next time, and still validated. */ }
  try {
    return validSetupWizardState(JSON.parse(text));
  } catch {
    return null;
  }
}
