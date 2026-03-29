import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function resolveRepoPath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

test('trace list implementation lives in design and product wrappers point at it', () => {
  const sharedPath = resolveRepoPath('../src/design/components/operator/TraceList.tsx');
  const chatWrapper = readFileSync(
    resolveRepoPath('../src/products/chat/renderer/components/TraceList.tsx'),
    'utf8',
  );
  const workWrapper = readFileSync(
    resolveRepoPath('../src/products/work/renderer/components/TraceList.tsx'),
    'utf8',
  );
  const codeWrapper = readFileSync(
    resolveRepoPath('../src/products/code/renderer/components/TraceList.tsx'),
    'utf8',
  );

  assert.match(readFileSync(sharedPath, 'utf8'), /operatorEmptyState/u);
  assert.match(chatWrapper, /design\/components\/operator\/TraceList/u);
  assert.match(workWrapper, /design\/components\/operator\/TraceList/u);
  assert.match(codeWrapper, /design\/components\/operator\/TraceList/u);
});
