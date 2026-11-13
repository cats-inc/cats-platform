import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import React from 'react';
import { cleanup, render } from '@testing-library/react';

import { resolveToastAnchor, TOAST_ANCHOR_GAP_PX, useToastAnchor } from '../src/design/components/toastAnchor.ts';

// Toasts sit above the conversation composer instead of over its buttons.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('toasts go just above the composer, centered on it', () => {
  assert.deepEqual(
    resolveToastAnchor({ top: 600, left: 300, width: 400, height: 120 }, { height: 768 }),
    { bottom: 768 - 600 + TOAST_ANCHOR_GAP_PX, x: 500 },
  );
});

test('a hidden or off-screen composer leaves toasts at the bottom of the window', () => {
  assert.equal(resolveToastAnchor({ top: 0, left: 0, width: 0, height: 0 }, { height: 768 }), null);
  assert.equal(resolveToastAnchor({ top: -40, left: 0, width: 400, height: 120 }, { height: 768 }), null);
  assert.equal(resolveToastAnchor({ top: 900, left: 0, width: 400, height: 120 }, { height: 768 }), null);
});

function Composer() {
  const ref = useToastAnchor<HTMLDivElement>();
  return <div ref={ref} data-testid="composer" />;
}

test('a mounted composer sets the anchor and unmounting it removes the anchor', async (t) => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  // A deliberate partial DOMRect: the anchor reads only these fields.
  HTMLElement.prototype.getBoundingClientRect = function rect() {
    return { top: window.innerHeight - 200, left: 100, width: 600, height: 150 } as DOMRect;
  };
  t.after(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
    cleanup();
    resetTestDom();
  });
  const style = document.documentElement.style;
  const view = render(<Composer />);
  await sleep(50);
  assert.equal(style.getPropertyValue('--toast-anchor-bottom'), `${200 + TOAST_ANCHOR_GAP_PX}px`);
  assert.equal(style.getPropertyValue('--toast-anchor-x'), '400px');
  view.unmount();
  await sleep(50);
  assert.equal(style.getPropertyValue('--toast-anchor-bottom'), '');
  assert.equal(style.getPropertyValue('--toast-anchor-x'), '');
});

test('both conversation composers anchor the toasts, and the toast container follows the anchor', () => {
  // Bundled into build/test, so sources are read from the repository root.
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
  assert.match(read('src/products/shared/renderer/components/conversation-view/ConversationComposerArea.tsx'),
    /<div className=\{stackClassName\} ref=\{toastAnchorRef\}>/u);
  assert.match(read('src/products/shared/renderer/components/NewConversationDraft.tsx'),
    /const leadFormJsx = \(\s*<form\s+ref=\{toastAnchorRef\}/u);
  const css = read('src/design/components/toast.css');
  assert.match(css, /bottom: var\(--toast-anchor-bottom, 24px\);/u);
  assert.match(css, /left: var\(--toast-anchor-x, 50%\);/u);
});
