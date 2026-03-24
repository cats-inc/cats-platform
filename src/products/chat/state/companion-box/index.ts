import {
  deriveCompanionBoxStatePath,
  resolveCompanionStorageRoot,
} from './snapshot.js';
import { FileCompanionBoxStore } from './fileStore.js';
import { MemoryCompanionBoxStore } from './memoryStore.js';
import type { CompanionBoxStore } from './storeTypes.js';

export { deriveCompanionBoxStatePath };
export type {
  CompanionBoxStore,
  CompanionSessionContextInput,
} from './storeTypes.js';
export { FileCompanionBoxStore } from './fileStore.js';
export { MemoryCompanionBoxStore } from './memoryStore.js';

export function createFileBackedCompanionBoxStore(
  chatStatePath: string,
): CompanionBoxStore {
  return new FileCompanionBoxStore(deriveCompanionBoxStatePath(chatStatePath));
}

export function getCompanionStorageRootPath(chatStatePath: string): string {
  return resolveCompanionStorageRoot(deriveCompanionBoxStatePath(chatStatePath));
}
