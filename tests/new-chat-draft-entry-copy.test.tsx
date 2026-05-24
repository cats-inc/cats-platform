import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server.browser';
import { MemoryRouter } from 'react-router';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { pickDraftGreeting } from '../src/products/chat/renderer/chatUtils.tsx';
import { NewChatDraft, type NewChatDraftProps } from '../src/products/chat/renderer/components/NewChatDraft.tsx';
import { createDraftCompareShadowCardId } from '../src/products/shared/renderer/components/draftCompareShadowCardId.ts';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

function renderToStaticMarkup(element: React.ReactElement): string {
  return renderReactToStaticMarkup(
    <MemoryRouter>
      {element}
    </MemoryRouter>,
  );
}

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
    draftSurface: 'chat',
    onDraftSurfaceChange: () => {},
    ...overrides,
  };
}

test('lead-scoped public new chat draft keeps fresh copy with a selected audience chip', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftDefaultRecipientCatId: 'cat-lead',
      })}
    />,
  );

  assert.match(markup, /Meow\. Ready when you are\./u);
  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /data-tooltip="Milo · Claude-CLI · claude-sonnet"/u);
  assert.doesNotMatch(markup, /draftHeaderProfile/u);
  assert.doesNotMatch(markup, /Participant Chat|Private Chat/u);
});

test('generic new chat draft with one selected cat keeps fresh copy with a selected audience chip', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftCatIds: ['cat-lead'],
      })}
    />,
  );

  assert.match(markup, /Meow\. Ready when you are\./u);
  assert.match(markup, /class="audienceChip"/u);
  assert.match(markup, /data-tooltip="Milo · Claude-CLI · claude-sonnet"/u);
  assert.doesNotMatch(markup, /Group Chat|Participant Chat/u);
});

test('generic new chat draft keeps only the product-owned starter chip out of the box', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps()}
    />,
  );

  assert.match(markup, /Meow\. Ready when you are\./u);
  assert.match(markup, />Build a pomodoro app</u);
  assert.doesNotMatch(markup, /Plan today's priorities/u);
});

test('code draft surface labels the folder picker as codespace', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        draftSurface: 'code',
      })}
    />,
  );

  assert.match(markup, /Choose codespace/u);
  assert.doesNotMatch(markup, /Choose workspace/u);
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
  assert.match(markup, />Build a pomodoro app</u);
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

test('group route shows the same Pomodoro helper chip as the default new chat draft', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
      })}
    />,
  );

  assert.doesNotMatch(markup, /split roles, and ask for a coordinated plan/u);
  assert.match(markup, />Build a pomodoro app</u);
  assert.match(markup, /draftPromptChip/u);
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
    scopeKey: 'chat:new:default:default',
    renderSource: 'cache',
    cacheHit: true,
    missing: false,
    stale: false,
    refreshEligible: false,
    surfaceDisabled: false,
    lastFailure: null,
    bundle: {
      bundleId: 'chat:new:default:default',
      scope: {
        surfaceId: 'chat:new',
        surfaceMode: 'default',
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
            provider: 'antigravity',
            instance: 'native',
            model: 'Gemini 3.1 Pro (high)',
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
  assert.doesNotMatch(markup, /Build a pomodoro app/u);
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
        onQuickAddDraftTemporaryParticipant: () => {},
        parallelTargets: [target],
        onAddParallelTarget: () => {},
        builderControls: {
          showGroupAddButton: true,
          hideGroupHint: true,
          hideParallelHint: true,
        },
      })}
    />,
  );

  // After 2026-05-01, +compare moved to the carousel's last-branch slot
  // (`draftCompareCarouselAddBranch`) — the inline footer `parallelAddButton`
  // is now only the +collaborate affordance, still shown next to the
  // composer text in advanced mode.
  const collaborateMatches = markup.match(/class="parallelAddButton"/gu) ?? [];
  const compareSlotMatches = markup.match(/draftCompareCarouselAddBranch/gu) ?? [];

  assert.equal(collaborateMatches.length, 1);
  assert.ok(compareSlotMatches.length >= 1);
  assert.match(markup, /aria-label="Add another model to collaborate"/u);
  assert.match(markup, /aria-label="Add parallel chat"/u);
  // Default preset is non-accent, so the inline hint stays suppressed.
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
            provider: 'antigravity',
            instance: 'native',
            model: 'Gemini 3.1 Pro (high)',
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
        onQuickAddDraftTemporaryParticipant: () => {},
        parallelTargets: [target],
        onAddParallelTarget: () => {},
        builderControls: {
          showGroupAddButton: true,
          hideParallelHint: true,
        },
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
            provider: 'antigravity',
            instance: 'native',
            model: 'Gemini 3.1 Pro (high)',
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
            provider: 'antigravity',
            instance: 'native',
            model: 'Gemini 3.1 Pro (high)',
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
  assert.match(markup, /data-tooltip="Antigravity-CLI · Gemini 3.1 Pro \(high\)"/u);
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
        onQuickAddDraftTemporaryParticipant: () => {},
        parallelTargets: [target],
        onAddParallelTarget: () => {},
        builderControls: {
          showGroupAddButton: true,
          hideGroupHint: true,
        },
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
            provider: 'antigravity',
            instance: 'native',
            model: 'Gemini 3.1 Pro (high)',
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
            provider: 'antigravity',
            instance: 'native',
            model: 'Gemini 3.1 Pro (high)',
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
            provider: 'antigravity',
            instance: 'native',
            model: 'Gemini 3.1 Pro (high)',
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

