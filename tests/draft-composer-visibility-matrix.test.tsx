// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from '../src/products/chat/renderer/components/NewChatDraft.tsx';
import type {
  NewChatPreset,
} from '../src/products/shared/renderer/draftStarterSuggestionContext.ts';
import {
  resolveNewConversationDraftBuilderControls,
} from '../src/products/shared/renderer/draftBuilderControls.ts';
import type {
  DraftParallelTarget,
  DraftTemporaryParticipant,
} from '../src/products/shared/renderer/draftChatUtils.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const originalFetch = globalThis.fetch;
const noop = () => {};

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
          id: 'cat-milo',
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

const godCatTarget = {
  provider: 'codex-cli',
  instance: null,
  model: 'gpt-sol',
  modelSelection: null,
};

function temp(participantId: string, name: string): DraftTemporaryParticipant {
  return { participantId, name, provider: 'claude-cli', model: 'opus', modelSelection: null };
}

function lane(audienceKeys: string[] | null): DraftParallelTarget {
  return { ...godCatTarget, audienceKeys, workflowShape: 'sequential' };
}

interface Scenario {
  advanced: boolean;
  preset: NewChatPreset;
  draftCatIds?: string[];
  temps?: DraftTemporaryParticipant[];
  parallelTargets?: DraftParallelTarget[];
  directLaneCatId?: string;
}

/**
 * The draft props WorkspaceProductApp passes for a Chat draft, gated the same
 * way by the advanced draft controls setting and the visible parallel lanes.
 */
function buildProps(scenario: Scenario): NewChatDraftProps {
  const generic = !scenario.directLaneCatId;
  const targets = scenario.parallelTargets ?? [];
  const hasVisibleLanes = generic && targets.length > 1;
  const showingParallel = scenario.preset === 'parallel';
  const advanced = scenario.advanced;
  return {
    payload: createPayload(),
    composerDraft: '',
    busy: clearBusyState(),
    greeting: 'Ready.',
    draftFiles: [],
    draftCwd: null,
    draftCatIds: scenario.draftCatIds ?? [],
    draftTemporaryParticipants: scenario.temps ?? [],
    plusMenuOpen: false,
    plusMenuRef: { current: null },
    fileInputRef: { current: null },
    bossCatName: 'Boss Cat',
    bossCatAvatarColor: null,
    onComposerChange: noop,
    onComposerKeyDown: noop,
    onSendMessage: noop,
    onTogglePlusMenu: noop,
    onFileSelect: noop,
    onPickFolder: noop,
    onOpenAddCat: noop,
    onDraftFilesChange: noop,
    onDraftCwdClear: noop,
    onToggleDraftCat: noop,
    onAddDraftTemporaryParticipant: noop,
    onQuickAddDraftTemporaryParticipant: noop,
    onRemoveDraftTemporaryParticipant: noop,
    onUpdateDraftTemporaryParticipant: noop,
    autoResize: noop,
    draftDefaultRecipientCatId: scenario.directLaneCatId ?? null,
    allowAddCat: generic,
    entryPreset: scenario.preset,
    selectedExecutionTarget: godCatTarget,
    onExecutionTargetChange: noop,
    draftHighlightedCatId: null,
    draftCatExecutionTargetOverrides: new Map(),
    onDraftCatExecutionTargetOverride: noop,
    parallelTargets: hasVisibleLanes ? targets : undefined,
    onParallelTargetChange: showingParallel || hasVisibleLanes ? noop : undefined,
    onAddParallelTarget: generic && (advanced || hasVisibleLanes) ? noop : undefined,
    onRemoveParallelTarget: showingParallel || hasVisibleLanes ? noop : undefined,
    parallelBranchActions: {
      onPickFolder: advanced && hasVisibleLanes ? noop : undefined,
      onSetAudienceKeys: hasVisibleLanes ? noop : undefined,
      onSetCwd: hasVisibleLanes ? noop : undefined,
      onSetRuntimeSessionPolicy: advanced && hasVisibleLanes ? noop : undefined,
      onToggleWorkflowShape: hasVisibleLanes ? noop : undefined,
      onQuickAddTemporaryParticipant: advanced && hasVisibleLanes ? noop : undefined,
    },
    builderControls: resolveNewConversationDraftBuilderControls({
      advancedDraftControlsEnabled: advanced,
      entryPreset: scenario.preset,
      showStructuredDraftControls: generic,
      hasVisibleParallelDraftTargets: hasVisibleLanes,
    }),
    onToggleDraftWorkflowShape: noop,
    onSetAudienceKeys: noop,
    draftSurface: 'chat',
    onDraftSurfaceChange: noop,
  };
}

