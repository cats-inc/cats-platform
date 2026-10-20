// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { MemoryRouter } from 'react-router';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import type {
  AppShellPayload,
  ChatCat,
  ChatChannelCat,
  ChatChannelParticipant,
} from '../src/products/chat/api/contracts.ts';
import { supportsParticipantAudienceSelection } from '../src/products/chat/shared/channelTopology.ts';
import type { SelectedChannelView } from '../src/products/shared/channelEntry.ts';
import {
  resolveActiveChannelAudienceState,
  resolveActiveChannelMessageMetadata,
} from '../src/products/shared/renderer/composerMessageMetadata.ts';
import {
  ConversationView,
  type ConversationViewProps,
} from '../src/products/shared/renderer/components/conversation-view/ConversationView.tsx';
import { deriveAppViewState } from '../src/products/shared/renderer/workspaceAppViewState.ts';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const originalFetch = globalThis.fetch;
const noop = () => {};
const MAX_AUDIENCE = 3;

function reset(): void {
  cleanup();
  resetTestDom();
  clearProviderCatalogClientCache();
  clearProviderRegistryClientCache();
  globalThis.fetch = originalFetch;
}

// A chip's model popover mounts the provider picker, which reads the shared
// client caches; nothing here waits for it.
function installProviderFetch(): void {
  globalThis.fetch = (async () => Response.json({
    state: 'ready', revision: 'r1', providers: [],
  })) as typeof fetch;
}

const emptyMemory = { summary: null, facts: [], openLoops: [], updatedAt: null };

function idleLease() {
  return {
    laneId: null,
    sessionId: null,
    status: 'ready' as const,
    cwd: null,
    lastError: null,
    provider: null,
    model: null,
    startedAt: null,
    lastUsedAt: null,
  };
}

function cat(id: string, name: string, avatarColor: string, group: ChatCat['group'] = 'standard'): ChatCat {
  return {
    id,
    name,
    group,
    roles: [],
    skillProfile: null,
    mcpProfile: null,
    status: 'active',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    archivedAt: null,
    avatarColor,
    avatarUrl: null,
    defaultExecutionTarget: { provider: 'claude', instance: 'native', model: 'claude-sonnet' },
    defaultModelSelection: null,
    products: ['chat'],
    memory: emptyMemory,
  };
}

const milo = cat('cat-milo', 'Milo', '#7A5B3A');
const nova = cat('cat-nova', 'Nova', '#3A5B7A');
const boss = cat('cat-boss', 'Boss', '#C9A227', 'admin');

function catParticipant(source: ChatCat): ChatChannelCat {
  return {
    participantId: source.id,
    sourceKind: 'cat',
    sourceRefId: source.id,
    catId: source.id,
    name: source.name,
    roles: [],
    roleHint: null,
    skillProfile: null,
    mcpProfile: null,
    status: 'active',
    joinedAt: '2026-10-01T00:00:00.000Z',
    leftAt: null,
    avatarColor: source.avatarColor,
    avatarUrl: null,
    execution: {
      target: { ...source.defaultExecutionTarget },
      modelSelection: null,
      lease: idleLease(),
    },
    memory: emptyMemory,
  };
}

function tempParticipant(participantId: string, name: string, model: string): ChatChannelParticipant {
  return {
    participantId,
    sourceKind: 'adhoc',
    sourceRefId: null,
    name,
    roles: [],
    roleHint: null,
    skillProfile: null,
    mcpProfile: null,
    status: 'active',
    joinedAt: '2026-10-01T00:00:00.000Z',
    leftAt: null,
    avatarColor: null,
    avatarUrl: null,
    execution: {
      target: { provider: 'claude-cli', instance: null, model },
      modelSelection: null,
      lease: idleLease(),
    },
    memory: emptyMemory,
  };
}

const aria = tempParticipant('participant-aria', 'Aria', 'opus');
/** The default participant a conversation is seeded with: its remembered provider/model. */
const codexDefault: ChatChannelParticipant = {
  ...tempParticipant('participant-default', 'Codex-CLI', 'gpt-sol'),
  execution: {
    target: { provider: 'codex-cli', instance: null, model: 'gpt-sol' },
    modelSelection: null,
    lease: idleLease(),
  },
};
const bram = tempParticipant('participant-bram', 'Bram', 'sonnet');

