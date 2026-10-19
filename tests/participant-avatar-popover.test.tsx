// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
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
import type { AudienceTargetEditor } from '../src/products/shared/renderer/components/AudienceChip.tsx';
import { BranchAudienceRoster } from '../src/products/shared/renderer/components/BranchAudienceRoster.tsx';
import {
  ParticipantAddMenu,
  type ParticipantAddMenuProps,
} from '../src/products/shared/renderer/components/ParticipantAddMenu.tsx';
import {
  ConversationViewTopBar,
  type ConversationViewTopBarAvatar,
} from '../src/products/shared/renderer/components/conversation-view/ConversationViewTopBar.tsx';
import type { ExecutionTargetValue } from '../src/products/shared/renderer/components/ExecutionTarget.ts';
import type {
  DraftComposerStackParticipant,
} from '../src/products/shared/renderer/components/newConversationDraftSupport.ts';
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

// The popover's picker reads through the shared client caches.
function installProviderFetch(): void {
  const catalog = {
    provider: 'claude', backend: 'cli', instance: 'cli/native', defaultModel: 'opus', source: 'dynamic',
    cache: null,
    models: [{ id: 'opus', label: 'Opus', default: true }],
    entries: [{ id: 'opus', label: 'Opus', default: true }],
    presets: [], controls: [], defaultSelection: { entryId: 'opus', entryMode: 'explicit' },
    support: { tier: 'full', notes: [] }, warnings: [],
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (/\/api\/providers(?:\?|$)/u.test(String(input))) {
      return Response.json({ state: 'ready', revision: 'r1', providers: [{
        id: 'claude', label: 'Claude', defaultModel: 'opus', defaultInstance: 'native', defaultBackend: 'cli',
        instances: [{ id: 'native', target: 'cli/native', label: 'Native', backend: 'cli', default: true }],
        modelsPath: '/api/providers/claude/models',
      }] });
    }
    return Response.json({ catalog });
  }) as typeof fetch;
}

const target: ExecutionTargetValue = {
  provider: 'claude',
  instance: 'cli/native',
  model: 'opus',
  modelSelection: null,
};

function cat(id: string, name: string): DraftComposerStackParticipant {
  return {
    key: `cat:${id}`, name, executionLabel: 'Stale label', avatarColor: '#8B7E74', avatarUrl: null,
    isCat: true, catId: id, participantId: null,
  };
}

function renderRoster(props: Partial<React.ComponentProps<typeof BranchAudienceRoster>> = {}) {
  return render(
    <I18nProvider locale="en">
      <BranchAudienceRoster
        audienceParticipants={[cat('mochi', 'Mochi'), cat('tora', 'Tora')]}
        isSubmittingFirstTurn={false}
        canRemoveParticipant
        onRemoveParticipant={noop}
        {...props}
      />
    </I18nProvider>,
  );
}

test('a roster avatar opens its own participant\'s model popover above the composer', async (t) => {
  reset(); t.after(reset); installProviderFetch();
  const opened: string[] = [];
  const removed: string[] = [];
  const view = renderRoster({
    resolveTargetEditor: (participant) => ({
      target,
      onChange: noop,
      onOpenSettings: () => opened.push(participant.name),
    }),
    onAvatarClick: () => assert.fail('the side panel must not open'),
    onRemoveParticipant: (participant) => removed.push(participant.name),
  });

  const tora = view.getByRole('button', { name: "Change Tora's model" });
  // The avatar describes the target its popover edits, not a stale label.
  assert.match(tora.getAttribute('data-tooltip') ?? '', /^Tora · /u);
  assert.doesNotMatch(tora.getAttribute('data-tooltip') ?? '', /Stale label/u);

  fireEvent.click(tora);
  const dialog = view.getByRole('dialog', { name: 'Tora' });
  assert.ok(dialog.classList.contains('audiencePopoverStart'), 'it opens from the roster start edge');
  assert.ok(!dialog.classList.contains('audiencePopoverBelow'));
  assert.ok(dialog.querySelector('.audiencePopoverEditorHeader'));
  assert.equal(tora.getAttribute('aria-expanded'), 'true');
  await waitFor(() => assert.equal(
    (view.getByRole('combobox', { name: /^Provider/u }) as HTMLSelectElement).value,
    'claude',
  ));

  // Another avatar swaps the popover; one floating layer only.
  fireEvent.click(view.getByRole('button', { name: "Change Mochi's model" }));
  assert.equal(view.getAllByRole('dialog').length, 1);
  view.getByRole('dialog', { name: 'Mochi' });

  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(view.queryByRole('dialog'), null);

  fireEvent.keyDown(tora, { key: 'Enter' });
  view.getByRole('dialog', { name: 'Tora' });
  fireEvent.mouseDown(document.body);
  assert.equal(view.queryByRole('dialog'), null);

  fireEvent.click(view.getByRole('button', { name: 'Remove Tora' }));
  assert.deepEqual(removed, ['Tora']);
  assert.equal(view.queryByRole('dialog'), null, 'removing does not open the picker');

  fireEvent.click(tora);
  fireEvent.click(view.getByRole('button', { name: "Edit Tora's settings" }));
  assert.deepEqual(opened, ['Tora']);
  assert.equal(view.queryByRole('dialog'), null);
});

