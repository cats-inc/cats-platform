import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { pickDraftGreeting } from '../src/products/chat/renderer/chatUtils.tsx';
import { NewChatDraft, type NewChatDraftProps } from '../src/products/chat/renderer/components/NewChatDraft.tsx';
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
    busy: clearBusyState(),
    greeting: 'Meow. Ready when you are.',
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

test('lead-scoped new chat draft renders cat-led copy instead of private chat copy', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftDefaultRecipientCatId: 'cat-lead',
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

test('generic new chat draft keeps only the product-owned starter chip out of the box', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps()}
    />,
  );

  assert.match(markup, /Meow\. Ready when you are\./u);
  assert.match(markup, />Pomodoro app</u);
  assert.doesNotMatch(markup, /Plan today's priorities/u);
});

test('generic new chat draft with multiple selected cats keeps a lightweight greeting without runtime helper chips', () => {
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
  assert.match(markup, />Pomodoro app</u);
  assert.doesNotMatch(markup, /split roles, and ask for a coordinated plan/u);
  assert.doesNotMatch(markup, /Cat-led Chat/u);
});

test('group route uses the greeting seam instead of a fixed heading', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        greeting: 'Round up the room.',
      })}
    />,
  );

  assert.match(markup, /Round up the room\./u);
  assert.doesNotMatch(markup, /Start a group chat/u);
});

test('group route does not show helper chips without runtime-backed assist content', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
      })}
    />,
  );

  assert.doesNotMatch(markup, /split roles, and ask for a coordinated plan/u);
  assert.doesNotMatch(markup, /draftPromptChip/u);
});

test('default chat draft expanded to a group with runtime assist hides the chat-product fallback chip', () => {
  // Reviewer-flagged regression for 8a5024fa: a +New (default)
  // draft that the user expands by adding collaborators is treated
  // as a group draft (draftStarterSuggestionContext.ts:25,
  // `participantCount > 1`), so any payload-backed group assist
  // chips surface via the shared composer's
  // visibleStarterSuggestions. Without the new helperRegion
  // priority rule, the chat-product Pomodoro fallback would still
  // render alongside the runtime group chips because the
  // chat-product wrapper still supplies it for entryPreset='default'.
  const payload = createPayload();
  payload.chat.newChatAssist = {
    group: {
      scopeKey: 'chat:new:group:default',
      renderSource: 'cache',
      cacheHit: true,
      missing: false,
      stale: false,
      refreshEligible: false,
      surfaceDisabled: false,
      lastFailure: null,
      bundle: {
        bundleId: 'chat:new:group:default',
        scope: {
          surfaceId: 'chat:new',
          surfaceMode: 'group',
          audienceState: 'default',
        },
        content: {
          greeting: 'Round up the room.',
          entryChips: [
            {
              id: 'group-roles',
              prompt: 'Brief the group, split roles, and ask for a coordinated plan.',
            },
          ],
        },
        provenance: {
          originMode: 'runtime',
          refreshContextHash: 'gca:v1:test-default-expanded-runtime',
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
  } as typeof payload.chat.newChatAssist;

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        payload,
        greeting: null,
        // entryPreset omitted -> 'default'.
        draftTemporaryParticipants: [
          {
            participantId: 'participant-a',
            name: 'Reviewer A',
            provider: 'gemini',
            instance: 'native',
            model: 'gemini-3.1-pro',
            modelSelection: null,
            roleHint: null,
          },
          {
            participantId: 'participant-b',
            name: 'Reviewer B',
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
            modelSelection: null,
            roleHint: null,
          },
        ],
      })}
    />,
  );

  // The runtime group chip surfaces.
  assert.match(markup, /Brief the group, split roles, and ask for a coordinated plan\./u);
  // The chat-product Pomodoro fallback yields, even though the
  // chat wrapper's `entryPreset === 'default' && !isParallelDraft`
  // gate is still true.
  assert.doesNotMatch(markup, /Pomodoro app/u);
});

