import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/work/api/contracts.ts';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from '../src/products/work/renderer/components/NewChatDraft.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

function createPayload(overrides: Partial<AppShellPayload['chat']> = {}): AppShellPayload {
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
          products: ['chat', 'work'],
          defaultExecutionTarget: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          defaultModelSelection: null,
        },
      ],
      ...overrides,
    },
  } as unknown as AppShellPayload;
}

function createProps(overrides: Partial<NewChatDraftProps> = {}): NewChatDraftProps {
  return {
    payload: createPayload(),
    composerDraft: '',
    busy: clearBusyState(),
    greeting: 'Ready to work.',
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
    draftCatExecutionTargetOverrides: new Map(),
    onDraftCatExecutionTargetOverride: () => {},
    ...overrides,
  };
}

test('advanced draft controls expose collaborator and compare buttons on the default work draft', () => {
  const target = {
    provider: 'claude',
    instance: 'native',
    model: 'claude-sonnet',
    modelSelection: null,
  } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        payload: createPayload({
          advancedDraftControls: {
            chat: false,
            code: false,
            work: true,
          },
        }),
        selectedExecutionTarget: target,
        onQuickAddDraftTemporaryParticipant: () => {},
        onAddParallelTarget: () => {},
      })}
    />,
  );

  const addButtonMatches = markup.match(/class="parallelAddButton"/gu) ?? [];

  assert.equal(addButtonMatches.length, 2);
  assert.match(markup, /aria-label="Add another model to collaborate"/u);
  assert.match(markup, /aria-label="Add parallel chat"/u);
  assert.doesNotMatch(markup, /Add another model to compare/u);
});

test('advanced draft controls keep +Group work drafts empty and expose compare setup', () => {
  const target = {
    provider: 'claude',
    instance: 'native',
    model: 'claude-sonnet',
    modelSelection: null,
  } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        payload: createPayload({
          advancedDraftControls: {
            chat: false,
            code: false,
            work: true,
          },
        }),
        selectedExecutionTarget: target,
        parallelTargets: [target],
        onQuickAddDraftTemporaryParticipant: () => {},
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /aria-label="Add another model to collaborate"/u);
  assert.match(markup, /aria-label="Add parallel chat"/u);
  assert.doesNotMatch(markup, /class="composerGroupAvatarSlot"/u);
  assert.doesNotMatch(markup, /Add another model to compare/u);
});

test('advanced draft controls keep +Parallel work drafts on one lead target, expose collaborator setup, and preserve compare hint copy', () => {
  const target = {
    provider: 'claude',
    instance: 'native',
    model: 'claude-sonnet',
    modelSelection: null,
  } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'parallel',
        payload: createPayload({
          advancedDraftControls: {
            chat: false,
            code: false,
            work: true,
          },
        }),
        selectedExecutionTarget: target,
        parallelTargets: [target],
        onQuickAddDraftTemporaryParticipant: () => {},
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /aria-label="Add another model to collaborate"/u);
  assert.match(markup, /aria-label="Add parallel chat"/u);
  assert.match(markup, /Add another model to compare/u);
  assert.doesNotMatch(markup, /class="parallelStubStack"/u);
});