test('a roster avatar without an editor keeps its fallback action', (t) => {
  reset(); t.after(reset);
  let fallbacks = 0;
  const view = renderRoster({
    resolveTargetEditor: () => null,
    onAvatarClick: () => { fallbacks += 1; },
  });

  const avatars = view.container.querySelectorAll('.catAvatar');
  assert.equal(view.queryByRole('button', { name: "Change Tora's model" }), null);
  fireEvent.click(avatars[1]!);
  assert.equal(fallbacks, 1);
  assert.equal(view.queryByRole('dialog'), null);
});

test('roster avatars stay inert while the first turn is being sent', (t) => {
  reset(); t.after(reset);
  const view = renderRoster({
    isSubmittingFirstTurn: true,
    resolveTargetEditor: () => ({ target, onChange: noop }),
    onAvatarClick: () => assert.fail('nothing opens while sending'),
  });

  fireEvent.click(view.container.querySelectorAll('.catAvatar')[1]!);
  assert.equal(view.queryByRole('dialog'), null);
});

function createDraftPayload(): AppShellPayload {
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
          defaultExecutionTarget: { provider: 'claude', instance: 'native', model: 'claude-sonnet' },
          defaultModelSelection: null,
        },
      ],
    },
  } as unknown as AppShellPayload;
}

function createGroupDraftProps(overrides: Partial<NewChatDraftProps> = {}): NewChatDraftProps {
  return {
    payload: createDraftPayload(),
    composerDraft: '',
    busy: clearBusyState(),
    greeting: 'Ready.',
    draftFiles: [],
    draftCwd: null,
    draftCatIds: ['cat-milo'],
    draftTemporaryParticipants: [
      { participantId: 'a', name: 'Aria', provider: 'claude-cli', model: 'opus', modelSelection: null },
    ],
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
    onRemoveDraftTemporaryParticipant: noop,
    onUpdateDraftTemporaryParticipant: noop,
    autoResize: noop,
    draftDefaultRecipientCatId: null,
    entryPreset: 'group',
    draftHighlightedCatId: null,
    onHighlightDraftCat: noop,
    draftCatExecutionTargetOverrides: new Map(),
    onDraftCatExecutionTargetOverride: noop,
    onSetAudienceKeys: noop,
    onToggleDraftWorkflowShape: noop,
    draftSurface: 'chat',
    onDraftSurfaceChange: noop,
    ...overrides,
  };
}

test('a group draft avatar edits the draft pick for its cat, not the side panel', (t) => {
  reset(); t.after(reset); installProviderFetch();
  const override: ExecutionTargetValue = {
    provider: 'codex-cli',
    instance: null,
    model: 'gpt-sol',
    modelSelection: null,
  };
  const view = render(
    <I18nProvider locale="en">
      <MemoryRouter>
        <NewChatDraft {...createGroupDraftProps({
          draftCatExecutionTargetOverrides: new Map([['cat-milo', override]]),
        })}
        />
      </MemoryRouter>
    </I18nProvider>,
  );

  const milo = view.getByRole('button', { name: "Change Milo's model" });
  // The tooltip follows the draft pick, which is what the conversation will use.
  assert.equal(milo.getAttribute('data-tooltip'), 'Milo · Codex-CLI · gpt-sol');

  fireEvent.click(milo);
  view.getByRole('dialog', { name: 'Milo' });
  view.getByRole('button', { name: "Edit Milo's settings" });
  assert.equal(view.container.querySelector('.sidePanelBody'), null);
});

function topBarAvatar(overrides: Partial<ConversationViewTopBarAvatar>): ConversationViewTopBarAvatar {
  return {
    key: 'participant:p-mochi',
    label: 'Mochi',
    executionLabel: 'Claude-CLI · opus',
    avatarColor: '#8B7E74',
    avatarUrl: null,
    ...overrides,
  };
}