test('default draft without a recipient keeps the provider-model control on the audience chip', () => {
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

  assert.match(markup, /class="draftCompareCarousel"/u);
  assert.match(markup, /data-tooltip="[^"]*opus-4\.6-1m"/u);
  assert.match(markup, /data-tooltip="[^"]*codex-max"/u);
  assert.match(markup, /data-tooltip="[^"]*gemini-2\.5-pro"/u);
  assert.equal(audienceChipMatches.length, 3);
  assert.equal(audienceAvatarMatches.length, 0);
  assert.equal(recipientChipMatches.length, 0);
  assert.equal(implicitIconMatches.length, 0);
});

test('parallel draft shows the same Pomodoro helper chip as the default new chat draft', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'parallel',
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

  assert.match(markup, />Build a pomodoro app</u);
  assert.match(markup, /draftPromptChip/u);
  assert.doesNotMatch(markup, /Compare how different models would approach the same task\./u);
});

test('+compare expanded default draft keeps the Pomodoro helper chip — symmetric with +Group/+Parallel', () => {
  // Regression guard: pressing +compare on a +New chat draft used to hide
  // the chat-product Pomodoro fallback because the wrapper gated it on
  // `entryPreset === 'default' && !isParallelDraft`. +Group and +Parallel
  // didn't gate, so the three presets behaved inconsistently when the
  // user expanded compare. Lock the symmetric behaviour.
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'default',
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

  assert.match(markup, />Build a pomodoro app</u);
  assert.match(markup, /draftPromptChip/u);
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
    scopeKey: 'chat:new:default:default',
    renderSource: 'cache',
    cacheHit: true,
    missing: false,
    stale: false,
    refreshEligible: false,
    surfaceDisabled: false,
    lastFailure: null,
    bundle: {
      bundleId: 'chat:new:default:default',
      scope: {
        surfaceId: 'chat:new',
        surfaceMode: 'default',
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
        refreshContextHash: 'gca:v1:test-default',
        missionId: null,
        runId: null,
      },
      freshness: {
        generatedAt: '2026-04-17T12:00:00.000Z',
        expiresAt: null,
        lastRefreshStatus: 'ok',
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
    scopeKey: 'chat:new:default:default',
    renderSource: 'deterministic',
    cacheHit: false,
    missing: true,
    stale: false,
    refreshEligible: false,
    surfaceDisabled: false,
    lastFailure: null,
    bundle: {
      bundleId: 'chat:new:default:default',
      scope: {
        surfaceId: 'chat:new',
        surfaceMode: 'default',
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
        refreshContextHash: 'gca:v1:test-default-deterministic',
        missionId: null,
        runId: null,
      },
      freshness: {
        generatedAt: '2026-04-17T12:00:00.000Z',
        expiresAt: null,
        lastRefreshStatus: 'never',
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
  assert.match(markup, />Build a pomodoro app</u);
  assert.match(markup, /draftPromptChip/u);
});

test('group draft surfaces runtime-origin payload-backed starter prompts', () => {
  const payload = createPayload();
  payload.chat.newChatAssist = {
    scopeKey: 'chat:new:default:default',
    renderSource: 'cache',
    cacheHit: true,
    missing: false,
    stale: false,
    refreshEligible: false,
    surfaceDisabled: false,
    lastFailure: null,
    bundle: {
      bundleId: 'chat:new:default:default',
      scope: {
        surfaceId: 'chat:new',
        surfaceMode: 'default',
        audienceState: 'default',
      },
      content: {
        greeting: 'Runtime new-chat greeting.',
        entryChips: [
          {
            id: 'runtime-group-roles',
            prompt: 'Runtime-generated coordinated plan suggestion.',
          },
        ],
      },
      provenance: {
        originMode: 'runtime',
        refreshContextHash: 'gca:v1:test-default-runtime',
        missionId: null,
        runId: null,
      },
      freshness: {
        generatedAt: '2026-04-17T12:00:00.000Z',
        expiresAt: null,
        lastRefreshStatus: 'ok',
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
    scopeKey: 'chat:new:default:default',
    renderSource: 'cache',
    cacheHit: true,
    missing: false,
    stale: false,
    refreshEligible: false,
    surfaceDisabled: false,
    lastFailure: null,
    bundle: {
      bundleId: 'chat:new:default:default',
      scope: {
        surfaceId: 'chat:new',
        surfaceMode: 'default',
        audienceState: 'default',
      },
      content: {
        greeting: 'Runtime new-chat greeting.',
        entryChips: [
          {
            id: 'runtime-group-roles',
            prompt: 'Runtime-generated coordinated plan suggestion.',
          },
        ],
      },
      provenance: {
        originMode: 'runtime',
        refreshContextHash: 'gca:v1:test-default-runtime-manual-typing',
        missionId: null,
        runId: null,
      },
      freshness: {
        generatedAt: '2026-04-17T12:00:00.000Z',
        expiresAt: null,
        lastRefreshStatus: 'ok',
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
  // The direct-lane suppression rule lives in the renderer
  // (`isDirectLaneContext` in `chatNewChatDraftSupport.ts`) — the payload
  // bundle still carries the +New chat assist; the chip simply never
  // surfaces while the user is in the DM surface.
  payload.chat.newChatAssist = {
    scopeKey: 'chat:new:default:default',
    renderSource: 'deterministic',
    cacheHit: false,
    missing: true,
    stale: false,
    refreshEligible: false,
    surfaceDisabled: false,
    lastFailure: null,
    bundle: {
      bundleId: 'chat:new:default:default',
      scope: {
        surfaceId: 'chat:new',
        surfaceMode: 'default',
        audienceState: 'default',
      },
      content: {
        greeting: 'Greeting that should stay hidden in DM.',
        entryChips: [
          {
            id: 'direct-update',
            prompt: 'Ask this Cat for a focused update or recommendation on this task.',
          },
        ],
      },
      provenance: {
        originMode: 'deterministic',
        refreshContextHash: 'gca:v1:test-dm-suppression-deterministic',
        missionId: null,
        runId: null,
      },
      freshness: {
        generatedAt: '2026-04-17T12:00:00.000Z',
        expiresAt: null,
        lastRefreshStatus: 'never',
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
  // Same DM-suppression rule as above. The payload carries a
  // runtime-origin bundle, but the renderer must still drop chips when
  // `isDirectLaneContext` is true.
  payload.chat.newChatAssist = {
    scopeKey: 'chat:new:default:default',
    renderSource: 'cache',
    cacheHit: true,
    missing: false,
    stale: false,
    refreshEligible: false,
    surfaceDisabled: false,
    lastFailure: null,
    bundle: {
      bundleId: 'chat:new:default:default',
      scope: {
        surfaceId: 'chat:new',
        surfaceMode: 'default',
        audienceState: 'default',
      },
      content: {
        greeting: 'Runtime greeting that should stay hidden in DM.',
        entryChips: [
          {
            id: 'runtime-direct',
            prompt: 'Runtime-generated suggestion that should stay hidden in DM.',
          },
        ],
      },
      provenance: {
        originMode: 'runtime',
        refreshContextHash: 'gca:v1:test-dm-suppression-runtime',
        missionId: null,
        runId: null,
      },
      freshness: {
        generatedAt: '2026-04-17T12:00:00.000Z',
        expiresAt: null,
        lastRefreshStatus: 'ok',
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

  assert.doesNotMatch(markup, /Runtime-generated suggestion that should stay hidden in DM\./u);
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

test('advanced draft controls off hides the per-branch collaborator button on parallel shadow rows', () => {
  // Regression guard: when advanced draft controls are OFF the
  // upstream app drops the per-branch quick-add callback, so shadow
  // rows must not render their +collaborate button. Callback absence
  // is the single gate the shadow row trusts.
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          leadTarget,
          { provider: 'codex-cli', instance: null, model: 'codex-max', modelSelection: null },
          { provider: 'gemini-cli', instance: null, model: 'gemini-2.5-pro', modelSelection: null },
        ],
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /class="draftCompareCarousel"/u);
  const collabButtons = markup.match(/aria-label="Add another model to collaborate"/gu) ?? [];
  assert.equal(collabButtons.length, 0);
});

test('advanced draft controls on exposes a collaborator button on every parallel branch row', () => {
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          leadTarget,
          { provider: 'codex-cli', instance: null, model: 'codex-max', modelSelection: null },
          { provider: 'gemini-cli', instance: null, model: 'gemini-2.5-pro', modelSelection: null },
        ],
        builderControls: {
          showGroupAddButton: true,
        },
        onQuickAddDraftTemporaryParticipant: () => {},
        parallelBranchActions: { onQuickAddTemporaryParticipant: () => {} },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /class="draftCompareCarousel"/u);
  const collabButtons = markup.match(/aria-label="Add another model to collaborate"/gu) ?? [];
  // 1 lead row + 2 shadow rows = 3 collaborator buttons when advanced is on.
  assert.equal(collabButtons.length, 3);
});

test('+Group preset with advanced on still lets every shadow row add collaborators', () => {
  // Regression guard: the +Group entry intentionally sets
  // builderControls.showGroupAddButton=false (the preset already gives lead its
  // group add row via isGroupDraft). Shadow rows must still pick up
  // their +collaborate button from the per-branch quick-add callback
  // so the M>=2 × N>=2 matrix stays reachable from +Group.
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          leadTarget,
          { provider: 'codex-cli', instance: null, model: 'codex-max', modelSelection: null },
          { provider: 'gemini-cli', instance: null, model: 'gemini-2.5-pro', modelSelection: null },
        ],
        onQuickAddDraftTemporaryParticipant: () => {},
        parallelBranchActions: { onQuickAddTemporaryParticipant: () => {} },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /class="draftCompareCarousel"/u);
  const collabButtons = markup.match(/aria-label="Add another model to collaborate"/gu) ?? [];
  // 1 lead (via isGroupDraft) + 2 shadows (via callback presence).
  assert.equal(collabButtons.length, 3);
});

test('+Group + +compare keeps the lead roster scoped to branch-0 audience and excludes shadow-only temps', () => {
  // Regression guard: after +compare from +Group, the pool gains a
  // shadow-only temp participant. The lead row's roster must stay
  // scoped to branch-0's audience (the seeded group) and not display
  // the shadow's temp.
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          { ...leadTarget, audienceKeys: ['temp:lead-a', 'temp:lead-b'], workflowShape: 'sequential' },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: ['temp:shadow-c'],
            workflowShape: 'sequential',
          },
        ],
        draftTemporaryParticipants: [
          { participantId: 'lead-a', name: 'Aria', provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null, roleHint: null },
          { participantId: 'lead-b', name: 'Bram', provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null, roleHint: null },
          { participantId: 'shadow-c', name: 'Cleo', provider: 'codex-cli', instance: null, model: 'codex-max', modelSelection: null, roleHint: null },
        ],
        parallelBranchActions: {
          onQuickAddTemporaryParticipant: () => {},
          onSetAudienceKeys: () => {},
        },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /class="draftCompareCarousel"/u);
  const leadRosterSlots = markup.match(/class="composerGroupAvatarSlot"/gu) ?? [];
  // Lead roster: 2 participants (Aria + Bram). The shadow-only temp
  // (Cleo) must not show up here even though it shares the same pool.
  assert.equal(leadRosterSlots.length, 2);
  assert.doesNotMatch(markup, /Cleo/u);
});

test('+Group + +compare hides lead remove buttons while lead branch sits at the group minimum', () => {
  // Regression guard: the group-minimum check must be branch-scoped in
  // parallel mode. Lead branch audience at exactly 2 participants
  // cannot shrink further, so the roster × buttons stay hidden even
  // though the shadow branch adds a third temp into the pool.
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          { ...leadTarget, audienceKeys: ['temp:lead-a', 'temp:lead-b'], workflowShape: 'sequential' },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: ['temp:shadow-c'],
            workflowShape: 'sequential',
          },
        ],
        draftTemporaryParticipants: [
          { participantId: 'lead-a', name: 'Aria', provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null, roleHint: null },
          { participantId: 'lead-b', name: 'Bram', provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null, roleHint: null },
          { participantId: 'shadow-c', name: 'Cleo', provider: 'codex-cli', instance: null, model: 'codex-max', modelSelection: null, roleHint: null },
        ],
        parallelBranchActions: { onSetAudienceKeys: () => {} },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  const leadSlots = markup.match(/class="composerGroupAvatarSlot"/gu) ?? [];
  assert.equal(leadSlots.length, 2);
  const removeButtons = markup.match(/composerGroupAvatarRemove/gu) ?? [];
  assert.equal(removeButtons.length, 0);
});

test('parallel shadow branch with a single audience member renders as a target-style chip without avatar or popover', () => {
  // Regression guard: a shadow branch whose audience is exactly one
  // temp participant must degrade to the target-only chip — no avatar
  // and no audience-selection popover. Growing the shadow via
  // +collaborate (>= 2 members) re-enables the full treatment.
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          { ...leadTarget, audienceKeys: [], workflowShape: 'sequential' },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: ['temp:shadow-c'],
            workflowShape: 'sequential',
          },
        ],
        draftTemporaryParticipants: [
          { participantId: 'shadow-c', name: 'Cleo', provider: 'codex-cli', instance: null, model: 'codex-max', modelSelection: null, roleHint: null },
        ],
        parallelBranchActions: { onSetAudienceKeys: () => {} },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /class="draftCompareCarousel"/u);
  assert.doesNotMatch(markup, /class="audienceChipAvatar"/u);
  assert.doesNotMatch(markup, /Cleo/u);
});

test('parallel shadow branch with detached cwd renders a relinkable cwd chip', () => {
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          { ...leadTarget, audienceKeys: [], workflowShape: 'sequential' },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: [],
            workflowShape: 'sequential',
            cwd: 'C:/repo/worktrees/review',
          },
        ],
        parallelBranchActions: { onSetCwd: () => {} },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /class="composerCwdChip"/u);
  assert.match(markup, /C:\/repo\/worktrees\/review/u);
  assert.match(markup, /aria-label="Re-link branch folder to lead"/u);
});

