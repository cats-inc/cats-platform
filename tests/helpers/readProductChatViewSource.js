import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

import { resolveProjectRoot } from './projectRoot.js';

export async function readProductChatViewSource(product) {
  const projectRoot = resolveProjectRoot(import.meta.url);
  const chatViewSource = await readFile(
    path.join(projectRoot, `src/products/${product}/renderer/components/ChatView.tsx`),
    'utf8',
  );
  const localChatViewDir = path.join(
    projectRoot,
    `src/products/${product}/renderer/components/chat-view`,
  );
  const localChatViewFiles = product === 'chat'
    ? (await readdir(localChatViewDir)
        .then((entries) => entries.filter((name) => name.endsWith('.tsx')).sort())
        .catch(() => []))
    : [];
  const localSources = await Promise.all(
    localChatViewFiles.map((name) =>
      readFile(path.join(localChatViewDir, name), 'utf8')),
  );

  const consumesSharedChatView = product !== 'chat'
    || chatViewSource.includes('shared/renderer/components/chat-view/');
  if (!consumesSharedChatView) {
    return `${chatViewSource}\n${localSources.join('\n')}`;
  }

  const chatViewDir = path.join(projectRoot, 'src/products/shared/renderer/components/chat-view');
  const sharedFiles = (await readdir(chatViewDir))
    .filter((name) => name.endsWith('.tsx'))
    .sort();
  const sharedSources = await Promise.all(
    sharedFiles.map((name) =>
      readFile(path.join(chatViewDir, name), 'utf8')),
  );
  return `${chatViewSource}\n${localSources.join('\n')}\n${sharedSources.join('\n')}`;
}