test('a conversation top bar avatar opens its participant\'s model popover below the bar', (t) => {
  reset(); t.after(reset); installProviderFetch();
  const editor: AudienceTargetEditor = { target, onChange: noop };
  const view = render(
    <I18nProvider locale="en">
      <ConversationViewTopBar
        avatars={[
          topBarAvatar({ key: 'participant:boss', label: 'Boss', isBoss: true, editor: null }),
          topBarAvatar({ editor }),
        ]}
        showRosterAvatars
        isDirectLane={false}
        topBarTitle="Review"
        sidePanelOpen={false}
        approvalCount={0}
        onToggleSidePanel={noop}
      />
    </I18nProvider>,
  );

  // An avatar with nothing to edit stays a plain status mark.
  const avatars = view.container.querySelectorAll('.rosterAvatars .catAvatar');
  assert.equal(avatars[0]!.getAttribute('role'), null);
  assert.ok(!avatars[0]!.classList.contains('catAvatarEditable'));

  const mochi = view.getByRole('button', { name: "Change Mochi's model" });
  assert.ok(mochi.classList.contains('catAvatarEditable'));
  fireEvent.click(mochi);
  const dialog = view.getByRole('dialog', { name: 'Mochi' });
  assert.ok(dialog.classList.contains('audiencePopoverBelow'));
  assert.equal(mochi.getAttribute('data-tooltip'), null, 'the tooltip yields to the open popover');
  // The bar rises above the docked composer while its popover hangs over the transcript.
  const bar = view.container.querySelector('.channelTopBar')!;
  assert.ok(bar.classList.contains('channelTopBarPopoverOpen'));

  fireEvent.click(mochi);
  assert.equal(view.queryByRole('dialog'), null);
  assert.ok(!bar.classList.contains('channelTopBarPopoverOpen'));
});

test('a temporary participant\'s popover saves its name and role hint as each field is left', (t) => {
  reset(); t.after(reset); installProviderFetch();
  const saves: Array<{ name?: string; roleHint?: string | null }> = [];
  const temp: DraftComposerStackParticipant = {
    key: 'temp:aria', name: 'Aria', executionLabel: null, avatarColor: null, avatarUrl: null,
    isCat: false, catId: null, participantId: 'aria',
  };
  const view = renderRoster({
    audienceParticipants: [temp, cat('tora', 'Tora')],
    resolveTargetEditor: (participant) => (participant.key === 'temp:aria'
      ? {
          target,
          onChange: noop,
          profile: { name: 'Aria', roleHint: null, onSave: (update) => saves.push(update) },
        }
      : null),
  });

  fireEvent.click(view.getByRole('button', { name: "Change Aria's model" }));
  const name = view.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
  const roleHint = view.getByRole('textbox', { name: 'Role Hint' }) as HTMLInputElement;

  fireEvent.change(name, { target: { value: '  Critic ' } });
  fireEvent.blur(name);
  fireEvent.blur(name);
  assert.deepEqual(saves, [{ name: 'Critic' }], 'an unchanged field saves once');

  fireEvent.change(name, { target: { value: '   ' } });
  fireEvent.blur(name);
  assert.equal(saves.length, 1, 'a participant keeps a name');
  assert.equal(name.value, 'Critic');

  fireEvent.change(roleHint, { target: { value: 'Skeptic' } });
  fireEvent.keyDown(roleHint, { key: 'Enter' });
  assert.deepEqual(saves.at(-1), { roleHint: 'Skeptic' });

  // Escape in a field discards what is being typed there.
  fireEvent.change(roleHint, { target: { value: 'Contrarian' } });
  fireEvent.keyDown(roleHint, { key: 'Escape' });
  assert.equal(view.queryByRole('dialog'), null);
  assert.equal(saves.length, 2);

  // Closing the popover any other way keeps a change still being typed.
  fireEvent.click(view.getByRole('button', { name: "Change Aria's model" }));
  fireEvent.change(view.getByRole('textbox', { name: 'Role Hint' }), { target: { value: 'Mediator' } });
  fireEvent.mouseDown(document.body);
  assert.equal(view.queryByRole('dialog'), null);
  assert.deepEqual(saves.at(-1), { roleHint: 'Mediator' });
});