test('parallel shadow branch following lead exposes the branch folder picker when wired', () => {
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          { ...leadTarget, audienceKeys: [], workflowShape: 'sequential' },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: [],
            workflowShape: 'sequential',
          },
        ],
        parallelBranchActions: { onPickFolder: () => {} },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /composerFollowsLeadChipClickable/u);
  assert.match(markup, /aria-label="Choose branch folder"/u);
});

test('parallel shadow card id stays stable when branch cwd and policy detach', () => {
  const baseTarget = {
    provider: 'codex-cli',
    instance: null,
    model: 'codex-max',
    modelSelection: null,
  } as const;
  const detachedTarget = {
    ...baseTarget,
    cwd: 'C:/repo/worktrees/right',
    runtimeSessionPolicy: {
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    },
  } as const;

  assert.equal(
    createDraftCompareShadowCardId(1, detachedTarget),
    createDraftCompareShadowCardId(1, baseTarget),
  );
});

test('parallel shadow branch following lead exposes the session policy detach control when wired', () => {
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          { ...leadTarget, audienceKeys: [], workflowShape: 'sequential' },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: [],
            workflowShape: 'sequential',
          },
        ],
        parallelBranchActions: { onSetRuntimeSessionPolicy: () => {} },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /Policy follows lead/u);
  assert.match(markup, /aria-label="Detach branch session policy"/u);
});

