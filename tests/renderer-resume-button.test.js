import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PRODUCT_SURFACES = ['chat', 'work', 'code'];

for (const product of PRODUCT_SURFACES) {
  test(`${product} ChatView renders the resume action as an icon button`, async () => {
    const source = await readFile(
      new URL(`../src/products/${product}/renderer/components/ChatView.tsx`, import.meta.url),
      'utf8',
    );

    assert.match(source, /className="channelActionIconButton"/u);
    assert.match(
      source,
      /data-tooltip=\{resumeBusy \? 'Resuming chat session' : 'Resume chat session'\}/u,
    );
    assert.match(source, /channelActionIconGlyphSpinning/u);
    assert.doesNotMatch(source, /resumeBusy \? 'Resuming\.\.\.' : 'Resume'/u);
  });

  test(`${product} chat-thread styles keep the resume icon button aligned with the side-panel toggle`, async () => {
    const source = await readFile(
      new URL(`../src/products/${product}/renderer/styles/chat-thread.css`, import.meta.url),
      'utf8',
    );

    assert.match(source, /\.channelActionIconButton,\s*\.sidePanelToggle/u);
    assert.match(source, /width:\s*32px;/u);
    assert.match(source, /height:\s*32px;/u);
    assert.match(source, /border-radius:\s*8px;/u);
    assert.match(source, /\.channelActionIconGlyphSpinning/u);
  });
}
