import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function resolveRepoPath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

test('progress summary implementation lives in design and product wrappers share it', () => {
  const sharedPath = resolveRepoPath('../src/design/components/operator/ProgressSummaryPanel.tsx');
  const productSharedWrapper = readFileSync(
    resolveRepoPath('../src/products/shared/renderer/components/ProgressSummaryPanel.tsx'),
    'utf8',
  );
  const chatWrapper = readFileSync(
    resolveRepoPath('../src/products/chat/renderer/components/ProgressSummaryPanel.tsx'),
    'utf8',
  );
  const workWrapper = readFileSync(
    resolveRepoPath('../src/products/work/renderer/components/ProgressSummaryPanel.tsx'),
    'utf8',
  );
  const codeWrapper = readFileSync(
    resolveRepoPath('../src/products/code/renderer/components/ProgressSummaryPanel.tsx'),
    'utf8',
  );

  assert.match(readFileSync(sharedPath, 'utf8'), /sharedOperatorRunStatusTitle/u);
  assert.match(productSharedWrapper, /design\/components\/operator\/ProgressSummaryPanel/u);
  assert.match(chatWrapper, /shared\/renderer\/components\/ProgressSummaryPanel/u);
  assert.match(workWrapper, /shared\/renderer\/components\/ProgressSummaryPanel/u);
  assert.match(codeWrapper, /shared\/renderer\/components\/ProgressSummaryPanel/u);
});