test('parallel shadow branch mirrors the lead prompt read-only with a click-to-jump affordance (no detach UI)', () => {
  // Regression guard: per-branch prompt overrides were retired
  // 2026-05-01. Shadow branches must mirror the lead read-only and
  // surface a click-to-jump affordance that returns the carousel to
  // the lead branch — no "Detach prompt / Keep linked" UI.
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        composerDraft: 'Lead prompt',
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          { ...leadTarget, audienceKeys: [], workflowShape: 'sequential' },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: [],
            workflowShape: 'sequential',
          },
        ],
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /composerInputJumpToLead/u);
  assert.match(markup, /aria-label="Jump to lead branch to edit prompt"/u);
  assert.doesNotMatch(markup, /composerInputPromptFollowsLead/u);
  assert.doesNotMatch(markup, /composerInputPromptDetached/u);
  assert.doesNotMatch(markup, /Detach prompt/u);
  assert.doesNotMatch(markup, /Keep linked/u);
  assert.doesNotMatch(markup, /Prompt detached/u);
});

test('synthetic orchestrator-authored parallel draft renders landed branch fields cleanly', () => {
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        composerDraft: 'Lead orchestrator prompt',
        selectedExecutionTarget: leadTarget,
        draftCwd: 'C:/repo/main',
        draftRuntimeSessionPolicy: {
          workspaceKind: 'source',
          workspaceAccess: 'read_write',
          permissionMode: 'skip',
        },
        parallelTargets: [
          {
            ...leadTarget,
            audienceKeys: ['temp:lead'],
            workflowShape: 'concurrent',
            cwd: null,
            runtimeSessionPolicy: null,
            attachmentsOverride: null,
          },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: ['temp:reviewer'],
            workflowShape: 'sequential',
            cwd: 'C:/repo/worktrees/review',
            runtimeSessionPolicy: {
              workspaceKind: 'worktree',
              workspaceAccess: 'read_only',
              permissionMode: 'default',
            },
            attachmentsOverride: null,
          },
          {
            provider: 'gemini-cli',
            instance: null,
            model: 'gemini-2.5-pro',
            modelSelection: null,
            audienceKeys: ['temp:critic'],
            workflowShape: 'concurrent',
            cwd: null,
            runtimeSessionPolicy: null,
            attachmentsOverride: null,
          },
        ],
        draftTemporaryParticipants: [
          { participantId: 'lead', name: 'Lead Cat', provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null, roleHint: null },
          { participantId: 'reviewer', name: 'Reviewer Cat', provider: 'codex-cli', instance: null, model: 'codex-max', modelSelection: null, roleHint: null },
          { participantId: 'critic', name: 'Critic Cat', provider: 'gemini-cli', instance: null, model: 'gemini-2.5-pro', modelSelection: null, roleHint: null },
        ],
        parallelBranchActions: {
          onSetAudienceKeys: () => {},
          onSetCwd: () => {},
          onSetRuntimeSessionPolicy: () => {},
        },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /class="draftCompareCarousel"/u);
  assert.match(markup, /C:\/repo\/worktrees\/review/u);
  assert.match(markup, /Worktree \/ Read only/u);
  assert.match(markup, /Gemini-cli · gemini-2\.5-pro/u);
  // Per the 2026-05-01 retirement, no shadow branch may surface its
  // own prompt — the lead's `composerDraft` shows verbatim.
  assert.doesNotMatch(markup, /Prompt detached/u);
  assert.doesNotMatch(markup, /Review the implementation branch\./u);
});

