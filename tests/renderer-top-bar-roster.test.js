import assert from 'node:assert/strict';
import test from 'node:test';
import { readProductChatViewSource } from './helpers/readProductChatViewSource.js';
import { readStylesheet } from './helpers/readStylesheet.js';

const PRODUCT_SURFACES = ['chat', 'work', 'code'];

for (const product of PRODUCT_SURFACES) {
  test(`${product} ChatView keeps the top-bar roster expanded and actor-aware`, async () => {
    const source = await readProductChatViewSource(product);

    assert.match(source, /className="rosterAvatars rosterAvatarsExpanded"/u);
    assert.match(source, /resolveChatViewTopBarPresenceState|const activeTopBarCatIds = useMemo/u);
    assert.match(source, /visibleLiveIndicator\?\.activeCatIds/u);
    assert.match(source, /new Set\(activeTopBarCatIds\)/u);
    assert.match(source, /activeTopBarCatIdSet\.has\(participant\.pulseCatId\)/u);
    if (product === 'chat') {
      assert.match(
        source,
        /resolveChatViewTopBarPresenceState|const activeTopBarParticipantIds = useMemo/u,
      );
      assert.match(source, /new Set\(activeTopBarParticipantIds\)/u);
      assert.match(source, /activeTopBarParticipantIdSet\.has\(participant\.pulseParticipantId\)/u);
      return;
    }

    assert.doesNotMatch(source, /liveIndicator\?\.active && liveIndicator\.catId === cat\.id/u);
  });

  test(`${product} chat-thread styles keep top-bar avatars expanded without hover`, async () => {
    const source = await readStylesheet(
      new URL(`../src/products/${product}/renderer/styles/chat-thread.css`, import.meta.url),
    );

    assert.match(source, /\.rosterAvatarsExpanded \.catAvatar/u);
    assert.match(source, /margin-left:\s*4px;/u);
  });
}