function createPayload(): AppShellPayload {
  return {
    chat: {
      botBindings: [],
      capabilities: {
        maxCats: 5,
        maxChatParticipants: 5,
        maxAudienceParticipants: MAX_AUDIENCE,
        maxParallelChats: 5,
      },
      cats: [milo, nova, boss],
      channels: [],
      parallelChatGroups: [],
      selectedChannelId: 'channel-1',
      selectedChannel: null,
      conversationBehavior: {
        chat: { showVerboseMessages: false, showLiveProgressDetails: false, concurrentPresentationMode: 'inline_stack' },
        work: { showVerboseMessages: false, showLiveProgressDetails: false, concurrentPresentationMode: 'inline_stack' },
        code: { showVerboseMessages: false, showLiveProgressDetails: false, concurrentPresentationMode: 'inline_stack' },
      },
    },
  } as unknown as AppShellPayload;
}

interface Scenario {
  direct?: boolean;
  participants: Array<ChatChannelCat | ChatChannelParticipant>;
}

function createChannel(scenario: Scenario): SelectedChannelView {
  const assignedCats = scenario.participants.filter(
    (participant): participant is ChatChannelCat => participant.sourceKind === 'cat',
  );
  return {
    id: 'channel-1',
    containerId: 'container-1',
    conversationId: 'conversation-1',
    title: 'Matrix',
    topic: '',
    channelKind: scenario.direct ? 'direct_message' : 'chat_channel',
    coordinatorParticipantId: scenario.participants[0]?.participantId ?? null,
    ownerActorId: 'actor-owner',
    status: 'active',
    unreadCount: 0,
    repoPath: null,
    chatCwd: null,
    language: null,
    responseLanguage: 'en',
    formationMode: 'manual',
    skillProfile: null,
    mcpProfile: null,
    orchestratorRoles: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    lastMessageAt: null,
    lastActivatedAt: null,
    orchestratorLease: { ...idleLease(), status: 'not_started' },
    participantAssignments: [],
    catAssignments: [],
    assignedParticipants: scenario.participants,
    assignedCats,
    messages: [],
    roomRouting: {
      mode: scenario.direct ? 'direct_message' : 'chat_channel',
      defaultRecipientId: scenario.direct ? scenario.participants[0]?.participantId ?? null : null,
      maxContinuations: 3,
      maxDispatchesPerTurn: 4,
      maxTargetVisitsPerTurn: 2,
      lastOutcome: null,
      lastCheckpoint: null,
      lastWakeRequest: null,
      wakeHistory: [],
      workflow: {
        activeTurn: null,
        turnHistory: [],
        eventHistory: [],
        lastCheckpointEvent: null,
        lastOutcomeEvent: null,
      },
    },
    workingMemory: emptyMemory,
  } as SelectedChannelView;
}

/**
 * The props WorkspaceProductApp passes for a started Chat conversation, gated
 * the same way by the conversation's topology, with the composer audience
 * held in state as the app holds it.
 */
const participantActions: string[] = [];

