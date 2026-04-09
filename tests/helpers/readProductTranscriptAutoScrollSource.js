import { readFile } from 'node:fs/promises';

export async function readProductTranscriptAutoScrollSource(product) {
  const productTarget = new URL(
    `../../src/products/${product}/renderer/hooks/useTranscriptAutoScroll.ts`,
    import.meta.url,
  );
  const sharedTarget = new URL(
    '../../src/products/shared/renderer/hooks/useTranscriptAutoScroll.ts',
    import.meta.url,
  );
  const productSource = await readFile(productTarget, 'utf8');

  if (productSource.includes('shared/renderer/hooks/useTranscriptAutoScroll.js')) {
    return readFile(sharedTarget, 'utf8');
  }

  return productSource;
}
