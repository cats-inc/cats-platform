import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function resolveRepoPath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

test('progress summary implementation lives in design and product wrappers point at it', () => {
  const sharedPath = resolveRepoPath('../src/design/components/operator/ProgressSummaryPanel.tsx');
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

  assert.match(readFileSync(sharedPath, 'utf8'), /Run status/u);
  assert.match(chatWrapper, /design\/components\/operator\/ProgressSummaryPanel/u);
  assert.match(workWrapper, /design\/components\/operator\/ProgressSummaryPanel/u);
  assert.match(codeWrapper, /design\/components\/operator\/ProgressSummaryPanel/u);
});
