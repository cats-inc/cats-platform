import { readFile } from 'node:fs/promises';

export async function readProductTranscriptAutoScrollSource(product) {
  const target = product === 'chat'
    ? new URL(`../../src/products/${product}/renderer/hooks/useTranscriptAutoScroll.ts`, import.meta.url)
    : new URL('../../src/products/shared/renderer/hooks/useTranscriptAutoScroll.ts', import.meta.url);

  return readFile(target, 'utf8');
}
