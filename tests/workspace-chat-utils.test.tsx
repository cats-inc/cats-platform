import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultCatProducts } from '../src/shared/platformSurfaces.ts';
import {
  compareChatCatsForDisplay,
  createDraftChannelTitle,
  createDraftChannelTopic,
  emptyCatForm,
  executionLabel,
  isChatCat,
  presentChannelTitle,
  resolveBossCatName,
  sortChatCatsForDisplay,
  truncatePath,
} from '../src/products/shared/renderer/workspaceChatUtils.tsx';

function createCat(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    name: 'Alpha',
    roles: [],
    skillProfile: null,
    mcpProfile: null,
    status: 'active',
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-20T10:00:00.000Z',
    archivedAt: null,
    avatarColor: null,
    avatarUrl: null,
    defaultExecutionTarget: {
      provider: 'claude',
      model: 'opus',
      instance: 'native',
    },
    defaultModelSelection: null,
    products: ['chat'],
    memory: {
      updatedAt: null,
      content: null,
    },
    ...overrides,
  } as never;
}

test('emptyCatForm starts from the shared default cat products and chat defaults', () => {
  assert.deepEqual(emptyCatForm(), {
    name: '',
    provider: 'claude',
    instance: '',
    model: '',
    modelSelection: null,
    makeBoss: false,
    products: defaultCatProducts(),
    skillProfile: 'chat-default',
  });
});

test('isChatCat respects explicit products and falls back to default products when missing', () => {
  assert.equal(isChatCat(createCat({
    products: ['chat', 'code'],
  })), true);
  assert.equal(isChatCat(createCat({
    products: ['work'],
  })), false);
  assert.equal(isChatCat(createCat({
    products: null,
  })), true);
});

test('executionLabel mirrors the shared execution label builder for cats', () => {
  assert.equal(
    executionLabel(createCat({
      defaultExecutionTarget: {
        provider: 'codex',
        model: 'gpt-5.4',
        instance: 'native',
      },
    })),
    'Codex-CLI · gpt-5.4',
  );
});

test('chat cat sorting keeps pinned cats first, then active before archived when requested', () => {
  const cats = [
    createCat({
      id: 'cat-zeta',
      name: 'Zeta',
      createdAt: '2026-04-20T10:03:00.000Z',
      status: 'archived',
    }),
    createCat({
      id: 'cat-beta',
      name: 'Beta',
      createdAt: '2026-04-20T10:02:00.000Z',
      status: 'active',
    }),
    createCat({
      id: 'cat-alpha',
      name: 'Alpha',
      createdAt: '2026-04-20T10:01:00.000Z',
      status: 'active',
    }),
  ];

  assert.ok(
    compareChatCatsForDisplay(cats[0], cats[1], {
      archivedLast: true,
    }) > 0,
  );
  assert.deepEqual(
    sortChatCatsForDisplay(cats, {
      bossCatIds: ['cat-beta'],
      archivedLast: true,
    }).map((cat) => cat.id),
    ['cat-beta', 'cat-alpha', 'cat-zeta'],
  );
});

test('draft chat title/topic helpers normalize whitespace and keep fallback names stable', () => {
  assert.equal(
    createDraftChannelTitle('   Ship    the   launch checklist   ', 0),
    'Ship the launch checklist',
  );
  assert.equal(createDraftChannelTitle('   ', 0), 'New chat');
  assert.equal(createDraftChannelTitle('   ', 2), 'New chat 3');
  assert.equal(
    createDraftChannelTitle('x'.repeat(80), 1),
    'x'.repeat(48),
  );
  assert.equal(
    createDraftChannelTopic('  Multi-line \n  topic\tfor   the team  '),
    'Multi-line topic for the team',
  );
  assert.equal(
    createDraftChannelTopic('y'.repeat(140)).length,
    120,
  );
});

test('channel title and path helpers keep user-facing labels compact', () => {
  assert.equal(presentChannelTitle('Untitled chat'), 'New chat');
  assert.equal(presentChannelTitle('  Custom room  '), '  Custom room  ');
  assert.equal(truncatePath('C:/repo/cats-platform/src/index.ts', 20), 'index.ts');
  assert.equal(truncatePath('C:/repo/cats-platform/some-very-long-folder-name', 12), 'some-very...');
  assert.equal(truncatePath('plain-name', 20), 'plain-name');
});

test('resolveBossCatName only returns a live name when the boss cat exists in payload', () => {
  assert.equal(resolveBossCatName({
    chat: {
      bossCatId: 'cat-boss',
      cats: [
        createCat({
          id: 'cat-boss',
          name: 'Boss Cat',
        }),
      ],
    },
  } as never), 'Boss Cat');
  assert.equal(resolveBossCatName({
    chat: {
      bossCatId: 'cat-missing',
      cats: [],
    },
  } as never), null);
  assert.equal(resolveBossCatName({
    chat: {
      bossCatId: null,
      cats: [
        createCat({
          id: 'cat-boss',
          name: 'Boss Cat',
        }),
      ],
    },
  } as never), null);
});
