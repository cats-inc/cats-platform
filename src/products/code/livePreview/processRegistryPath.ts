import path from 'node:path';

import { resolvePlatformStorageLayout } from '../../../shared/platformPaths.js';

/** `<platform>/state/code-live-preview-processes.json`, beside the chat state. */
export function resolveCodeLivePreviewProcessRegistryPath(chatStatePath: string): string {
  let stateDir: string;
  try {
    stateDir = resolvePlatformStorageLayout(chatStatePath).stateDir;
  } catch {
    // Tests and tools may point the chat state elsewhere; keep the file beside it.
    stateDir = path.dirname(path.resolve(chatStatePath));
  }
  return path.join(stateDir, 'code-live-preview-processes.json');
}
