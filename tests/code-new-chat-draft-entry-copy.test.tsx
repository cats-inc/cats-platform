import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import type { AppShellPayload } from '../src/products/code/api/contracts.ts';
import {
  buildCodeNewChatDraftSidePanelSections,
  NEW_CODE_CHAT_DRAFT_SIDE_PANEL_COPY,
  NewChatDraft,
  NEW_CODE_DRAFT_COPY,
  resolveCodeNewChatDraftSurfaceKind,
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
    draftSurface: 'code',
    onDraftSurfaceChange: () => {},
    draftDefaultRecipientCatId: null,
    onDraftDefaultRecipientChange: () => {},
    draftHighlightedCatId: null,
    onHighlightDraftCat: () => {},
    draftCatExecutionTargetOverrides: new Map(),
    onDraftCatExecutionTargetOverride: () => {},
    ...overrides,
  };
}

function createCodeAssistPayload(): AppShellPayload {
  return {
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
                label: 'Build a pomodoro app',
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
                id: 'code-write-tests',
                label: 'Write tests',
                prompt: 'Add tests for the code we last touched.',
              },
              {
                id: 'cross:work:start-project',
                label: 'Start a project',
                prompt: 'Start a small project to track milestones.',
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
  } as AppShellPayload;
}

test('new code draft publishes code-specific copy overrides for the shared workspace draft', () => {
  assert.equal(NEW_CODE_DRAFT_COPY.greeting, 'Ready to code.');
  assert.equal(
    NEW_CODE_DRAFT_COPY.composer?.placeholder,
    'What should this code session build, fix, or investigate?',
  );
  assert.equal(NEW_CODE_DRAFT_COPY.sidePanel?.title, 'New Code Setup');
  assert.equal(NEW_CODE_DRAFT_COPY.execution?.sectionTitle, 'Execution');
  assert.equal(NEW_CODE_DRAFT_COPY.execution?.actionLabel, 'Choose execution target');
  assert.equal(NEW_CODE_DRAFT_COPY.execution?.emptyState, 'No execution target set yet.');
  assert.equal(NEW_CODE_DRAFT_COPY.folder?.sectionTitle, 'Codespace');
  assert.equal(NEW_CODE_DRAFT_COPY.participants?.emptyState, 'No participants available yet.');
  assert.equal(NEW_CODE_CHAT_DRAFT_SIDE_PANEL_COPY.title, 'New Code Setup');
  assert.equal(
    NEW_CODE_CHAT_DRAFT_SIDE_PANEL_COPY.participants?.groupSectionTitle,
    'Participants',
  );
  assert.equal(NEW_CODE_CHAT_DRAFT_SIDE_PANEL_COPY.execution?.sectionTitle, 'Execution');
  assert.equal(NEW_CODE_CHAT_DRAFT_SIDE_PANEL_COPY.folder?.sectionTitle, 'Codespace');
});

test('new code draft resolves product-owned surfaces before shared primitive render', () => {
  assert.equal(
    resolveCodeNewChatDraftSurfaceKind({
      draftDefaultRecipientCatId: 'cat-lead',
      entryPreset: 'parallel',
    }),
    'direct-lane',
  );
  assert.equal(
    resolveCodeNewChatDraftSurfaceKind({
      draftDefaultRecipientCatId: null,
      entryPreset: 'default',
    }),
    'default',
  );
  assert.equal(
    resolveCodeNewChatDraftSurfaceKind({
      draftDefaultRecipientCatId: null,
      entryPreset: 'group',
    }),
    'team',
  );
  assert.equal(
    resolveCodeNewChatDraftSurfaceKind({
      draftDefaultRecipientCatId: null,
      entryPreset: 'parallel',
    }),
    'peer',
  );
});

