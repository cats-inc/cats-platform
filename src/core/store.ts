import type { CatsCoreState } from './types.js';
import { createDefaultCoreState } from './model.js';

export interface CoreStore {
  readCore(): Promise<CatsCoreState>;
  writeCore(state: CatsCoreState): Promise<CatsCoreState>;
}

export class MemoryCoreStore implements CoreStore {
  #state: CatsCoreState;

  constructor(initialState: CatsCoreState = createDefaultCoreState()) {
    this.#state = structuredClone(initialState);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(this.#state);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    this.#state = structuredClone(state);
    return structuredClone(this.#state);
  }
}
