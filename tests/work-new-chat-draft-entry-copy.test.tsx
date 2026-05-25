import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { MemoryRouter } from 'react-router';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
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
    draftSurface: 'work',
    onDraftSurfaceChange: () => {},
    ...overrides,
  };
}

function renderDraft(props: NewChatDraftProps, locale?: 'zh-TW'): string {
  const draft = (
    <MemoryRouter>
      <NewChatDraft {...props} />
    </MemoryRouter>
  );
  return renderToStaticMarkup(
    locale ? (
      <I18nProvider locale={locale}>
        {draft}
      </I18nProvider>
    ) : draft,
  );
}

test('work starter chips localize in zh-TW', () => {
  const markup = renderDraft(createProps(), 'zh-TW');

  assert.match(markup, /開始專案/u);
  assert.match(markup, /新增任務/u);
  assert.match(markup, /規劃衝刺/u);
  assert.match(markup, /安排檢視/u);
  assert.match(markup, /整理待辦/u);
  assert.doesNotMatch(markup, /Start a project/u);
  assert.doesNotMatch(markup, /Triage backlog/u);
});

test('advanced draft controls expose collaborator and compare buttons on the default work draft', () => {
  const target = {
    provider: 'claude',
    instance: 'native',
    model: 'claude-sonnet',
    modelSelection: null,
  } as const;
  const markup = renderDraft(createProps({
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
  }));

  const collaborateMatches = markup.match(/class="parallelAddButton"/gu) ?? [];
  const compareSlotMatches = markup.match(/draftCompareCarouselAddBranch/gu) ?? [];

  assert.equal(collaborateMatches.length, 1);
  assert.ok(compareSlotMatches.length >= 1);
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
  const markup = renderDraft(createProps({
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
  }));

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
  const markup = renderDraft(createProps({
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
  }));

  assert.match(markup, /aria-label="Add another model to collaborate"/u);
  assert.match(markup, /aria-label="Add parallel chat"/u);
  assert.match(markup, /Add another model to compare/u);
  assert.doesNotMatch(markup, /class="parallelStubStack"/u);
});

test('work draft presets expose the screenshot attachment action when wired', () => {
  const target = {
    provider: 'claude',
    instance: 'native',
    model: 'claude-sonnet',
    modelSelection: null,
  } as const;
  const markups = [
    renderDraft(createProps({
      plusMenuOpen: true,
      onTakeScreenshot: () => {},
    })),
    renderDraft(createProps({
      entryPreset: 'group',
      plusMenuOpen: true,
      selectedExecutionTarget: target,
      onTakeScreenshot: () => {},
    })),
    renderDraft(createProps({
      entryPreset: 'parallel',
      parallelTargets: [target],
      plusMenuOpen: true,
      selectedExecutionTarget: target,
      onTakeScreenshot: () => {},
    })),
    renderDraft(createProps({
      allowAddCat: false,
      draftCatIds: ['cat-lead'],
      draftDefaultRecipientCatId: 'cat-lead',
      plusMenuOpen: true,
      onTakeScreenshot: () => {},
    })),
  ];

  for (const markup of markups) {
    assert.match(markup, /Add photos and files/u);
    assert.match(markup, /Take screenshot/u);
    assert.match(
      markup,
      /<button class="composerPlusMenuItem" type="button"[^>]*>\s*<svg[^>]*aria-hidden="true"[\s\S]*Take screenshot/u,
    );
  }
});
