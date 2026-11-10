import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { TelegramOwnerRow } from '../src/products/shared/renderer/components/cats/TelegramOwnerRow.tsx';

const actions = {
  reset: async () => ({ owner: { state: 'open' as const, since: '2026-11-11T00:00:00.000Z' } }),
  choose: async () => ({ owner: { state: 'open' as const, since: '2026-11-11T00:00:00.000Z' } }),
};

test('the Telegram owner row names the owner and how it was set, with a reset (SPEC-140 FR-8)', () => {
  const markup = renderToStaticMarkup(React.createElement(TelegramOwnerRow, {
    bindingId: 'binding-1',
    actions,
    owner: {
      state: 'pinned',
      userId: '111',
      displayName: 'Kenny',
      username: 'kenny',
      pinnedAt: '2026-11-11T00:00:00.000Z',
      how: 'first_message',
    },
  }));
  assert.match(markup, /data-owner-state="pinned"/u);
  assert.match(markup, /Telegram owner: Kenny · @kenny · 111/u, 'a copied display name cannot hide who it is');
  assert.match(markup, /The first account that messaged this bot/u);
  assert.match(markup, />Reset</u);
  assert.match(markup, /Only the owner&#x27;s messages reach this Cat/u);
});

test('the row says who becomes the owner when nobody is pinned, and lists the chats to choose from (SPEC-140 FR-8)', () => {
  const open = renderToStaticMarkup(React.createElement(TelegramOwnerRow, {
    bindingId: 'binding-1',
    actions,
    owner: { state: 'open', since: '2026-11-11T00:00:00.000Z' },
  }));
  assert.match(open, /Waiting for the owner: the first Telegram account to message this bot becomes its owner\./u);
  assert.doesNotMatch(open, />Reset</u);

  const choose = renderToStaticMarkup(React.createElement(TelegramOwnerRow, {
    bindingId: 'binding-1',
    actions,
    owner: {
      state: 'choose',
      since: '2026-11-11T00:00:00.000Z',
      candidates: [
        { userId: '222', displayName: null, username: 'second', lastInboundAt: '2026-11-09T00:00:00.000Z', lastMessagePreview: 'see you tomorrow' },
        { userId: '111', displayName: null, username: null, lastInboundAt: null },
      ],
    },
  }));
  assert.match(choose, /Until you pick yours, Telegram messages to it are ignored\./u);
  assert.match(choose, /@second/u);
  assert.match(choose, /“see you tomorrow”/u);
  assert.match(choose, />111</u, 'an account without a name shows its id');
  assert.match(choose, /@second · 222/u);
  assert.equal((choose.match(/>This is me</gu) ?? []).length, 2);
  assert.match(choose, />None of these is me</u, 'an owner who is not listed can start over');

  assert.match(choose, />Refresh</u);

  const collecting = renderToStaticMarkup(React.createElement(TelegramOwnerRow, {
    bindingId: 'binding-1',
    actions,
    owner: { state: 'choose', since: '2026-11-11T00:00:00.000Z', candidates: [] },
  }));
  assert.match(collecting, /send this bot a message from your own Telegram, then refresh and pick yourself/u);
  assert.match(collecting, />Refresh</u);
  assert.doesNotMatch(collecting, /None of these is me/u);

  assert.equal(renderToStaticMarkup(React.createElement(TelegramOwnerRow, { bindingId: 'b', owner: null, actions })), '');
});
