import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { CompanionFeed } from '../src/app/renderer/entities/companion/CompanionFeed.tsx';
import type { ChatCat } from '../src/products/chat/api/contracts.ts';
import type { CompanionProfileReadModel } from '../src/products/chat/companion/profileReadModel.ts';

// Deliberately partial: CompanionFeed only reads the Cat name.
const cat = { id: 'cat-fixture', name: 'Fixture' } as unknown as ChatCat;

const profile: CompanionProfileReadModel = {
  posts: [
    {
      id: 'post:d-1',
      derivedId: 'd-1',
      catId: 'cat-fixture',
      title: 'Agent-published post',
      body: 'Body',
      tags: [],
      status: 'active',
      mediaRefs: [],
      sourceIds: [],
      publishedAt: '2026-09-29T01:00:00.000Z',
      updatedAt: '2026-09-29T01:00:00.000Z',
    },
  ],
  photos: [],
  videos: [],
  music: [],
  files: [],
};

test('entities companion feed offers post removal only when the owner handler is wired', () => {
  const withRemove = renderToStaticMarkup(
    React.createElement(CompanionFeed, { cat, profile, onRemovePost: () => undefined }),
  );
  assert.match(withRemove, /companionActionButton companionActionSecondary[^>]*>Remove</u);

  const readOnly = renderToStaticMarkup(React.createElement(CompanionFeed, { cat, profile }));
  assert.doesNotMatch(readOnly, />Remove</u);
});
