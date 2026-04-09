import { readFile } from 'node:fs/promises';

export async function readProductChatViewSource(product) {
  const chatViewSource = await readFile(
    new URL(`../../src/products/${product}/renderer/components/ChatView.tsx`, import.meta.url),
    'utf8',
  );

  if (product === 'chat') {
    return chatViewSource;
  }

  const sharedTopBarSource = await readFile(
    new URL('../../src/products/shared/renderer/components/chat-view/ChatViewTopBar.tsx', import.meta.url),
    'utf8',
  );
  return `${chatViewSource}\n${sharedTopBarSource}`;
}
