import {
  deriveCompanionBoxStatePath,
  resolveCompanionStorageRoot,
} from './companion-box/snapshot.js';
import { FileCompanionBoxStore } from './companion-box/fileStore.js';
import { MemoryCompanionBoxStore } from './companion-box/memoryStore.js';
import type { CompanionBoxStore } from './companion-box/storeTypes.js';

export { deriveCompanionBoxStatePath };
export type {
  CompanionBoxStore,
  CompanionSessionContextInput,
} from './companion-box/storeTypes.js';
export { FileCompanionBoxStore } from './companion-box/fileStore.js';
export { MemoryCompanionBoxStore } from './companion-box/memoryStore.js';

export function createFileBackedCompanionBoxStore(
  chatStatePath: string,
): CompanionBoxStore {
  return new FileCompanionBoxStore(deriveCompanionBoxStatePath(chatStatePath));
}

export function getCompanionStorageRootPath(chatStatePath: string): string {
  return resolveCompanionStorageRoot(deriveCompanionBoxStatePath(chatStatePath));
}
