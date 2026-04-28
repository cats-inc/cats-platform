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

test('legacy tab order ships when the companion-profile IA flag is off', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionFeed, {
      cat: fixtureCat(),
      companionProfileIaEnabled: false,
    }),
  );
  assert.deepEqual(
    tabLabelOrder(markup),
    ['Posts', 'Videos', 'Photos', 'Music', 'Files'],
  );
});

test('PLAN-077 tab order ships when the companion-profile IA flag is on', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionFeed, {
      cat: fixtureCat(),
      companionProfileIaEnabled: true,
    }),
  );
  assert.deepEqual(
    tabLabelOrder(markup),
    ['Posts', 'Photos', 'Videos', 'Music', 'Files', 'Activity'],
  );
});

test('default props (no flag passed) keep the legacy tab order', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionFeed, { cat: fixtureCat() }),
  );
  assert.deepEqual(
    tabLabelOrder(markup),
    ['Posts', 'Videos', 'Photos', 'Music', 'Files'],
  );
});

test('IA path with a populated profile renders posts from the projection rather than the empty state', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionFeed, {
      cat: fixtureCat(),
      companionProfileIaEnabled: true,
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

test('IA path with an empty profile shows the empty-state hint instead of mock posts', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionFeed, {
      cat: fixtureCat(),
      companionProfileIaEnabled: true,
      profile: { posts: [], photos: [], videos: [], music: [], files: [] },
    }),
  );
  assert.match(markup, /No posts yet\./u);
});