test('advanced draft controls expose group and compare add buttons on the default chat draft without hint copy', () => {
  const target = {
    provider: 'claude',
    instance: 'native',
    model: 'claude-sonnet',
    modelSelection: null,
  } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedExecutionTarget: target,
        showDraftGroupAddButton: true,
        onQuickAddDraftTemporaryParticipant: () => {},
        parallelTargets: [target],
        onAddParallelTarget: () => {},
        hideDraftGroupHint: true,
        hideDraftParallelHint: true,
      })}
    />,
  );

  const addButtonMatches = markup.match(/class="parallelAddButton"/gu) ?? [];

  assert.equal(addButtonMatches.length, 2);
  assert.match(markup, /aria-label="Add another model to collaborate"/u);
  assert.match(markup, /aria-label="Add parallel chat"/u);
  assert.doesNotMatch(markup, /Add another model to compare/u);
  assert.doesNotMatch(markup, /Add another model to collaborate<\/span>/u);
});

test('group route shows add-participant hint inside the composer', () => {
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
  assert.doesNotMatch(markup, /Start a group chat/u);
});

test('advanced draft controls keep +Group drafts empty and show the compare button without hint copy', () => {
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
        selectedExecutionTarget: target,
        showDraftGroupAddButton: true,
        onQuickAddDraftTemporaryParticipant: () => {},
        parallelTargets: [target],
        onAddParallelTarget: () => {},
        hideDraftParallelHint: true,
      })}
    />,
  );

  assert.match(markup, /class="composerGroupAddRow"/u);
  assert.match(markup, /aria-label="Add another model to collaborate"/u);
  assert.match(markup, /aria-label="Add parallel chat"/u);
  assert.doesNotMatch(markup, /class="composerGroupAvatarSlot"/u);
  assert.doesNotMatch(markup, /Add another model to compare/u);
});

test('group route hides add-participant hint and button when max participants is reached', () => {
  const payload = createPayload();
  payload.chat.capabilities.maxChatParticipants = 2;

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        payload,
        draftCatIds: ['cat-lead'],
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

  assert.match(markup, /class="composerGroupAddRow"/u);
  assert.doesNotMatch(markup, /aria-label="Add another model to collaborate"/u);
  assert.doesNotMatch(markup, /parallelAddHint/u);
});

test('group route keeps the current audience chip and inline avatar row for participants', () => {
  const payload = createPayload();
  payload.chat.bossCatId = 'cat-lead';

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        payload,
        draftCatIds: ['cat-lead'],
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

  const avatarSlotMatches = markup.match(/class="composerGroupAvatarSlot"/gu) ?? [];

  assert.match(markup, /class="composerGroupAddRow"/u);
  assert.equal(avatarSlotMatches.length, 2);
  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /Milo \+1/u);
  assert.match(markup, /data-tooltip="Gemini-CLI · gemini-3.1-pro"/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /aria-label="Remove Inline Reviewer"/u);
});

test('advanced draft controls keep +Parallel drafts on one lead target, expose the group add button, and preserve compare hint copy', () => {
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
        selectedExecutionTarget: target,
        showDraftGroupAddButton: true,
        onQuickAddDraftTemporaryParticipant: () => {},
        parallelTargets: [target],
        onAddParallelTarget: () => {},
        hideDraftGroupHint: true,
      })}
    />,
  );

  assert.match(markup, /aria-label="Add another model to collaborate"/u);
  assert.match(markup, /aria-label="Add parallel chat"/u);
  assert.match(markup, /Add another model to compare/u);
  assert.doesNotMatch(markup, /Add another model to collaborate<\/span>/u);
  assert.doesNotMatch(markup, /class="parallelStubStack"/u);
});

test('group route caps the audience chip selection to the configured max audience count', () => {
  const payload = createPayload();
  payload.chat.capabilities.maxAudienceParticipants = 2;
  payload.chat.bossCatId = 'cat-lead';

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        payload,
        draftCatIds: ['cat-lead'],
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
          {
            participantId: 'participant-analyst',
            name: 'Second Analyst',
            provider: 'codex',
            instance: 'native',
            model: 'gpt-5.3-codex',
            modelSelection: null,
            roleHint: 'Backup',
          },
        ],
      })}
    />,
  );

  const avatarSlotMatches = markup.match(/class="composerGroupAvatarSlot"/gu) ?? [];

  assert.equal(avatarSlotMatches.length, 3);
  assert.match(markup, /Milo \+1/u);
  assert.doesNotMatch(markup, /Milo \+2/u);
});

