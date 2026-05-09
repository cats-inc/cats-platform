import type { CatsCoreState } from './types.js';
import { createDefaultCoreState } from './model/index.js';

export type CoreStoreListener = (state: CatsCoreState) => void;

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

  constructor(initialState: CatsCoreState = createDefaultCoreState()) {
    this.#state = structuredClone(initialState);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(this.#state);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    this.#state = structuredClone(state);
    return this.#emitCoreChange();
  }

  async updateCore(
    mutator: (state: CatsCoreState) => CatsCoreState | Promise<CatsCoreState>,
  ): Promise<CatsCoreState> {
    const next = await mutator(structuredClone(this.#state));
    this.#state = structuredClone(next);
    return this.#emitCoreChange();
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
      listener(structuredClone(snapshot));
    }
    return snapshot;
  }
}
