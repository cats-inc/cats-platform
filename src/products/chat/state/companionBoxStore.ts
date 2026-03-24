import {
  deriveCompanionBoxStatePath,
  resolveCompanionStorageRoot,
} from './companionBoxSnapshot.js';
import { FileCompanionBoxStore } from './companionBoxFileStore.js';
import { MemoryCompanionBoxStore } from './companionBoxMemoryStore.js';
import type { CompanionBoxStore } from './companionBoxStoreTypes.js';

export { deriveCompanionBoxStatePath };
export type {
  CompanionBoxStore,
  CompanionSessionContextInput,
} from './companionBoxStoreTypes.js';
export { FileCompanionBoxStore } from './companionBoxFileStore.js';
export { MemoryCompanionBoxStore } from './companionBoxMemoryStore.js';

export function createFileBackedCompanionBoxStore(
  chatStatePath: string,
): CompanionBoxStore {
  return new FileCompanionBoxStore(deriveCompanionBoxStatePath(chatStatePath));
}

export function getCompanionStorageRootPath(chatStatePath: string): string {
  return resolveCompanionStorageRoot(deriveCompanionBoxStatePath(chatStatePath));
}
