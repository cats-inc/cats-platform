import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  clonePlatformAuthState,
  createEmptyPlatformAuthState,
  normalizePlatformAuthState,
  type PlatformAuthStateReadStatus,
} from './state.js';
import type { PlatformAuthState } from './types.js';
import { resolvePlatformAuthStatePathFromChatState } from '../../shared/platformPaths.js';

export interface PlatformAuthStore {
  readState(): Promise<PlatformAuthState>;
  readStateStatus(): Promise<PlatformAuthStateReadStatus>;
  writeState(state: PlatformAuthState): Promise<PlatformAuthState>;
  updateState(
    mutator: (state: PlatformAuthState) => PlatformAuthState | Promise<PlatformAuthState>,
  ): Promise<PlatformAuthState>;
}

abstract class BasePlatformAuthStore implements PlatformAuthStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly now: () => Date = () => new Date()) {}

  protected currentDate(): Date {
    return this.now();
  }

  protected abstract readSnapshotStatus(): Promise<PlatformAuthStateReadStatus>;
  protected abstract writeSnapshot(state: PlatformAuthState): Promise<void>;

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release: () => void = () => {};
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async readStateStatus(): Promise<PlatformAuthStateReadStatus> {
    await this.mutationQueue;
    const result = await this.readSnapshotStatus();
    return result.status === 'ready'
      ? { status: 'ready', state: clonePlatformAuthState(result.state) }
      : result;
  }

  async readState(): Promise<PlatformAuthState> {
    await this.mutationQueue;
    const result = await this.readSnapshotStatus();
    if (result.status === 'ready') {
      return clonePlatformAuthState(result.state);
    }
    if (result.status === 'corrupt') {
      throw result.error;
    }
    const empty = createEmptyPlatformAuthState(this.currentDate());
    await this.writeSnapshot(empty);
    return clonePlatformAuthState(empty);
  }

  async writeState(state: PlatformAuthState): Promise<PlatformAuthState> {
    return this.runExclusive(async () => {
      const next = {
        ...clonePlatformAuthState(state),
        updatedAt: this.currentDate().toISOString(),
      };
      await this.writeSnapshot(next);
      return clonePlatformAuthState(next);
    });
  }

  async updateState(
    mutator: (state: PlatformAuthState) => PlatformAuthState | Promise<PlatformAuthState>,
  ): Promise<PlatformAuthState> {
    return this.runExclusive(async () => {
      const result = await this.readSnapshotStatus();
      if (result.status === 'corrupt') {
        throw result.error;
      }
      const current = result.status === 'ready'
        ? clonePlatformAuthState(result.state)
        : createEmptyPlatformAuthState(this.currentDate());
      const next = {
        ...clonePlatformAuthState(await mutator(current)),
        updatedAt: this.currentDate().toISOString(),
      };
      await this.writeSnapshot(next);
      return clonePlatformAuthState(next);
    });
  }
}

export class MemoryPlatformAuthStore extends BasePlatformAuthStore {
  private state: PlatformAuthState;

  constructor(
    initialState?: PlatformAuthState,
    now?: () => Date,
  ) {
    super(now);
    this.state = clonePlatformAuthState(
      initialState ?? createEmptyPlatformAuthState(now?.() ?? new Date()),
    );
  }

  protected async readSnapshotStatus(): Promise<PlatformAuthStateReadStatus> {
    return { status: 'ready', state: clonePlatformAuthState(this.state) };
  }

  protected async writeSnapshot(state: PlatformAuthState): Promise<void> {
    this.state = clonePlatformAuthState(state);
  }
}

export class FileBackedPlatformAuthStore extends BasePlatformAuthStore {
  constructor(
    private readonly statePath: string,
    now?: () => Date,
  ) {
    super(now);
  }

  protected async readSnapshotStatus(): Promise<PlatformAuthStateReadStatus> {
    try {
      const raw = await readFile(this.statePath, 'utf-8');
      return {
        status: 'ready',
        state: normalizePlatformAuthState(JSON.parse(raw) as unknown),
      };
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return { status: 'missing' };
      }
      return {
        status: 'corrupt',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  protected async writeSnapshot(state: PlatformAuthState): Promise<void> {
    await mkdir(path.dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  }
}

export function createFileBackedPlatformAuthStore(
  chatStatePath: string,
  now?: () => Date,
): PlatformAuthStore {
  return new FileBackedPlatformAuthStore(
    resolvePlatformAuthStatePathFromChatState(chatStatePath),
    now,
  );
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
