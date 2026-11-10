import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  asPersistedTelegramRelayState,
  createEmptyPersistedTelegramRelayState,
  type PersistedTelegramRelayState,
} from './state.js';

export function readPersistedTelegramRelayState(
  statePath: string,
  maxProcessedUpdates: number,
): PersistedTelegramRelayState {
  return readPersistedTelegramRelayStateWithHealth(statePath, maxProcessedUpdates).state;
}

/**
 * SPEC-140 FR-7: like `readPersistedTelegramRelayState`, and says whether an
 * existing file could not be read. Such a file is copied aside first, so the
 * next write never destroys the only copy.
 */
export function readPersistedTelegramRelayStateWithHealth(
  statePath: string,
  maxProcessedUpdates: number,
): { state: PersistedTelegramRelayState; damaged: boolean } {
  if (!existsSync(statePath)) {
    return { state: createEmptyPersistedTelegramRelayState(), damaged: false };
  }

  try {
    return {
      state: asPersistedTelegramRelayState(
        JSON.parse(readFileSync(statePath, 'utf8')),
        maxProcessedUpdates,
      ),
      damaged: false,
    };
  } catch {
    try {
      copyFileSync(statePath, `${statePath}.damaged-${Date.now()}`);
    } catch {
      // Best effort: a damaged file that cannot be copied is still treated as damaged.
    }
    return { state: createEmptyPersistedTelegramRelayState(), damaged: true };
  }
}

export function writePersistedTelegramRelayState(
  statePath: string,
  state: PersistedTelegramRelayState,
): void {
  const directory = path.dirname(statePath);
  mkdirSync(directory, { recursive: true });

  const nextBody = JSON.stringify(state, null, 2);
  const tempPath = path.join(
    directory,
    `.${path.basename(statePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    writeFileSync(tempPath, nextBody, 'utf8');
    renameSync(tempPath, statePath);
  } finally {
    if (existsSync(tempPath)) {
      rmSync(tempPath, { force: true });
    }
  }
}