function Harness({
  payload,
  channel,
  onAudienceKeys,
}: {
  payload: AppShellPayload;
  channel: SelectedChannelView;
  onAudienceKeys: (keys: string[]) => void;
}) {
  const [audienceKeys, setAudienceKeys] = useState<string[] | null>(
    () => resolveActiveChannelAudienceState({
      selectedChannel: channel,
      maxAudienceParticipants: MAX_AUDIENCE,
    })?.audienceKeys ?? null,
  );
  const direct = channel.channelKind === 'direct_message';
  const view = deriveAppViewState({
    pathname: direct ? '/chat/dm/cat-milo' : '/chat/chats/channel-1',
    payload,
    draftDefaultRecipientCatId: null,
    selectedChannel: direct ? null : channel,
    selectedDirectLane: direct ? channel : null,
    routeDirectLaneSummary: null,
    showingMyCatDirectLane: direct,
    addCatOpen: false,
    showingNewChatDraft: false,
    draftCatIds: [],
  });
  const audienceSelection = supportsParticipantAudienceSelection(channel);
  const props: ConversationViewProps = {
    payload,
    selectedChannel: channel,
    operatorSnapshot: null,
    operatorLoading: false,
    operatorError: '',
    composerDraft: '',
    busy: clearBusyState(),
    feedback: '',
    greeting: 'Ready.',
    channelFiles: [],
    channelPlusMenuOpen: false,
    channelPlusMenuRef: { current: null },
    channelFileInputRef: { current: null },
    activeAssignedCats: view.activeAssignedCats,
    onComposerChange: noop,
    onComposerKeyDown: noop,
    onSendMessage: noop,
    onToggleChannelPlusMenu: noop,
    onChannelFileSelect: noop,
    onChannelFilesChange: noop,
    onApprovalDecision: noop,
    onChoiceSubmit: noop,
    onUpdateChannelParticipant: async () => {},
    onSetChannelCoordinator: async (participantId, coordinate) => {
      participantActions.push(`${coordinate ? 'coordinate' : 'clear'}:${participantId}`);
    },
    onRemoveChannelParticipant: async (participantId) => {
      participantActions.push(`remove:${participantId}`);
    },
    onOperatorAction: noop,
    autoResize: noop,
    onDirectLaneExecutionTargetChange: noop,
    activeWorkflowShape: 'sequential',
    onToggleActiveWorkflowShape: audienceSelection ? noop : undefined,
    activeAudienceKeys: audienceKeys,
    onSetActiveAudienceKeys: audienceSelection
      ? (keys) => {
          setAudienceKeys(keys);
          onAudienceKeys(keys);
        }
      : undefined,
    onSelect: noop,
    onOpenAddCat: noop,
    showAddCatButton: !direct,
  };
  return <ConversationView {...props} />;
}

function renderConversation(scenario: Scenario, onAudienceKeys: (keys: string[]) => void = noop) {
  const payload = createPayload();
  const channel = createChannel(scenario);
  const view = render(
    <I18nProvider locale="en">
      <MemoryRouter>
        <Harness payload={payload} channel={channel} onAudienceKeys={onAudienceKeys} />
      </MemoryRouter>
    </I18nProvider>,
  );
  return { ...view, channel };
}

/** Each header avatar by its tooltip, marked when it wears the boss frame or opens a popover. */
function describeHeader(container: HTMLElement): string {
  const avatars = container.querySelectorAll('.channelTopBarStart .rosterAvatars .catAvatar');
  return Array.from(avatars, (avatar) => {
    const marks = [
      avatar.classList.contains('catAvatarBoss') ? 'boss' : '',
      avatar.classList.contains('catAvatarEditable') ? 'edit' : '',
    ].filter(Boolean);
    const label = avatar.getAttribute('data-tooltip') ?? '';
    return marks.length > 0 ? `${label} [${marks.join(',')}]` : label;
  }).join(' | ');
}

/** The composer card: avatars, chip label, workflow toggle and add button. */
function describeComposer(container: HTMLElement): string {
  const row = container.querySelector('.composerBottomRow');
  if (!row) return '';
  const parts = [`avatars:${row.querySelectorAll('.composerGroupAvatarSlot').length}`];
  parts.push(`chip:"${row.querySelector('.audienceChipLabel')?.textContent ?? ''}"`);
  if (row.querySelector('.audienceChipWorkflow')) parts.push('workflow');
  return parts.join(' ');
}

function describeChipMode(container: HTMLElement): string {
  const chip = container.querySelector('.composerBottomRow .audienceChip');
  if (!chip) return 'none';
  fireEvent.click(chip);
  const wrapper = chip.closest('.audienceChipWrapper');
  if (wrapper?.querySelector('.audiencePopoverEditor')) return 'model';
  if (wrapper?.querySelector('.audiencePopoverHeader')) return 'audience';
  return 'nothing';
}

