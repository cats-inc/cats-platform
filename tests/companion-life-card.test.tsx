import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { CompanionLifeCard } from '../src/app/renderer/entities/companion/CompanionLifeCard.tsx';
import { normalizeCompanionLifeProfile } from '../src/products/chat/companion/life/profile.ts';

test('the rhythm card shows the saved rhythm, the photo folder and what the Cat can see', () => {
  const life = {
    ...normalizeCompanionLifeProfile(undefined, '2026-09-29T00:00:00.000Z'),
    bedtime: '22:30',
    photoFolder: 'C:\\Photos\\Mochi',
  };
  const markup = renderToStaticMarkup(
    React.createElement(CompanionLifeCard, { catName: 'Mochi', life, onSave: async () => undefined }),
  );
  assert.match(markup, /Daily rhythm and photos/u);
  assert.match(markup, /id="companion-life-bedtime"[^>]*value="22:30"/u);
  assert.match(markup, /value="07:00"/u);
  assert.match(markup, /value="09:00"/u);
  assert.match(markup, /value="C:\\Photos\\Mochi"/u);
  assert.match(markup, /Mochi can browse this folder, open the photos, and send you one\./u);
  assert.match(markup, /aria-pressed="true"[^>]*>On</u);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Save<\/button>/u, 'nothing to save until something changes');
});

test('the rhythm card names own initiative, its mode and what auto means for this Cat (SPEC-137 FR-1, FR-10)', () => {
  const life = normalizeCompanionLifeProfile(undefined, '2026-09-29T00:00:00.000Z');
  const ordinary = renderToStaticMarkup(
    React.createElement(CompanionLifeCard, { catName: 'Mochi', life, onSave: async () => undefined }),
  );
  assert.match(ordinary, /Own initiative: stays awake on a daily rhythm and does things on its own now and then/u);
  assert.match(ordinary, /<select[^>]*id="companion-life-mode"/u);
  assert.match(ordinary, /<option value="auto" selected="">Automatic: Assist for a Boss Cat, Companion for the others \(now Companion\)<\/option>/u);
  assert.match(ordinary, /<option value="assist">Assist: follow up on work you left unfinished<\/option>/u);
  assert.match(ordinary, /Between bedtime and waking up Mochi sleeps/u);
  const boss = renderToStaticMarkup(
    React.createElement(CompanionLifeCard, { catName: 'Mochi', bossCat: true, life, onSave: async () => undefined }),
  );
  assert.match(boss, /\(now Assist\)<\/option>/u);
});
