import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { CompanionFeed } from '../src/products/chat/renderer/components/companion/CompanionFeed.tsx';
import type { ChatCat } from '../src/products/chat/api/contracts.ts';

function fixtureCat(): ChatCat {
  return {
    id: 'cat-fixture',
    name: 'Fixture',
    provider: 'claude',
    instance: 'native',
    model: 'sonnet',
    avatarUrl: null,
    avatarColor: null,
    bossEligible: false,
    state: 'idle',
    sleepState: 'awake',
    cwd: null,
  } as unknown as ChatCat;
}

function tabLabelOrder(markup: string): string[] {
  const labels: string[] = [];
  const regex = /role="tab"[^>]*>([^<]+)</gu;
  for (const match of markup.matchAll(regex)) {
    labels.push(match[1]!.trim());
  }
  return labels;
}

test('companion feed renders SPEC-085 tab order with Activity last', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionFeed, { cat: fixtureCat() }),
  );
  assert.deepEqual(
    tabLabelOrder(markup),
    ['Posts', 'Photos', 'Videos', 'Music', 'Files', 'Activity'],
  );
});

test('populated profile renders posts from the projection', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionFeed, {
      cat: fixtureCat(),
      profile: {
        posts: [
          {
            id: 'post:p-1',
            derivedId: 'd-1',
            catId: 'cat-fixture',
            title: 'Real promoted post',
            body: 'projection-driven body',
            tags: [],
            status: 'active',
            originType: 'source',
            originId: 's-1',
            mediaRefs: [],
            sourceIds: ['s-1'],
            promotedAt: '2026-04-28T01:00:00.000Z',
            updatedAt: '2026-04-28T01:00:00.000Z',
          },
        ],
        photos: [],
        videos: [],
        music: [],
        files: [],
      },
    }),
  );
  assert.match(markup, /Real promoted post/u);
  assert.doesNotMatch(markup, /No posts yet\./u);
});

test('empty profile shows the empty-state hint', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionFeed, {
      cat: fixtureCat(),
      profile: { posts: [], photos: [], videos: [], music: [], files: [] },
    }),
  );
  assert.match(markup, /No posts yet\./u);
});