function describeMetadata(
  channel: SelectedChannelView,
  audienceKeys: readonly string[] | null,
): string {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: channel,
    maxAudienceParticipants: MAX_AUDIENCE,
    audienceKeys,
    workflowShape: 'sequential',
  });
  if (!metadata) return 'none';
  const recipients = metadata.recipientParticipantIds?.join(',') ?? '';
  return `recipients:[${recipients}] ${metadata.workflowShape ?? ''}`.trim();
}

interface StartedConversationSnapshot {
  header: string;
  composer: string;
  chip: string;
  /** What a send carries with the audience the chip starts with. */
  send: string;
  /** What a send carries after the chip narrows the audience to its first participant. */
  sendFirstOnly: string;
}

function snapshotConversation(scenario: Scenario): StartedConversationSnapshot {
  const initialKeys = resolveActiveChannelAudienceState({
    selectedChannel: createChannel(scenario),
    maxAudienceParticipants: MAX_AUDIENCE,
  })?.audienceKeys ?? null;

  installProviderFetch();
  let latestKeys: string[] | null = initialKeys;
  const { container, channel } = renderConversation(scenario, (keys) => {
    latestKeys = keys;
  });
  const header = describeHeader(container);
  const composer = describeComposer(container);
  const chip = describeChipMode(container);
  let sendFirstOnly = '-';
  if (chip === 'audience') {
    const checks = Array.from(
      container.querySelectorAll<HTMLInputElement>('.audiencePopover .audiencePopoverCheck input'),
    );
    for (const check of checks.slice(1)) {
      if (check.checked) fireEvent.click(check);
    }
    sendFirstOnly = describeMetadata(channel, latestKeys);
  }
  reset();
  return {
    header,
    composer,
    chip,
    send: describeMetadata(channel, initialKeys),
    sendFirstOnly,
  };
}

/**
 * What a started conversation shows and sends. A changed line is an intended
 * change to review, not a test to update in passing.
 */
const cases: Array<{ name: string; scenario: Scenario; expected: StartedConversationSnapshot }> = [
  {
    name: 'direct message with a cat',
    scenario: { direct: true, participants: [catParticipant(milo)] },
    expected: {
      header: 'Milo · Claude-CLI · claude-sonnet [edit]',
      composer: 'avatars:0 chip:"Milo"',
      chip: 'model',
      send: 'none',
      sendFirstOnly: '-',
    },
  },
  {
    name: 'conversation with only its provider/model',
    // Its provider/model is its default participant: shown in the header and named on send.
    scenario: { participants: [codexDefault] },
    expected: {
      header: 'Codex-CLI · gpt-sol [edit]',
      composer: 'avatars:0 chip:"Codex-CLI · gpt-sol"',
      chip: 'model',
      send: 'recipients:[participant-default] sequential',
      sendFirstOnly: '-',
    },
  },
  {
    name: 'conversation with one cat',
    scenario: { participants: [catParticipant(milo)] },
    expected: {
      header: 'Milo · Claude-CLI · claude-sonnet [edit]',
      composer: 'avatars:0 chip:"Milo"',
      chip: 'model',
      send: 'recipients:[cat-milo] sequential',
      sendFirstOnly: '-',
    },
  },
  {
    name: 'conversation with one temporary participant',
    scenario: { participants: [aria] },
    expected: {
      header: 'Claude-CLI · opus [edit]',
      composer: 'avatars:0 chip:"Claude-CLI · opus"',
      chip: 'model',
      send: 'recipients:[participant-aria] sequential',
      sendFirstOnly: '-',
    },
  },
  {
    name: 'conversation with two temporary participants',
    scenario: { participants: [aria, bram] },
    expected: {
      header: 'Claude-CLI · opus [edit] | Claude-CLI · sonnet [edit]',
      composer: 'avatars:0 chip:"Aria +1" workflow',
      chip: 'audience',
      send: 'recipients:[participant-aria,participant-bram] sequential',
      sendFirstOnly: 'recipients:[participant-aria] sequential',
    },
  },
  {
    name: 'conversation with a temporary participant and a cat',
    scenario: { participants: [aria, catParticipant(milo)] },
    expected: {
      header: 'Claude-CLI · opus [edit] | Milo · Claude-CLI · claude-sonnet [edit]',
      composer: 'avatars:0 chip:"Aria +1" workflow',
      chip: 'audience',
      send: 'recipients:[participant-aria,cat-milo] sequential',
      sendFirstOnly: 'recipients:[participant-aria] sequential',
    },
  },
  {
    name: 'conversation with two cats',
    scenario: { participants: [catParticipant(milo), catParticipant(nova)] },
    expected: {
      header: 'Milo · Claude-CLI · claude-sonnet [edit] | Nova · Claude-CLI · claude-sonnet [edit]',
      composer: 'avatars:0 chip:"Milo +1" workflow',
      chip: 'audience',
      send: 'recipients:[cat-milo,cat-nova] sequential',
      sendFirstOnly: 'recipients:[cat-milo] sequential',
    },
  },
  {
    name: 'conversation with a Boss Cat and a cat',
    scenario: { participants: [catParticipant(boss), catParticipant(milo)] },
    expected: {
      header: 'Boss · Claude-CLI · claude-sonnet [boss,edit] | Milo · Claude-CLI · claude-sonnet [edit]',
      composer: 'avatars:0 chip:"Boss +1" workflow',
      chip: 'audience',
      send: 'recipients:[cat-boss,cat-milo] sequential',
      sendFirstOnly: 'recipients:[cat-boss] sequential',
    },
  },
];

