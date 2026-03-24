import { randomUUID } from 'node:crypto';
import {
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
} from './storeState.js';

export function readPersistedTelegramRelayState(
  statePath: string,
  maxProcessedUpdates: number,
): PersistedTelegramRelayState {
  if (!existsSync(statePath)) {
    return createEmptyPersistedTelegramRelayState();
  }

  try {
    return asPersistedTelegramRelayState(
      JSON.parse(readFileSync(statePath, 'utf8')),
      maxProcessedUpdates,
    );
  } catch {
    return createEmptyPersistedTelegramRelayState();
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
