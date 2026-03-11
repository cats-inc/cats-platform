import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { WorkspaceState } from '../shared/app-shell.js';
import { createDefaultWorkspaceState } from './defaults.js';

export interface WorkspaceStore {
  read(): Promise<WorkspaceState>;
  write(state: WorkspaceState): Promise<WorkspaceState>;
}

export class FileWorkspaceStore implements WorkspaceStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<WorkspaceState> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as WorkspaceState;
    } catch {
      const fallback = createDefaultWorkspaceState();
      await this.write(fallback);
      return fallback;
    }
  }

  async write(state: WorkspaceState): Promise<WorkspaceState> {
    const nextState = structuredClone(state);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf-8');
    return structuredClone(nextState);
  }
}

export class MemoryWorkspaceStore implements WorkspaceStore {
  private state: WorkspaceState;

  constructor(initialState: WorkspaceState = createDefaultWorkspaceState()) {
    this.state = structuredClone(initialState);
  }

  async read(): Promise<WorkspaceState> {
    return structuredClone(this.state);
  }

  async write(state: WorkspaceState): Promise<WorkspaceState> {
    this.state = structuredClone(state);
    return structuredClone(this.state);
  }
}