for (const { name, scenario, expected } of cases) {
  test(`started conversation composer: ${name}`, (t) => {
    reset();
    t.after(reset);
    assert.deepEqual(snapshotConversation(scenario), expected);
  });
}

/** The conversation actions each header avatar's popover offers, in avatar order. */
function describeHeaderActions(scenario: Scenario): string[] {
  installProviderFetch();
  const { container } = renderConversation(scenario);
  const lines: string[] = [];
  const count = container.querySelectorAll('.channelTopBarStart .rosterAvatars .catAvatar').length;
  for (let index = 0; index < count; index += 1) {
    const avatar = container.querySelectorAll('.channelTopBarStart .rosterAvatars .catAvatar')[index]!;
    fireEvent.click(avatar);
    const labels = Array.from(
      container.querySelectorAll('.audiencePopoverEditor .audiencePopoverAction'),
      (button) => button.textContent ?? '',
    );
    lines.push(labels.join(', ') || '-');
    fireEvent.click(avatar);
  }
  reset();
  return lines;
}

test('a participant popover moves or clears the coordinator and removes while another remains', (t) => {
  reset();
  t.after(reset);
  const twoTemps: Scenario = {
    participants: [
      tempParticipant('participant-opus', 'Opus Helper', 'opus'),
      tempParticipant('participant-sonnet', 'Sonnet Helper', 'sonnet'),
    ],
  };
  // The first participant is bound as the coordinator at creation (FR-11).
  assert.deepEqual(describeHeaderActions(twoTemps), [
    'Stop coordinating, Remove from conversation',
    'Make coordinator, Remove from conversation',
  ]);
  assert.deepEqual(describeHeaderActions({
    participants: [tempParticipant('participant-opus', 'Opus Helper', 'opus')],
  }), ['Stop coordinating'], 'the last participant cannot be removed (FR-4)');
  assert.deepEqual(describeHeaderActions({
    direct: true,
    participants: [catParticipant(milo)],
  }), ['-'], 'a DM stays coordinated by its cat');

  participantActions.length = 0;
  installProviderFetch();
  const view = renderConversation(twoTemps);
  const avatars = view.container.querySelectorAll('.channelTopBarStart .rosterAvatars .catAvatar');
  fireEvent.click(avatars[1]!);
  fireEvent.click(view.getByRole('button', { name: 'Make coordinator' }));
  fireEvent.click(avatars[0]!);
  fireEvent.click(view.getByRole('button', { name: 'Remove from conversation' }));
  assert.deepEqual(participantActions, ['coordinate:participant-sonnet', 'remove:participant-opus']);
});