test('a participant from an assistant preset shows its model and role hint read-only', (t) => {
  reset(); t.after(reset); installProviderFetch();
  const view = renderRoster({
    resolveTargetEditor: (participant) => (participant.key === 'cat:tora'
      ? { target, profile: { name: 'Tora', roleHint: 'Reviews diffs' } }
      : null),
  });

  fireEvent.click(view.getByRole('button', { name: "Change Tora's model" }));
  const dialog = view.getByRole('dialog', { name: 'Tora' });
  assert.equal(view.queryByRole('combobox'), null, 'no picker');
  assert.equal(view.queryByRole('textbox'), null, 'no profile fields');
  assert.ok(dialog.querySelector('.audiencePopoverModelReadOnly')?.textContent);
  assert.equal(dialog.querySelector('.audiencePopoverRoleHint')?.textContent, 'Reviews diffs');
});

function renderAddMenu(props: Partial<ParticipantAddMenuProps> = {}) {
  return render(
    <I18nProvider locale="en">
      <ParticipantAddMenu
        buttonClassName="parallelAddButton"
        ariaLabel="Add another model to collaborate"
        disabled={false}
        icon={<span>+</span>}
        onAddTemporaryParticipant={noop}
        cats={[]}
        onAddCat={noop}
        presets={[]}
        onAddPreset={noop}
        atLimit={false}
        {...props}
      />
    </I18nProvider>,
  );
}

test('the add button adds a temporary participant at once when no cat or assistant could join', (t) => {
  reset(); t.after(reset);
  let added = 0;
  const view = renderAddMenu({
    onAddTemporaryParticipant: () => { added += 1; },
    cats: [{ id: 'milo', name: 'Milo', avatarColor: null, avatarUrl: null, added: true }],
    presets: [{
      id: 'reviewer', name: 'Reviewer', executionLabel: 'Claude', added: false, reviewReasons: ['shell'],
    }],
  });

  const button = view.getByRole('button', { name: 'Add another model to collaborate' });
  assert.equal(button.getAttribute('aria-haspopup'), null);
  fireEvent.click(button);
  assert.equal(added, 1);
  assert.equal(view.queryByRole('menu'), null);
});

test('the add button offers a temporary participant, existing cats and assistants', (t) => {
  reset(); t.after(reset);
  const calls: string[] = [];
  const view = renderAddMenu({
    onAddTemporaryParticipant: () => calls.push('temporary'),
    cats: [
      { id: 'milo', name: 'Milo', avatarColor: null, avatarUrl: null, added: true },
      { id: 'pico', name: 'Pico', avatarColor: null, avatarUrl: null, added: false },
    ],
    onAddCat: (catId) => calls.push(`cat:${catId}`),
    presets: [
      { id: 'reviewer', name: 'Reviewer', executionLabel: 'Claude', added: false, reviewReasons: null },
      { id: 'shell', name: 'Shell', executionLabel: 'Codex', added: false, reviewReasons: ['shell access'] },
    ],
    onAddPreset: (presetId) => calls.push(`preset:${presetId}`),
  });

  const button = view.getByRole('button', { name: 'Add another model to collaborate' });
  fireEvent.click(button);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  const items = view.getAllByRole('menuitem') as HTMLButtonElement[];
  assert.deepEqual(
    items.map((item) => [
      item.querySelector('.audiencePopoverName')?.textContent,
      item.querySelector('.composerAddMenuStatus')?.textContent ?? null,
    ]),
    [
      ['Add temporary participant', null],
      ['Milo', 'Added'],
      ['Pico', null],
      ['Reviewer', null],
      ['Shell', 'Review'],
    ],
  );
  assert.ok(items[1]!.disabled, 'an added cat is removed with its ×');
  assert.ok(items[4]!.disabled, 'an assistant awaiting review cannot join');

  fireEvent.click(items[2]!);
  assert.deepEqual(calls, ['cat:pico']);
  assert.equal(view.queryByRole('menu'), null);

  fireEvent.click(button);
  fireEvent.click(view.getAllByRole('menuitem')[3]!);
  fireEvent.click(button);
  fireEvent.click(view.getAllByRole('menuitem')[0]!);
  assert.deepEqual(calls, ['cat:pico', 'preset:reviewer', 'temporary']);
});

test('a full conversation keeps only the temporary participant choice open in the add menu', (t) => {
  reset(); t.after(reset);
  const view = renderAddMenu({
    cats: [{ id: 'pico', name: 'Pico', avatarColor: null, avatarUrl: null, added: false }],
    atLimit: true,
  });

  fireEvent.click(view.getByRole('button', { name: 'Add another model to collaborate' }));
  const items = view.getAllByRole('menuitem') as HTMLButtonElement[];
  assert.ok(!items[0]!.disabled);
  assert.ok(items[1]!.disabled);
});

