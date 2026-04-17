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

function createPayload(overrides: Partial<AppShellPayload['chat']> = {}): AppShellPayload {
  return {
    guideCatAssist: {
      codeNewDraft: null,
    },
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
      ...overrides,
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
    draftCatExecutionTargetOverrides: new Map(),
    onDraftCatExecutionTargetOverride: () => {},
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
  assert.equal(NEW_CODE_DRAFT_COPY.executionActionLabel, 'Choose execution target');
  assert.equal(NEW_CODE_DRAFT_COPY.executionEmptyState, 'No execution target set yet.');
  assert.equal(NEW_CODE_DRAFT_COPY.folderSectionTitle, 'Workspace');
  assert.equal(NEW_CODE_DRAFT_COPY.participantsEmptyState, 'No participants available yet.');
  assert.equal(NEW_CODE_DRAFT_COPY.privateSessionEyebrow, 'Focused Code Session');
  assert.equal(NEW_CODE_DRAFT_COPY.privateSessionHeroNote, 'Single-participant coding lane.');
});

test('new code default draft keeps the original shared composer structure without extra header chips', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedExecutionTarget: {
          provider: 'claude',
          instance: 'native',
          model: 'claude-sonnet',
          modelSelection: null,
        },
      })}
    />,
  );

  assert.match(markup, /What should this code session build, fix, or investigate\?/u);
  assert.match(markup, /composerBottomRow[\s\S]*class="audienceChip"/u);
  assert.doesNotMatch(markup, /class="draftHeaderAccessory"/u);
  assert.doesNotMatch(markup, /Choose workspace/u);
  assert.doesNotMatch(markup, /How can I help you today\?/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /class="draftPromptChip"/u);
});

test('new code default draft does not render standalone setup chips between the greeting and composer', () => {
  const markup = renderToStaticMarkup(<NewChatDraft {...createProps()} />);

  assert.doesNotMatch(markup, /Choose workspace/u);
  assert.doesNotMatch(markup, /Choose execution target/u);
  assert.doesNotMatch(markup, /class="draftHeaderAccessory"/u);
  assert.doesNotMatch(markup, /class="draftPromptChip"/u);
});

test('new code default draft prefers payload-backed assist greeting and shows up to three helper chips', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        greeting: 'Legacy code greeting.',
        payload: {
          ...createPayload(),
          guideCatAssist: {
            codeNewDraft: {
              scopeKey: 'code:new:default:default',
              renderSource: 'cache',
              cacheHit: true,
              missing: false,
              stale: false,
              refreshEligible: false,
              surfaceDisabled: false,
              lastFailure: null,
              bundle: {
                bundleId: 'code:new:default:default',
                scope: {
                  surfaceId: 'code:new',
                  surfaceMode: 'default',
                  audienceState: 'default',
                },
                content: {
                  greeting: 'Pick a small coding task.',
                  entryChips: [
                    {
                      id: 'code-pomodoro',
                      label: 'Pomodoro app',
                      prompt: 'Write a small pomodoro timer app.',
                    },
                    {
                      id: 'code-fix-bug',
                      label: 'Fix a bug',
                      prompt: 'Find and fix a bug in this codebase.',
                    },
                    {
                      id: 'code-refactor',
                      label: 'Refactor code',
                      prompt: 'Refactor this code without changing behavior.',
                    },
                    {
                      id: 'code-hidden',
                      label: 'Hidden helper',
                      prompt: 'This helper should not render.',
                    },
                  ],
                },
                provenance: {
                  originMode: 'runtime',
                  refreshContextHash: 'gca:v1:test-code',
                  missionId: null,
                  runId: null,
                },
                freshness: {
                  generatedAt: '2026-04-17T12:00:00.000Z',
                  expiresAt: null,
                  lastRefreshStatus: 'ok',
                },
              },
            },
          },
        } as AppShellPayload,
      })}
    />,
  );

  assert.match(markup, /Pick a small coding task\./u);
  assert.match(markup, />Pomodoro app</u);
  assert.match(markup, />Fix a bug</u);
  assert.match(markup, />Refactor code</u);
  assert.doesNotMatch(markup, />Hidden helper</u);
  assert.doesNotMatch(markup, /Legacy code greeting\./u);
  assert.doesNotMatch(markup, /Choose workspace/u);
  assert.doesNotMatch(markup, /Choose execution target/u);
  assert.doesNotMatch(markup, /class="draftHeaderAccessory"/u);
});

test('new code solo drafts without an explicit direct-lane route do not render the composer stack', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftCatIds: ['cat-lead'],
      })}
    />,
  );

  assert.doesNotMatch(markup, /class="composerCatStack"/u);
});

test('new code direct-lane drafts keep the participant stack in the composer row', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        allowAddCat: false,
        draftCatIds: ['cat-lead'],
        draftDefaultRecipientCatId: 'cat-lead',
      })}
    />,
  );

  assert.match(markup, /Focused Code Session/u);
  assert.match(markup, /Single-participant coding lane\./u);
  assert.match(markup, /class="composerCatStack"/u);
  assert.doesNotMatch(markup, /Private Chat/u);
});

test('new code direct-lane drafts keep the same hero copy when the participant is telegram-bound', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        allowAddCat: false,
        payload: createPayload({
          botBindings: [
            {
              id: 'binding-telegram',
              platform: 'telegram',
              status: 'active',
              catId: 'cat-lead',
              label: 'Telegram',
            },
          ],
        }),
        draftCatIds: ['cat-lead'],
        draftDefaultRecipientCatId: 'cat-lead',
      })}
    />,
  );

  assert.match(markup, /Focused Code Session/u);
  assert.match(markup, /Single-participant coding lane\./u);
  assert.doesNotMatch(markup, /Telegram-bound private lane\./u);
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
