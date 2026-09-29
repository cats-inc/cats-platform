import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import {
  resolveCompanionPresence,
  type CompanionPresencePending,
} from '../src/app/renderer/entities/companion/hooks/useCompanionPresence.ts';
import { CompanionOverviewSection } from '../src/app/renderer/entities/companion/CompanionOverviewSection.tsx';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

const t = createTranslator('en');

// Deliberately partial channel views: presence reads only these three fields.
function lane(leaseStatus: string | null) {
  return {
    channelKind: 'direct_message',
    defaultRecipientCatId: 'cat-1',
    defaultRecipientLeaseStatus: leaseStatus,
  } as unknown as AppShellPayload['chat']['channels'][number];
}

function presenceFor(
  channels: AppShellPayload['chat']['channels'],
  pending: CompanionPresencePending = null,
) {
  return resolveCompanionPresence({ catId: 'cat-1', channels, pending, t });
}

test('without a direct lane there is nothing to wake, and the card says so', () => {
  const presence = presenceFor([]);
  assert.equal(presence.presence, 'sleeping');
  assert.equal(presence.canWake, false);
  assert.equal(presence.canSleep, false);
  assert.equal(presence.needsDirectLane, true);

  const markup = renderToStaticMarkup(React.createElement(CompanionOverviewSection, {
    summary: null,
    recentMemory: [],
    presence,
    onWake: () => undefined,
    onSleep: () => undefined,
    loading: false,
  }));
  assert.match(markup, /Start a direct message to wake this Cat\./u);
  assert.doesNotMatch(markup, />Wake</u);
});

test('direct lane session status drives wake and sleep', () => {
  const sleeping = presenceFor([lane(null)]);
  assert.equal(sleeping.presence, 'sleeping');
  assert.equal(sleeping.canWake, true);
  assert.equal(sleeping.needsDirectLane, false);

  const awake = presenceFor([lane('ready')]);
  assert.equal(awake.presence, 'awake');
  assert.equal(awake.canSleep, true);
  assert.equal(awake.canWake, false);

  const errored = presenceFor([lane('error')]);
  assert.equal(errored.canWake, true);
});

test('a request in flight hides both actions; waking reads as waking up', () => {
  const waking = presenceFor([lane(null)], 'wake');
  assert.equal(waking.presence, 'waking_up');
  assert.equal(waking.label, 'Waking up');
  assert.equal(waking.canWake, false);

  const fallingAsleep = presenceFor([lane('ready')], 'sleep');
  assert.equal(fallingAsleep.presence, 'awake');
  assert.equal(fallingAsleep.canSleep, false);
});
