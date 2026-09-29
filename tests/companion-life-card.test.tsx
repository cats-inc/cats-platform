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
  assert.match(markup, /Mochi picks photos by file name and cannot see the pictures\./u);
  assert.match(markup, /aria-pressed="true"[^>]*>On</u);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Save<\/button>/u, 'nothing to save until something changes');
});