function renderDraft(scenario: Scenario) {
  return render(
    <I18nProvider locale="en">
      <MemoryRouter>
        <NewChatDraft {...buildProps(scenario)} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

/** A control's styling as the owner checks it: blue accent, red danger hover or plain. */
function tone(element: Element): string {
  const classNames = (element.getAttribute('class') ?? '').split(/\s+/u);
  if (classNames.some((name) => name.endsWith('Accent'))) return 'accent';
  if (classNames.some((name) => name.endsWith('Danger'))) return 'danger';
  return 'plain';
}

function tones(root: ParentNode, selector: string): string {
  return Array.from(root.querySelectorAll(selector), tone).join(',');
}

/** One line per composer card: avatars, ×, collaborate button, hint, chip label, workflow toggle. */
function describeRow(row: Element): string {
  const parts = [`avatars:${row.querySelectorAll('.composerGroupAvatarSlot').length}`];
  const removes = tones(row, '.composerGroupAvatarRemove');
  if (removes) parts.push(`remove:${removes}`);
  const collaborate = tones(row, '.parallelAddButton');
  if (collaborate) parts.push(`collaborate:${collaborate}`);
  const hints = tones(row, '.parallelAddHint');
  if (hints) parts.push(`hint:${hints}`);
  parts.push(`chip:"${row.querySelector('.audienceChipLabel')?.textContent ?? ''}"`);
  if (row.querySelector('.audienceChipWorkflow')) parts.push('workflow');
  return parts.join(' ');
}

/** The +compare button and its hint, shown on the last lane once the carousel is there. */
function describeLastLane(container: HTMLElement): string {
  for (let guard = 0; guard < 10; guard += 1) {
    const next = container.querySelector('.draftCompareCarouselNavNext');
    if (!next) break;
    fireEvent.click(next);
  }
  const parts: string[] = [];
  const compare = tones(container, '.draftCompareCarouselAddBranch');
  if (compare) parts.push(`compare:${compare}`);
  const hints = tones(container, '.draftCompareCarouselAddBranchSlot .parallelAddHint');
  if (hints) parts.push(`hint:${hints}`);
  return parts.join(' ');
}

/** What clicking each card's audience chip opens, in card order. */
function describeChipModes(scenario: Scenario, chipCount: number): string[] {
  const modes: string[] = [];
  for (let index = 0; index < chipCount; index += 1) {
    installProviderFetch();
    const { container } = renderDraft(scenario);
    const chip = container.querySelectorAll('.audienceChip')[index];
    fireEvent.click(chip);
    const wrapper = chip.closest('.audienceChipWrapper');
    if (wrapper?.querySelector('.audiencePopoverEditor')) {
      modes.push('model');
    } else if (wrapper?.querySelector('.audiencePopoverHeader')) {
      modes.push('audience');
    } else if (container.querySelector('.sidePanelBody')) {
      modes.push('side panel');
    } else {
      modes.push('nothing');
    }
    reset();
  }
  return modes;
}

interface DraftComposerSnapshot {
  rows: string[];
  branchRemove: string;
  lastLane: string;
  chips: string[];
}

function snapshotDraft(scenario: Scenario): DraftComposerSnapshot {
  const { container } = renderDraft(scenario);
  const rows = Array.from(container.querySelectorAll('.composerBottomRow'), describeRow);
  const branchRemove = tones(container, '.composerCardBranchRemove');
  const chipCount = container.querySelectorAll('.audienceChip').length;
  const lastLane = describeLastLane(container);
  reset();
  return { rows, branchRemove, lastLane, chips: describeChipModes(scenario, chipCount) };
}

const twoTemps = (): DraftTemporaryParticipant[] => [temp('a', 'Aria'), temp('b', 'Bram')];

/**
 * Which composer controls each draft shows, and in which tone, with the
 * advanced draft controls setting off and on. These were checked by eye; a
 * changed line here is a visible regression, not a test to update.
 */
const cases: Array<{ name: string; scenario: Scenario; expected: DraftComposerSnapshot }> = [
  {
    name: 'new chat with God Cat, advanced off',
    scenario: { advanced: false, preset: 'default' },
    expected: {
      rows: ['avatars:0 chip:"Codex-CLI · gpt-sol"'],
      branchRemove: '',
      lastLane: '',
      chips: ['model'],
    },
  },
  {
    name: 'new chat with God Cat, advanced on',
    scenario: { advanced: true, preset: 'default' },
    expected: {
      rows: ['avatars:0 collaborate:plain chip:"Codex-CLI · gpt-sol"'],
      branchRemove: '',
      lastLane: 'compare:plain',
      chips: ['model'],
    },
  },
  {
    name: 'new chat grown to two participants, advanced on',
    scenario: { advanced: true, preset: 'default', temps: twoTemps() },
    expected: {
      rows: ['avatars:2 remove:plain,plain collaborate:plain chip:"Aria +1" workflow'],
      branchRemove: '',
      lastLane: 'compare:plain',
      chips: ['audience'],
    },
  },
  {
    name: 'group with two participants, advanced off',
    scenario: { advanced: false, preset: 'group', temps: twoTemps() },
    expected: {
      rows: ['avatars:2 collaborate:accent hint:accent chip:"Aria +1" workflow'],
      branchRemove: '',
      lastLane: '',
      chips: ['audience'],
    },
  },
  {
    name: 'group with a cat and two participants, advanced off',
    scenario: { advanced: false, preset: 'group', draftCatIds: ['cat-milo'], temps: twoTemps() },
    expected: {
      rows: [
        'avatars:3 remove:danger,danger,danger collaborate:accent hint:accent'
          + ' chip:"Milo +2" workflow',
      ],
      branchRemove: '',
      lastLane: '',
      chips: ['audience'],
    },
  },
  {
    name: 'group with two participants, advanced on',
    scenario: { advanced: true, preset: 'group', temps: twoTemps() },
    expected: {
      rows: ['avatars:2 collaborate:accent hint:accent chip:"Aria +1" workflow'],
      branchRemove: '',
      lastLane: 'compare:plain',
      chips: ['audience'],
    },
  },
  {
    name: 'parallel with two model lanes, advanced off',
    scenario: { advanced: false, preset: 'parallel', parallelTargets: [lane(null), lane(null)] },
    expected: {
      rows: ['avatars:0 chip:"Codex-CLI · gpt-sol"', 'avatars:0 chip:"Codex-CLI · gpt-sol"'],
      branchRemove: 'accent,accent',
      lastLane: 'compare:accent hint:accent',
      chips: ['model', 'model'],
    },
  },
  {
    name: 'parallel with two model lanes, advanced on',
    scenario: { advanced: true, preset: 'parallel', parallelTargets: [lane(null), lane(null)] },
    expected: {
      rows: [
        'avatars:0 collaborate:plain chip:"Codex-CLI · gpt-sol"',
        'avatars:0 collaborate:plain chip:"Codex-CLI · gpt-sol"',
      ],
      branchRemove: 'accent,accent',
      lastLane: 'compare:accent hint:accent',
      chips: ['model', 'model'],
    },
  },
  {
    name: 'parallel whose lead lane has two members, advanced on',
    scenario: {
      advanced: true,
      preset: 'parallel',
      temps: twoTemps(),
      parallelTargets: [lane(['temp:a', 'temp:b']), lane(null)],
    },
    expected: {
      rows: [
        'avatars:2 remove:plain,plain collaborate:plain chip:"Aria +1" workflow',
        'avatars:0 collaborate:plain chip:"Codex-CLI · gpt-sol"',
      ],
      branchRemove: 'accent,accent',
      lastLane: 'compare:accent hint:accent',
      chips: ['audience', 'model'],
    },
  },
  {
    // The lead roster lists only the lead lane's members while its chip
    // picks from the whole pool, so one hides while the other still selects.
    name: 'parallel whose lead lane has one member of a two-member pool, advanced on',
    scenario: {
      advanced: true,
      preset: 'parallel',
      temps: twoTemps(),
      parallelTargets: [lane(['temp:a']), lane(['temp:b'])],
    },
    expected: {
      rows: [
        'avatars:0 collaborate:plain chip:"Claude-CLI · opus"',
        'avatars:0 collaborate:plain chip:"Codex-CLI · gpt-sol"',
      ],
      branchRemove: 'accent,accent',
      lastLane: 'compare:accent hint:accent',
      chips: ['audience', 'model'],
    },
  },
  {
    name: 'new chat compared into two lanes, advanced on',
    scenario: { advanced: true, preset: 'default', parallelTargets: [lane(null), lane(null)] },
    expected: {
      rows: [
        'avatars:0 collaborate:plain chip:"Codex-CLI · gpt-sol"',
        'avatars:0 collaborate:plain chip:"Codex-CLI · gpt-sol"',
      ],
      branchRemove: 'plain,plain',
      lastLane: 'compare:plain',
      chips: ['model', 'model'],
    },
  },
  {
    name: 'group compared into two lanes, advanced on',
    scenario: {
      advanced: true,
      preset: 'group',
      temps: twoTemps(),
      parallelTargets: [lane(['temp:a', 'temp:b']), lane(null)],
    },
    expected: {
      rows: [
        'avatars:2 collaborate:accent hint:accent chip:"Aria +1" workflow',
        'avatars:0 collaborate:plain chip:"Codex-CLI · gpt-sol"',
      ],
      branchRemove: 'plain,plain',
      lastLane: 'compare:plain',
      chips: ['audience', 'model'],
    },
  },
  {
    name: 'direct lane with one cat, advanced on',
    scenario: { advanced: true, preset: 'default', directLaneCatId: 'cat-milo' },
    expected: {
      rows: ['avatars:0 chip:"Milo"'],
      branchRemove: '',
      lastLane: '',
      chips: ['model'],
    },
  },
];

for (const { name, scenario, expected } of cases) {
  test(`draft composer controls: ${name}`, (t) => {
    reset();
    t.after(reset);
    assert.deepEqual(snapshotDraft(scenario), expected);
  });
}
