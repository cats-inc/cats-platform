import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
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
  assert.doesNotMatch(markup, /Private Chat/u);
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
  assert.doesNotMatch(markup, /Cat-led Chat/u);
});
