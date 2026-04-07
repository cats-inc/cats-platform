import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { pickDraftGreeting } from '../src/products/chat/renderer/chatUtils.tsx';
import { NewChatDraft, type NewChatDraftProps } from '../src/products/chat/renderer/components/NewChatDraft.tsx';

function createPayload(): AppShellPayload {
  return {
    chat: {
      bossCatId: null,
      botBindings: [],
      capabilities: {
        maxParallelChats: 5,
      },
      cats: [
        {
          id: 'cat-lead',
          name: 'Milo',
          status: 'active',
          products: ['chat'],
          defaultExecutionTarget: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          defaultModelSelection: null,
        },
      ],
    },
  } as unknown as AppShellPayload;
}

function createProps(overrides: Partial<NewChatDraftProps> = {}): NewChatDraftProps {
  return {
    payload: createPayload(),
    composerDraft: '',
    busy: '',
    greeting: 'Meow. Ready when you are.',
    draftFiles: [],
    draftCwd: null,
    draftCatIds: [],
    plusMenuOpen: false,
    plusMenuRef: { current: null },
    fileInputRef: { current: null },
    bossCatName: 'Boss Cat',
    bossCatAvatarColor: null,
    onComposerChange: () => {},
    onComposerKeyDown: () => {},
    onSendMessage: () => {},
    onTogglePlusMenu: () => {},
    onFileSelect: () => {},
    onPickFolder: () => {},
    onOpenAddCat: () => {},
    onDraftFilesChange: () => {},
    onDraftCwdClear: () => {},
    onToggleDraftCat: () => {},
    autoResize: () => {},
    draftLeadCatId: null,
    onDraftLeadCatChange: () => {},
    draftHighlightedCatId: null,
    onHighlightDraftCat: () => {},
    draftCatModelOverrides: new Map(),
    onDraftCatModelOverride: () => {},
    ...overrides,
  };
}

test('lead-scoped new chat draft renders cat-led copy instead of private chat copy', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftLeadCatId: 'cat-lead',
      })}
    />,
  );

  assert.match(markup, /Cat-led Chat/u);
  assert.match(markup, /Start with Milo/u);
  assert.match(markup, /Ask Milo to take the first pass/u);
  assert.doesNotMatch(markup, /Private Chat/u);
});

test('generic new chat draft with one selected cat renders cat-led copy', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftCatIds: ['cat-lead'],
      })}
    />,
  );

  assert.match(markup, /Cat-led Chat/u);
  assert.match(markup, /Start with Milo/u);
  assert.doesNotMatch(markup, /Group Chat/u);
});

test('generic new chat draft with multiple selected cats keeps a lightweight greeting and group prompts', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftCatIds: ['cat-lead', 'cat-reviewer'],
        payload: {
          chat: {
            ...createPayload().chat,
            cats: [
              ...createPayload().chat.cats,
              {
                id: 'cat-reviewer',
                name: 'Pico',
                status: 'active',
                products: ['chat'],
                defaultExecutionTarget: {
                  provider: 'claude',
                  instance: 'native',
                  model: 'claude-sonnet',
                },
                defaultModelSelection: null,
              },
            ],
          },
        } as unknown as AppShellPayload,
      })}
    />,
  );

  assert.match(markup, /Meow\. Ready when you are\./u);
  assert.match(markup, /split roles, and ask for a coordinated plan/u);
  assert.doesNotMatch(markup, /Cat-led Chat/u);
});

test('group route uses the greeting seam instead of a fixed heading', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryMode: 'group',
        greeting: 'Round up the room.',
      })}
    />,
  );

  assert.match(markup, /Round up the room\./u);
  assert.doesNotMatch(markup, /Start a group chat/u);
});

test('direct-lane draft keeps private chat copy', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftLeadCatId: 'cat-lead',
        allowAddCat: false,
      })}
    />,
  );

  assert.match(markup, /Private Chat/u);
  assert.match(markup, /Private lane for this Cat\./u);
  assert.match(markup, /Ask Milo for a focused update or recommendation/u);
  assert.doesNotMatch(markup, /Cat-led Chat/u);
});

test('draft uses externally supplied starter suggestions before static fallback prompts', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftLeadCatId: 'cat-lead',
        starterSuggestions: [
          {
            id: 'guide-cat-start',
            prompt: 'Guide Cat suggests framing the first deliverable before asking Milo to execute.',
          },
        ],
      })}
    />,
  );

  assert.match(markup, /Guide Cat suggests framing the first deliverable/u);
  assert.doesNotMatch(markup, /Ask Milo to take the first pass/u);
});

test('draft hides starter suggestions when the seam supplies an explicit empty override', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        starterSuggestions: [],
      })}
    />,
  );

  assert.doesNotMatch(markup, /Plan today's priorities/u);
  assert.doesNotMatch(markup, /draftPromptChip/u);
});

test('draft greeting pools can be assigned independently per fresh-chat mode', () => {
  assert.equal(
    pickDraftGreeting('new', {
      pool: ['Solo One', 'Solo Two'],
      random: () => 0,
    }),
    'Solo One',
  );
  assert.equal(
    pickDraftGreeting('group', {
      pool: ['Group One', 'Group Two'],
      random: () => 0.99,
    }),
    'Group Two',
  );
  assert.equal(
    pickDraftGreeting('parallel', {
      pool: ['Parallel One', 'Parallel Two'],
      random: () => 0.51,
    }),
    'Parallel Two',
  );
});