test('group route keeps remove controls hidden when only two participants remain', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        draftCatIds: ['cat-lead'],
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

  assert.doesNotMatch(markup, /aria-label="Remove Inline Reviewer"/u);
});

test('group route restores remove controls once the draft has three participants', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
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

  assert.match(markup, /aria-label="Remove Milo"/u);
  assert.match(markup, /aria-label="Remove Pico"/u);
  assert.match(markup, /aria-label="Remove Inline Reviewer"/u);
});

test('solo draft without a recipient keeps the provider-model control on the audience chip', () => {
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

  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /Claude-CLI · claude-sonnet/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
});

test('parallel draft keeps follower targets on the same audience-chip treatment as the lead target', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        parallelTargets: [
          {
            provider: 'claude-cli',
            instance: null,
            model: 'opus-4.6-1m',
            modelSelection: null,
          },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
          },
          {
            provider: 'gemini-cli',
            instance: null,
            model: 'gemini-2.5-pro',
            modelSelection: null,
          },
        ],
      })}
    />,
  );

  const audienceChipMatches = markup.match(/class="audienceChip"/gu) ?? [];
  const audienceAvatarMatches = markup.match(/class="audienceChipAvatar"/gu) ?? [];
  const recipientChipMatches = markup.match(/class="composerRecipientChip"/gu) ?? [];
  const implicitIconMatches = markup.match(/recipientChipIcon/gu) ?? [];

  assert.match(markup, /class="parallelStubStack"/u);
  assert.match(markup, /data-tooltip="[^"]*opus-4\.6-1m"/u);
  assert.match(markup, /data-tooltip="[^"]*codex-max"/u);
  assert.match(markup, /data-tooltip="[^"]*gemini-2\.5-pro"/u);
  assert.equal(audienceChipMatches.length, 3);
  assert.equal(audienceAvatarMatches.length, 0);
  assert.equal(recipientChipMatches.length, 0);
  assert.equal(implicitIconMatches.length, 0);
});

test('parallel draft does not show helper chips without runtime-backed assist content', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        parallelTargets: [
          {
            provider: 'claude-cli',
            instance: null,
            model: 'opus-4.6-1m',
            modelSelection: null,
          },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
          },
        ],
      })}
    />,
  );

  assert.doesNotMatch(markup, /draftPromptChip/u);
  assert.doesNotMatch(markup, /Compare how different models would approach the same task\./u);
});

test('direct-lane draft now uses the profile header without helper chips', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftDefaultRecipientCatId: 'cat-lead',
        allowAddCat: false,
      })}
    />,
  );

  assert.match(markup, /draftHeaderProfile/u);
  assert.match(markup, /<h1 class="draftHeaderTitle">Milo<\/h1>/u);
  assert.doesNotMatch(markup, /draftPromptChip/u);
  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /class="audienceChipAvatar"/u);
  assert.match(markup, />Milo<\/span>/u);
  assert.match(markup, /background:#7A5B3A/u);
  assert.doesNotMatch(markup, /class="composerCatStack"/u);
  assert.doesNotMatch(markup, /class="composerRecipientChip"/u);
  assert.doesNotMatch(markup, /Private Chat/u);
});

test('direct-lane draft ignores Telegram-bound private-lane copy and stays on the profile header', () => {
  const payload = createPayload();
  payload.chat.botBindings = [
    {
      id: 'binding-telegram',
      platform: 'telegram',
      status: 'active',
      catId: 'cat-lead',
      label: 'Telegram',
    },
  ] as typeof payload.chat.botBindings;

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        payload,
        draftDefaultRecipientCatId: 'cat-lead',
        allowAddCat: false,
      })}
    />,
  );

  assert.match(markup, /draftHeaderProfile/u);
  assert.match(markup, /<h1 class="draftHeaderTitle">Milo<\/h1>/u);
  assert.doesNotMatch(markup, /draftPromptChip/u);
  assert.doesNotMatch(markup, /Private Chat/u);
  assert.doesNotMatch(markup, /Telegram-bound private lane\./u);
});