test('a group draft adds an existing cat from the add menu; a new chat still seeds in one click', (t) => {
  reset(); t.after(reset);
  const toggled: string[] = [];
  let quickAdds = 0;
  const group = render(
    <I18nProvider locale="en">
      <MemoryRouter>
        <NewChatDraft {...createGroupDraftProps({
          draftCatIds: [],
          draftTemporaryParticipants: [
            { participantId: 'a', name: 'Aria', provider: 'claude-cli', model: 'opus', modelSelection: null },
            { participantId: 'b', name: 'Bram', provider: 'claude-cli', model: 'opus', modelSelection: null },
          ],
          onToggleDraftCat: (catId) => toggled.push(catId),
          onQuickAddDraftTemporaryParticipant: () => { quickAdds += 1; },
        })}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  fireEvent.click(group.getByRole('button', { name: 'Add another model to collaborate' }));
  fireEvent.click(group.getByRole('menuitem', { name: /Milo/u }));
  assert.deepEqual(toggled, ['cat-milo']);
  assert.equal(group.container.querySelector('.sidePanelBody'), null);
  group.unmount();

  const fresh = render(
    <I18nProvider locale="en">
      <MemoryRouter>
        <NewChatDraft {...createGroupDraftProps({
          entryPreset: 'default',
          draftCatIds: [],
          draftTemporaryParticipants: [],
          builderControls: { showGroupAddButton: true, hideGroupHint: true },
          onQuickAddDraftTemporaryParticipant: () => { quickAdds += 1; },
        })}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  fireEvent.click(fresh.getByRole('button', { name: 'Add another model to collaborate' }));
  assert.equal(quickAdds, 1);
  assert.equal(fresh.queryByRole('menu'), null);
});

test('a conversation header adds a cat through the add-cat panel', (t) => {
  reset(); t.after(reset);
  let opened = 0;
  const view = render(
    <I18nProvider locale="en">
      <ConversationViewTopBar
        avatars={[topBarAvatar({ editor: null })]}
        showRosterAvatars
        isDirectLane={false}
        topBarTitle="Review"
        sidePanelOpen={false}
        approvalCount={0}
        onToggleSidePanel={noop}
        onAddParticipant={() => { opened += 1; }}
      />
    </I18nProvider>,
  );
  fireEvent.click(view.getByRole('button', { name: 'Choose cats' }));
  assert.equal(opened, 1);
});

test('a parallel draft offers existing cats only once its lead lane has members', (t) => {
  reset(); t.after(reset);
  let quickAdds = 0;
  const lane = (audienceKeys: string[] | null) => ({
    provider: 'codex-cli', instance: null, model: 'gpt-sol', modelSelection: null,
    audienceKeys, workflowShape: 'sequential' as const,
  });
  const parallelProps = (overrides: Partial<NewChatDraftProps>) => createGroupDraftProps({
    entryPreset: 'parallel',
    draftCatIds: [],
    builderControls: { showGroupAddButton: true, hideGroupHint: true },
    onQuickAddDraftTemporaryParticipant: () => { quickAdds += 1; },
    parallelBranchActions: { onSetAudienceKeys: noop },
    ...overrides,
  });

  // Without its own keys the lead lane reads the draft audience, so a cat
  // added here would join every such lane.
  const fresh = render(
    <I18nProvider locale="en">
      <MemoryRouter>
        <NewChatDraft {...parallelProps({
          draftTemporaryParticipants: [],
          parallelTargets: [lane(null), lane(null)],
        })}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  fireEvent.click(fresh.getAllByRole('button', { name: 'Add another model to collaborate' })[0]!);
  assert.equal(quickAdds, 1);
  assert.equal(fresh.queryByRole('menu'), null);
  fresh.unmount();

  const staffed = render(
    <I18nProvider locale="en">
      <MemoryRouter>
        <NewChatDraft {...parallelProps({
          draftTemporaryParticipants: [
            { participantId: 'a', name: 'Aria', provider: 'claude-cli', model: 'opus', modelSelection: null },
            { participantId: 'b', name: 'Bram', provider: 'claude-cli', model: 'opus', modelSelection: null },
          ],
          parallelTargets: [lane(['temp:a', 'temp:b']), lane(null)],
        })}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  fireEvent.click(staffed.getAllByRole('button', { name: 'Add another model to collaborate' })[0]!);
  staffed.getByRole('menuitem', { name: /Milo/u });
});
