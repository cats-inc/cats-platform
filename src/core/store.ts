import { isDeepStrictEqual } from 'node:util';

import type { CatsCoreState } from './types.js';
import { createDefaultCoreState } from './model/index.js';

// Listener input is a snapshot and must be treated as read-only by subscribers.
export type CoreStoreListener = (state: CatsCoreState) => void;
export type CoreStoreDiagnosticReporter = (
  scope: string,
  details: Record<string, unknown>,
) => void;

// Fields on `CatsCoreState` that change on every write but do not carry
// semantic meaning for downstream subscribers. Add to this set if the shape
// ever grows other write-time-only metadata (e.g., `revisionId`,
// `lastSyncedAt`); otherwise spurious listener notifications will fire on
// every write.
const IGNORED_NOTIFICATION_FIELDS: ReadonlySet<string> = new Set(['updatedAt']);

function withoutIgnoredFields(core: CatsCoreState): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(core)) {
    if (!IGNORED_NOTIFICATION_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

export function hasSubstantiveCoreChange(
  previous: CatsCoreState,
  next: CatsCoreState,
): boolean {
  return !isDeepStrictEqual(withoutIgnoredFields(previous), withoutIgnoredFields(next));
}

export interface CoreStore {
  readCore(): Promise<CatsCoreState>;
  writeCore(state: CatsCoreState): Promise<CatsCoreState>;
  updateCore(
    mutator: (state: CatsCoreState) => CatsCoreState | Promise<CatsCoreState>,
  ): Promise<CatsCoreState>;
  subscribeCore?(listener: CoreStoreListener): () => void;
}

export class MemoryCoreStore implements CoreStore {
  #state: CatsCoreState;
  #listeners = new Set<CoreStoreListener>();
  #diagnosticReporter: CoreStoreDiagnosticReporter;

  constructor(
    initialState: CatsCoreState = createDefaultCoreState(),
    diagnosticReporter: CoreStoreDiagnosticReporter = reportCoreStoreDiagnostic,
  ) {
    this.#state = structuredClone(initialState);
    this.#diagnosticReporter = diagnosticReporter;
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(this.#state);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    const previous = this.#state;
    this.#state = structuredClone(state);
    if (hasSubstantiveCoreChange(previous, this.#state)) {
      return this.#emitCoreChange();
    }
    return structuredClone(this.#state);
  }

  async updateCore(
    mutator: (state: CatsCoreState) => CatsCoreState | Promise<CatsCoreState>,
  ): Promise<CatsCoreState> {
    const previous = this.#state;
    const next = await mutator(structuredClone(this.#state));
    this.#state = structuredClone(next);
    if (hasSubstantiveCoreChange(previous, this.#state)) {
      return this.#emitCoreChange();
    }
    return structuredClone(this.#state);
  }

  subscribeCore(listener: CoreStoreListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emitCoreChange(): CatsCoreState {
    const snapshot = structuredClone(this.#state);
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.#diagnosticReporter('core_listener_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return snapshot;
  }
}

const reportCoreStoreDiagnostic: CoreStoreDiagnosticReporter = (
  scope: string,
  details: Record<string, unknown>,
): void => {
  const serialized = Object.entries(details)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');
  console.error(`[cats-platform-core-store] ${scope}${serialized ? ` ${serialized}` : ''}`);
};