test('new code draft owns shared side panel sections through its product builder', () => {
  const sections = buildCodeNewChatDraftSidePanelSections({
    payload: createPayload({ cats: [] }),
    chatCats: [],
    draftCatIds: [],
    draftHighlightedCatId: null,
    effectiveDefaultRecipientCat: null,
    isGroupDraft: true,
    isDirectLaneContext: false,
    isParallelMode: false,
    groupDraftSelectionLabel: 'No participants selected.',
    assistantPresets: [],
    draftTemporaryParticipants: [],
    editingTemporaryParticipantId: null,
    editingTemporaryParticipantName: '',
    temporaryParticipantFormOpen: false,
    temporaryParticipantForm: {
      roleHint: '',
      provider: 'claude',
      instance: 'native',
      model: 'claude-sonnet',
      modelSelection: null,
    },
    hasReachedGroupParticipantLimit: false,
    isSubmittingFirstTurn: false,
    defaultRecipientCat: null,
    activePanelExecutionTarget: null,
    onToggleDraftCat: () => {},
    onHighlightDraftCat: () => {},
    onAddDraftTemporaryParticipant: () => {},
    onRemoveDraftTemporaryParticipant: () => {},
    onBeginTemporaryParticipantRename: () => {},
    onCancelTemporaryParticipantRename: () => {},
    onSubmitTemporaryParticipantRename: () => {},
    onEditingTemporaryParticipantNameChange: () => {},
    onTemporaryParticipantFormChange: () => {},
    createTemporaryParticipantFormValue: () => ({
      roleHint: '',
      provider: 'claude',
      instance: 'native',
      model: 'claude-sonnet',
      modelSelection: null,
    }),
    onTemporaryParticipantFormOpenChange: () => {},
    onSubmitTemporaryParticipant: () => {},
    draftCwd: null,
    draftRuntimeSessionPolicy: {
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    },
    onDraftRuntimeSessionPolicyChange: () => {},
    onCloseSidePanel: () => {},
    sidePanelCopy: {
      participants: {
        emptyState: 'Chat participant fallback should not render.',
      },
      execution: {
        emptyState: 'Chat execution fallback should not render.',
      },
      folder: {
        emptyState: 'Chat workspace fallback should not render.',
      },
    },
  });
  const markup = renderToStaticMarkup(
    <>
      {sections.map((section) => (
        <React.Fragment key={section.id}>{section.children}</React.Fragment>
      ))}
    </>,
  );

  assert.equal(sections.find((section) => section.id === 'cats')?.title, 'Participants');
  assert.equal(sections.find((section) => section.id === 'execution')?.title, 'Execution');
  assert.equal(
    sections.find((section) => section.id === 'code:session-profile')?.title,
    'Session Profile',
  );
  assert.equal(sections.find((section) => section.id === 'cwd')?.title, 'Codespace');
  assert.match(markup, /No participants available yet\./u);
  assert.match(markup, /No execution target set yet\./u);
  assert.match(markup, /Independent worktree/u);
  assert.match(markup, /Read only/u);
  assert.match(markup, /No codespace selected yet\./u);
  assert.doesNotMatch(markup, /Chat participant fallback should not render\./u);
  assert.doesNotMatch(markup, /Chat execution fallback should not render\./u);
  assert.doesNotMatch(markup, /Chat workspace fallback should not render\./u);
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
  assert.match(markup, /Choose codespace/u);
  assert.doesNotMatch(markup, /class="draftHeaderAccessory"/u);
  assert.doesNotMatch(markup, /How can I help you today\?/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /class="draftPromptChip"/u);
});

test('new code default draft does not render standalone setup chips between the greeting and composer', () => {
  const markup = renderToStaticMarkup(<NewChatDraft {...createProps()} />);

  assert.match(markup, /Choose codespace/u);
  assert.doesNotMatch(markup, /Choose execution target/u);
  assert.doesNotMatch(markup, /class="draftHeaderAccessory"/u);
  assert.doesNotMatch(markup, /class="draftPromptChip"/u);
});

test('new code default draft prefers payload-backed assist greeting and shows up to five helper chips', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        greeting: 'Legacy code greeting.',
        payload: createCodeAssistPayload(),
      })}
    />,
  );

  assert.match(markup, /Pick a small coding task\./u);
  assert.match(markup, />Build a pomodoro app</u);
  assert.match(markup, />Fix a bug</u);
  assert.match(markup, />Refactor code</u);
  assert.match(markup, />Write tests</u);
  assert.match(markup, />Start a project</u);
  assert.doesNotMatch(markup, />Hidden helper</u);
  assert.doesNotMatch(markup, /Legacy code greeting\./u);
  assert.match(markup, /Choose codespace/u);
  assert.doesNotMatch(markup, /Choose execution target/u);
  assert.doesNotMatch(markup, /class="draftHeaderAccessory"/u);
});

test('new code helper chips localize in zh-TW', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider locale="zh-TW">
      <NewChatDraft
        {...createProps({
          greeting: 'Legacy code greeting.',
          payload: createCodeAssistPayload(),
        })}
      />
    </I18nProvider>,
  );

  assert.match(markup, />建置番茄鐘應用程式</u);
  assert.match(markup, />修復錯誤</u);
  assert.match(markup, />重構程式碼</u);
  assert.match(markup, />撰寫測試</u);
  assert.match(markup, />開始專案</u);
  assert.doesNotMatch(markup, />Build a pomodoro app</u);
  assert.doesNotMatch(markup, />Start a project</u);
});

