import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { writeDurableFile } from '../persistence/state-db/atomicFile.js';
import type { DirectorySnapshot } from './contracts.js';
import {
  createEmptyDirectorySnapshot,
  deriveDirectoryStatePath,
  parseDirectorySnapshot,
  serializeDirectorySnapshot,
} from './snapshot.js';

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * The Clowder and Cattery file. Every read goes to disk, so a Platform data
 * reset that removes the file leaves nothing cached to write back. Writes run
 * one at a time and replace the file atomically.
 */
export class FileDirectoryStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly filePath: string) {}

  private async readFromDisk(): Promise<DirectorySnapshot> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return createEmptyDirectorySnapshot(new Date(0).toISOString());
      throw error;
    }
    return parseDirectorySnapshot(raw);
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: () => void = () => {};
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async read(): Promise<DirectorySnapshot> {
    return this.exclusive(() => this.readFromDisk());
  }

  /**
   * Applies one mutation to the current file. The file is written only when the
   * mutation changed something; a thrown error writes nothing.
   */
  async update<T>(
    mutate: (snapshot: DirectorySnapshot) => { snapshot: DirectorySnapshot; result: T },
  ): Promise<{ snapshot: DirectorySnapshot; result: T }> {
    return this.exclusive(async () => {
      const current = await this.readFromDisk();
      const next = mutate(structuredClone(current));
      if (!isDeepStrictEqual(next.snapshot, current)) {
        await writeDurableFile(this.filePath, serializeDirectorySnapshot(next.snapshot));
      }
      return { snapshot: structuredClone(next.snapshot), result: next.result };
    });
  }
}

const stores = new Map<string, FileDirectoryStore>();

/** One store per file, so every writer in this process shares one queue. */
export function directoryStoreFor(chatStatePath: string): FileDirectoryStore {
  const filePath = path.resolve(deriveDirectoryStatePath(chatStatePath));
  const key = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
  let store = stores.get(key);
  if (!store) {
    store = new FileDirectoryStore(filePath);
    stores.set(key, store);
  }
  return store;
}
