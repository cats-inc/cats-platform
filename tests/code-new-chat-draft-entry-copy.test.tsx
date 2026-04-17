import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/code/api/contracts.ts';
import {
  NewChatDraft,
  NEW_CODE_DRAFT_COPY,
  type NewChatDraftProps,
} from '../src/products/code/renderer/components/NewChatDraft.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

function createPayload(): AppShellPayload {
  return {
    chat: {
      bossCatId: null,
      botBindings: [],
      capabilities: {
        maxCats: 5,
        maxChatParticipants: 5,
        maxAudienceParticipants: 3,
        maxParallelChats: 5,
      },
      cats: [
        {
          id: 'cat-lead',
          name: 'Milo',
          avatarColor: '#7A5B3A',
          avatarUrl: null,
          status: 'active',
          products: ['chat', 'code'],
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
    busy: clearBusyState(),
    greeting: 'Ready to code.',
    draftFiles: [],
    draftCwd: null,
    draftCatIds: [],
    draftTemporaryParticipants: [],
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
    onAddDraftTemporaryParticipant: () => {},
    onRemoveDraftTemporaryParticipant: () => {},
    onUpdateDraftTemporaryParticipant: () => {},
    autoResize: () => {},
    draftDefaultRecipientCatId: null,
    onDraftDefaultRecipientChange: () => {},
    draftHighlightedCatId: null,
    onHighlightDraftCat: () => {},
    draftCatModelOverrides: new Map(),
    onDraftCatModelOverride: () => {},
    ...overrides,
  };
}

test('new code draft publishes code-specific copy overrides for the shared workspace draft', () => {
  assert.equal(NEW_CODE_DRAFT_COPY.greeting, 'Ready to code.');
  assert.equal(
    NEW_CODE_DRAFT_COPY.composerPlaceholder,
    'What should this code session build, fix, or investigate?',
  );
  assert.equal(NEW_CODE_DRAFT_COPY.sidePanelTitle, 'New Code Setup');
  assert.equal(NEW_CODE_DRAFT_COPY.executionSectionTitle, 'Execution');
  assert.equal(NEW_CODE_DRAFT_COPY.executionEmptyState, 'No execution target set yet.');
  assert.equal(NEW_CODE_DRAFT_COPY.folderSectionTitle, 'Workspace');
});

test('new code default draft renders the code-specific placeholder and shared workspace chip treatment', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedModel: {
          provider: 'claude',
          instance: 'native',
          model: 'claude-sonnet',
          modelSelection: null,
        },
      })}
    />,
  );

  assert.match(markup, /What should this code session build, fix, or investigate\?/u);
  assert.match(markup, /class="modelSelectorChip"/u);
  assert.doesNotMatch(markup, /How can I help you today\?/u);
  assert.doesNotMatch(markup, /class="audienceChip"/u);
});

test('team code and peer code drafts continue to delegate to the shared chat draft flow', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryMode: 'group',
        draftTemporaryParticipants: [
          {
            participantId: 'participant-inline',
            name: 'Inline Reviewer',
            provider: 'gemini',
            instance: 'native',
            model: 'gemini-3.1-pro',
            modelSelection: null,
            roleHint: 'Counterpoint',
          },
        ],
      })}
    />,
  );

  assert.match(markup, /Add another model to collaborate/u);
  assert.match(markup, /How can I help you today\?/u);
  assert.match(markup, /class="audienceChip"/u);
  assert.doesNotMatch(markup, /What should this code session build, fix, or investigate\?/u);
});