test('parallel shadow branch with detached runtime policy renders a relinkable policy editor', () => {
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          { ...leadTarget, audienceKeys: [], workflowShape: 'sequential' },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: [],
            workflowShape: 'sequential',
            runtimeSessionPolicy: {
              workspaceKind: 'worktree',
              workspaceAccess: 'read_only',
              permissionMode: 'default',
            },
          },
        ],
        parallelBranchActions: { onSetRuntimeSessionPolicy: () => {} },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  assert.match(markup, /composerBranchPolicyControl/u);
  assert.match(markup, /composerPermissionChip/u);
  assert.match(markup, /Worktree \/ Read only/u);
  assert.match(markup, /aria-label="Re-link branch session policy to lead"/u);
});

test('+Group + many +compares keeps every branch collaborator button visible while each branch is under its M cap', () => {
  // Regression guard: the +collaborate button must be gated per-branch
  // (each branch audience vs maxAudienceParticipants), not by the
  // shared pool cap. After 3 +compare clicks the pool hits
  // maxChatParticipants but every branch still sits under M=3, so
  // lead + each shadow must keep their +collaborate button visible.
  const leadTarget = { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null } as const;
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        entryPreset: 'group',
        selectedExecutionTarget: leadTarget,
        parallelTargets: [
          { ...leadTarget, audienceKeys: ['temp:a', 'temp:b'], workflowShape: 'sequential' },
          {
            provider: 'codex-cli',
            instance: null,
            model: 'codex-max',
            modelSelection: null,
            audienceKeys: ['temp:c'],
            workflowShape: 'sequential',
          },
          {
            provider: 'gemini-cli',
            instance: null,
            model: 'gemini-2.5-pro',
            modelSelection: null,
            audienceKeys: ['temp:d'],
            workflowShape: 'sequential',
          },
          {
            provider: 'cursor-cli',
            instance: null,
            model: 'composer-max',
            modelSelection: null,
            audienceKeys: ['temp:e'],
            workflowShape: 'sequential',
          },
        ],
        draftTemporaryParticipants: [
          { participantId: 'a', name: 'Aria', provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null, roleHint: null },
          { participantId: 'b', name: 'Bram', provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null, roleHint: null },
          { participantId: 'c', name: 'Cleo', provider: 'codex-cli', instance: null, model: 'codex-max', modelSelection: null, roleHint: null },
          { participantId: 'd', name: 'Dot', provider: 'gemini-cli', instance: null, model: 'gemini-2.5-pro', modelSelection: null, roleHint: null },
          { participantId: 'e', name: 'Echo', provider: 'cursor-cli', instance: null, model: 'composer-max', modelSelection: null, roleHint: null },
        ],
        onQuickAddDraftTemporaryParticipant: () => {},
        parallelBranchActions: {
          onQuickAddTemporaryParticipant: () => {},
          onSetAudienceKeys: () => {},
        },
        onAddParallelTarget: () => {},
      })}
    />,
  );

  const collabButtons = markup.match(/aria-label="Add another model to collaborate"/gu) ?? [];
  // 1 lead (audience=2 < 3) + 3 shadows (each audience=1 < 3) = 4 buttons.
  assert.equal(collabButtons.length, 4);
});

test('parallel draft without temp participants keeps the lead roster collapsed and shadows target-only', () => {
  // When +compare runs under advanced-off semantics it only appends a
  // parallel target — no temp participant is added and no branch
  // audience is seeded. This test locks in that the lead row does not
  // sprout group avatar slots and shadow chips stay on the
  // target-derived treatment (no avatar).
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({
        parallelTargets: [
          { provider: 'claude-cli', instance: null, model: 'opus-4.6-1m', modelSelection: null },
          { provider: 'codex-cli', instance: null, model: 'codex-max', modelSelection: null },
          { provider: 'gemini-cli', instance: null, model: 'gemini-2.5-pro', modelSelection: null },
          { provider: 'cursor-cli', instance: null, model: 'composer-max', modelSelection: null },
        ],
      })}
    />,
  );

  assert.match(markup, /class="draftCompareCarousel"/u);
  assert.doesNotMatch(markup, /class="composerGroupAvatarSlot"/u);
  assert.doesNotMatch(markup, /class="audienceChipAvatar"/u);
});
