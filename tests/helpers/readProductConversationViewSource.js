import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

import { resolveProjectRoot } from './projectRoot.js';

/**
 * Source text of the conversation view a product renders. Chat, Code and
 * Work all render the shared `conversation-view/` components, so every
 * product reads the same files; `product` keeps call sites descriptive.
 */
export async function readProductConversationViewSource(product) {
  void product;
  const projectRoot = resolveProjectRoot(import.meta.url);
  const viewDir = path.join(projectRoot, 'src/products/shared/renderer/components/conversation-view');
  const files = (await readdir(viewDir))
    .filter((name) => /\.(ts|tsx)$/u.test(name))
    .sort();
  const sources = await Promise.all(
    files.map((name) => readFile(path.join(viewDir, name), 'utf8')),
  );
  return sources.join('\n');
}
