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
  // Frames run at once here: other tests in this process replace requestAnimationFrame with stubs that never call back.
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 0; };
  t.after(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
    globalThis.requestAnimationFrame = originalFrame;
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

function ComposerWithScrollButton({ away }: { away: boolean }) {
  const composer = useToastAnchor<HTMLDivElement>();
  const button = useToastAnchor<HTMLButtonElement>(1);
  return <div ref={composer} data-testid="composer">{away ? <button ref={button} data-testid="latest" /> : null}</div>;
}

test('the scroll-to-latest button takes the toasts above it while it shows, then gives them back', async (t) => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  // The composer's top is 200 px above the window's bottom; the button hangs 48 px over it.
  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
    const top = window.innerHeight - (this.dataset.testid === 'latest' ? 248 : 200);
    return { top, left: 100, width: this.dataset.testid === 'latest' ? 36 : 600, height: 36 } as DOMRect;
  };
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 0; };
  t.after(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
    globalThis.requestAnimationFrame = originalFrame;
    cleanup();
    resetTestDom();
  });
  const style = document.documentElement.style;
  const view = render(<ComposerWithScrollButton away={false} />);
  await sleep(50);
  assert.equal(style.getPropertyValue('--toast-anchor-bottom'), `${200 + TOAST_ANCHOR_GAP_PX}px`);
  view.rerender(<ComposerWithScrollButton away />);
  await sleep(50);
  assert.equal(style.getPropertyValue('--toast-anchor-bottom'), `${248 + TOAST_ANCHOR_GAP_PX}px`, 'above the button');
  view.rerender(<ComposerWithScrollButton away={false} />);
  await sleep(50);
  assert.equal(style.getPropertyValue('--toast-anchor-bottom'), `${200 + TOAST_ANCHOR_GAP_PX}px`, 'back on the composer');
  view.unmount();
  // A composer that mounts with the button already showing: React attaches the button's ref first, and the
  // button still wins.
  const shown = render(<ComposerWithScrollButton away />);
  await sleep(50);
  assert.equal(style.getPropertyValue('--toast-anchor-bottom'), `${248 + TOAST_ANCHOR_GAP_PX}px`, 'above the button from the start');
  shown.unmount();
  await sleep(50);
  assert.equal(style.getPropertyValue('--toast-anchor-bottom'), '');
});

test('both conversation composers anchor the toasts, and the toast container follows the anchor', () => {
  // Bundled into build/test, so sources are read from the repository root.
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
  assert.match(read('src/products/shared/renderer/components/conversation-view/ConversationComposerArea.tsx'),
    /<div className=\{stackClassName\} ref=\{toastAnchorRef\}>/u);
  assert.match(read('src/products/shared/renderer/components/conversation-view/ConversationComposerArea.tsx'),
    /<button\s+ref=\{scrollButtonToastAnchorRef\}\s+className="scrollToBottomButton"/u);
  assert.match(read('src/products/shared/renderer/components/conversation-view/ConversationComposerArea.tsx'),
    /const scrollButtonToastAnchorRef = useToastAnchor<HTMLButtonElement>\(1\);/u);
  assert.match(read('src/products/shared/renderer/components/NewConversationDraft.tsx'),
    /const leadFormJsx = \(\s*<form\s+ref=\{toastAnchorRef\}/u);
  const css = read('src/design/components/toast.css');
  assert.match(css, /bottom: var\(--toast-anchor-bottom, 24px\);/u);
  assert.match(css, /left: var\(--toast-anchor-x, 50%\);/u);
});
