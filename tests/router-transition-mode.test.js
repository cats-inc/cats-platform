import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('platform app disables BrowserRouter transition wrapping', () => {
  const source = read('src/app/renderer/main.tsx');
  assert.match(source, /<BrowserRouter unstable_useTransitions=\{false\}>/);
});

test('workspace app mount disables BrowserRouter transition wrapping', () => {
  const source = read('src/products/shared/renderer/mountWorkspaceApp.tsx');
  assert.match(source, /<BrowserRouter unstable_useTransitions=\{false\}>/);
});

test('standalone chat app disables BrowserRouter transition wrapping', () => {
  const source = read('src/products/chat/renderer/main.tsx');
  assert.match(source, /<BrowserRouter unstable_useTransitions=\{false\}>/);
});