test('draft prefers payload-backed assist greeting and starter suggestions when the seam provides them', () => {
  const payload = createPayload();
  payload.chat.newChatAssist = {
    solo: {
      scopeKey: 'chat:new:solo:default',
      renderSource: 'cache',
      cacheHit: true,
      missing: false,
      stale: false,
      refreshEligible: false,
      surfaceDisabled: false,
      lastFailure: null,
      bundle: {
        bundleId: 'chat:new:solo:default',
        scope: {
          surfaceId: 'chat:new',
          surfaceMode: 'solo',
          audienceState: 'default',
        },
        content: {
          greeting: 'Payload says hello.',
          entryChips: [
            {
              id: 'payload-plan',
              prompt: 'Payload asks you to line up the first deliverable before you send anything.',
            },
          ],
        },
        provenance: {
          originMode: 'runtime',
          refreshContextHash: 'gca:v1:test-solo',
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
  } as typeof payload.chat.newChatAssist;

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        payload,
        greeting: null,
      })}
    />,
  );

  assert.match(markup, /Payload says hello\./u);
  assert.match(markup, /Payload asks you to line up the first deliverable/u);
  assert.doesNotMatch(markup, /Plan today's priorities and turn them into next actions\./u);
});

test('group draft ignores deterministic payload-backed starter prompts', () => {
  const payload = createPayload();
  payload.chat.newChatAssist = {
    group: {
      scopeKey: 'chat:new:group:default',
      renderSource: 'deterministic',
      cacheHit: false,
      missing: true,
      stale: false,
      refreshEligible: false,
      surfaceDisabled: false,
      lastFailure: null,
      bundle: {
        bundleId: 'chat:new:group:default',
        scope: {
          surfaceId: 'chat:new',
          surfaceMode: 'group',
          audienceState: 'default',
        },
        content: {
          greeting: 'Round up the room.',
          entryChips: [
            {
              id: 'group-roles',
              prompt: 'Brief the group, split roles, and ask for a coordinated plan.',
            },
          ],
        },
        provenance: {
          originMode: 'deterministic',
          refreshContextHash: 'gca:v1:test-group-deterministic',
          missionId: null,
          runId: null,
        },
        freshness: {
          generatedAt: '2026-04-17T12:00:00.000Z',
          expiresAt: null,
          lastRefreshStatus: 'never',
        },
      },
    },
  } as typeof payload.chat.newChatAssist;

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        payload,
        greeting: null,
        entryPreset: 'group',
      })}
    />,
  );

  assert.doesNotMatch(markup, /Brief the group, split roles, and ask for a coordinated plan\./u);
  assert.doesNotMatch(markup, /draftPromptChip/u);
});

test('group draft surfaces runtime-origin payload-backed starter prompts', () => {
  const payload = createPayload();
  payload.chat.newChatAssist = {
    group: {
      scopeKey: 'chat:new:group:default',
      renderSource: 'cache',
      cacheHit: true,
      missing: false,
      stale: false,
      refreshEligible: false,
      surfaceDisabled: false,
      lastFailure: null,
      bundle: {
        bundleId: 'chat:new:group:default',
        scope: {
          surfaceId: 'chat:new',
          surfaceMode: 'group',
          audienceState: 'default',
        },
        content: {
          greeting: 'Runtime group greeting.',
          entryChips: [
            {
              id: 'runtime-group-roles',
              prompt: 'Runtime-generated coordinated plan suggestion.',
            },
          ],
        },
        provenance: {
          originMode: 'runtime',
          refreshContextHash: 'gca:v1:test-group-runtime',
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
  } as typeof payload.chat.newChatAssist;

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        payload,
        greeting: null,
        entryPreset: 'group',
      })}
    />,
  );

  assert.match(markup, /Runtime-generated coordinated plan suggestion\./u);
});

