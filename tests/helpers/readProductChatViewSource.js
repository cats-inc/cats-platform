import { readFile, readdir } from 'node:fs/promises';

export async function readProductChatViewSource(product) {
  const chatViewSource = await readFile(
    new URL(`../../src/products/${product}/renderer/components/ChatView.tsx`, import.meta.url),
    'utf8',
  );

  if (product === 'chat') {
    return chatViewSource;
  }

  const chatViewDir = new URL('../../src/products/shared/renderer/components/chat-view/', import.meta.url);
  const sharedFiles = (await readdir(chatViewDir))
    .filter((name) => name.endsWith('.tsx'))
    .sort();
  const sharedSources = await Promise.all(
    sharedFiles.map((name) =>
      readFile(new URL(name, chatViewDir), 'utf8')),
  );
  return `${chatViewSource}\n${sharedSources.join('\n')}`;
}