test('new code helper chips stay visible while the user types manually', () => {
  const assistPayload = createCodeAssistPayload();
  const assistReadModel = assistPayload.guideCatAssist?.codeNewDraft;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        composerDraft: 'User typed this manually.',
        payload: {
          ...assistPayload,
          guideCatAssist: {
            codeNewDraft: {
              ...assistReadModel!,
              bundle: {
                ...assistReadModel!.bundle,
                content: {
                  ...assistReadModel!.bundle.content,
                  entryChips: [
                    {
                      id: 'code-pomodoro',
                      label: 'Build a pomodoro app',
                      prompt: 'Write a small pomodoro timer app.',
                    },
                  ],
                },
                provenance: {
                  ...assistReadModel!.bundle.provenance,
                  refreshContextHash: 'gca:v1:test-code-manual-typing',
                },
              },
            },
          },
        } as AppShellPayload,
      })}
    />,
  );

  assert.match(markup, />Build a pomodoro app</u);
});

test('team code and peer code drafts reuse the same code helper chips', () => {
  const groupMarkup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        payload: createCodeAssistPayload(),
      })}
    />,
  );
  const parallelMarkup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'parallel',
        payload: createCodeAssistPayload(),
        parallelTargets: [
          {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
            modelSelection: null,
          },
        ],
      })}
    />,
  );

  for (const markup of [groupMarkup, parallelMarkup]) {
    assert.match(markup, />Build a pomodoro app</u);
    assert.match(markup, />Fix a bug</u);
    assert.match(markup, />Refactor code</u);
    assert.match(markup, />Write tests</u);
    assert.match(markup, />Start a project</u);
    assert.doesNotMatch(markup, />Hidden helper</u);
  }
});

test('new code default drafts without an explicit direct-lane route do not render the composer stack', () => {
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

  assert.match(markup, /draftHeaderProfile/u);
  assert.match(markup, /<h1 class="draftHeaderTitle">Milo<\/h1>/u);
  assert.match(markup, /Choose codespace/u);
  assert.match(markup, /class="composerCatStack"/u);
});

test('new code direct-lane drafts keep the same profile header when the participant is telegram-bound', () => {
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

  assert.match(markup, /draftHeaderProfile/u);
  assert.match(markup, /<h1 class="draftHeaderTitle">Milo<\/h1>/u);
  assert.match(markup, /Choose codespace/u);
  assert.doesNotMatch(markup, /Focused Code Session/u);
});

test('team code and peer code drafts render through code-owned shared primitives', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
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
  assert.match(markup, /What should this code session build, fix, or investigate\?/u);
  assert.match(markup, /class="audienceChip"/u);
  assert.doesNotMatch(markup, /How can I help you today\?/u);
});

test('advanced draft controls expose collaborator and compare buttons on the default code draft without hint copy', () => {
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
            code: true,
            work: false,
          },
        }),
        selectedExecutionTarget: target,
        onQuickAddDraftTemporaryParticipant: () => {},
        onAddParallelTarget: () => {},
      })}
    />,
  );

  const addButtonMatches = markup.match(/class="parallelAddButton"/gu) ?? [];

  assert.equal(addButtonMatches.length, 1);
  assert.match(markup, /aria-label="Add another model to collaborate"/u);
  assert.match(markup, /aria-label="Add parallel chat"/u);
  assert.doesNotMatch(markup, /Add another model to compare/u);
  assert.doesNotMatch(markup, /Add another model to collaborate<\/span>/u);
});

test('advanced draft controls keep team code drafts empty and still expose compare setup', () => {
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
            code: true,
            work: false,
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

test('advanced draft controls keep peer code drafts on one lead target, expose collaborator setup, and preserve compare hint copy', () => {
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
            code: true,
            work: false,
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
  assert.match(markup, /What should this code session build, fix, or investigate\?/u);
  assert.doesNotMatch(markup, /How can I help you today\?/u);
  assert.doesNotMatch(markup, /class="parallelStubStack"/u);
});

test('code draft presets expose the screenshot attachment action when wired', () => {
  const target = {
    provider: 'claude',
    instance: 'native',
    model: 'claude-sonnet',
    modelSelection: null,
  } as const;
  const markups = [
    renderToStaticMarkup(
      <NewChatDraft
        {...createProps({
          plusMenuOpen: true,
          onTakeScreenshot: () => {},
        })}
      />,
    ),
    renderToStaticMarkup(
      <NewChatDraft
        {...createProps({
          entryPreset: 'group',
          plusMenuOpen: true,
          selectedExecutionTarget: target,
          onTakeScreenshot: () => {},
        })}
      />,
    ),
    renderToStaticMarkup(
      <NewChatDraft
        {...createProps({
          entryPreset: 'parallel',
          parallelTargets: [target],
          plusMenuOpen: true,
          selectedExecutionTarget: target,
          onTakeScreenshot: () => {},
        })}
      />,
    ),
    renderToStaticMarkup(
      <NewChatDraft
        {...createProps({
          allowAddCat: false,
          draftCatIds: ['cat-lead'],
          draftDefaultRecipientCatId: 'cat-lead',
          plusMenuOpen: true,
          onTakeScreenshot: () => {},
        })}
      />,
    ),
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