test('group draft keeps runtime-origin helper chips visible while the user types manually', () => {
  const payload = createPayload();
  payload.chat.newChatAssist = {
    group: {
      scopeKey: 'chat:new:group:default',
      renderSource: 'cache',
      cacheHit: true,
      missing: false,
      stale: false,
      refreshEligible: false,
      surfaceDisabled: false,
      lastFailure: null,
      bundle: {
        bundleId: 'chat:new:group:default',
        scope: {
          surfaceId: 'chat:new',
          surfaceMode: 'group',
          audienceState: 'default',
        },
        content: {
          greeting: 'Runtime group greeting.',
          entryChips: [
            {
              id: 'runtime-group-roles',
              prompt: 'Runtime-generated coordinated plan suggestion.',
            },
          ],
        },
        provenance: {
          originMode: 'runtime',
          refreshContextHash: 'gca:v1:test-group-runtime-manual-typing',
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
  } as typeof payload.chat.newChatAssist;

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        payload,
        greeting: null,
        entryPreset: 'group',
        composerDraft: 'User typed this manually.',
      })}
    />,
  );

  assert.match(markup, /Runtime-generated coordinated plan suggestion\./u);
});

test('direct-lane draft ignores deterministic payload-backed starter prompts', () => {
  const payload = createPayload();
  payload.chat.newChatAssist = {
    direct: {
      scopeKey: 'chat:new:direct:default',
      renderSource: 'deterministic',
      cacheHit: false,
      missing: true,
      stale: false,
      refreshEligible: false,
      surfaceDisabled: false,
      lastFailure: null,
      bundle: {
        bundleId: 'chat:new:direct:default',
        scope: {
          surfaceId: 'chat:new',
          surfaceMode: 'direct',
          audienceState: 'default',
        },
        content: {
          greeting: 'Private lane for this Cat.',
          entryChips: [
            {
              id: 'direct-update',
              prompt: 'Ask this Cat for a focused update or recommendation on this task.',
            },
          ],
        },
        provenance: {
          originMode: 'deterministic',
          refreshContextHash: 'gca:v1:test-direct',
          missionId: null,
          runId: null,
        },
        freshness: {
          generatedAt: '2026-04-17T12:00:00.000Z',
          expiresAt: null,
          lastRefreshStatus: 'never',
        },
      },
    },
  } as typeof payload.chat.newChatAssist;

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        payload,
        greeting: null,
        draftDefaultRecipientCatId: 'cat-lead',
        allowAddCat: false,
      })}
    />,
  );

  assert.doesNotMatch(markup, /Ask Milo for a focused update or recommendation on this task\./u);
  assert.doesNotMatch(markup, /draftPromptChip/u);
});

test('direct-lane draft suppresses even runtime-origin payload-backed starter prompts', () => {
  const payload = createPayload();
  payload.chat.newChatAssist = {
    direct: {
      scopeKey: 'chat:new:direct:default',
      renderSource: 'cache',
      cacheHit: true,
      missing: false,
      stale: false,
      refreshEligible: false,
      surfaceDisabled: false,
      lastFailure: null,
      bundle: {
        bundleId: 'chat:new:direct:default',
        scope: {
          surfaceId: 'chat:new',
          surfaceMode: 'direct',
          audienceState: 'default',
        },
        content: {
          greeting: 'Private lane for this Cat.',
          entryChips: [
            {
              id: 'runtime-direct',
              prompt: 'Runtime-generated direct-lane suggestion.',
            },
          ],
        },
        provenance: {
          originMode: 'runtime',
          refreshContextHash: 'gca:v1:test-direct-runtime',
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
  } as typeof payload.chat.newChatAssist;

  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        payload,
        greeting: null,
        draftDefaultRecipientCatId: 'cat-lead',
        allowAddCat: false,
      })}
    />,
  );

  assert.doesNotMatch(markup, /Runtime-generated direct-lane suggestion\./u);
  assert.doesNotMatch(markup, /draftPromptChip/u);
});

test('fresh draft greetings share one pool and still honor an explicit override pool', () => {
  assert.equal(
    pickDraftGreeting({
      pool: ['Shared One', 'Shared Two'],
      random: () => 0,
    }),
    'Shared One',
  );
  assert.equal(
    pickDraftGreeting({
      pool: ['Shared One', 'Shared Two'],
      random: () => 0.99,
    }),
    'Shared Two',
  );
});
