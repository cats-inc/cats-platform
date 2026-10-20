import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatCat } from '../src/products/shared/api/workspaceContracts.ts';
import type { ExecutionTargetValue } from '../src/products/shared/renderer/components/ExecutionTarget.ts';
import type { DraftComposerStackParticipant } from '../src/products/shared/renderer/components/newConversationDraftSupport.ts';
import {
  resolveDraftTargetEditor,
  type DraftTargetEditorContext,
} from '../src/products/shared/renderer/components/newConversationDraftTargetEditor.ts';
import {
  createDraftDefaultParticipant,
  createInitialGroupParticipants,
  DRAFT_DEFAULT_PARTICIPANT_ID,
  resolveDraftRosterTemporaryParticipants,
  syncDraftParticipantsWithDefaultTarget,
  type DraftTemporaryParticipant,
  type DraftTemporaryParticipantUpdate,
} from '../src/products/shared/renderer/draftChatUtils.tsx';

const claude: ExecutionTargetValue = { provider: 'claude', instance: 'native', model: 'opus', modelSelection: null };
const codex: ExecutionTargetValue = { provider: 'codex', instance: 'native', model: 'gpt-5.6-sol', modelSelection: null };

function chip(key: string, overrides: Partial<DraftComposerStackParticipant> = {}): DraftComposerStackParticipant {
  return {
    key, name: key, executionLabel: null, avatarColor: null, avatarUrl: null,
    isCat: false, catId: null, participantId: null, ...overrides,
  };
}

function context(overrides: Partial<DraftTargetEditorContext> = {}): DraftTargetEditorContext {
  return {
    // A deliberate partial cat: the resolver reads its id and default target only.
    cats: [{
      id: 'mochi', name: 'Mochi',
      defaultExecutionTarget: { provider: 'claude', instance: 'native', model: 'opus' },
      defaultModelSelection: null,
    } as unknown as ChatCat],
    draftCatExecutionTargetOverrides: new Map(),
    onDraftCatExecutionTargetOverride: () => assert.fail('no cat override expected'),
    draftTemporaryParticipants: [],
    onUpdateDraftTemporaryParticipant: () => assert.fail('no temporary participant update expected'),
    openCatPage: () => {},
    ...overrides,
  };
}

test('a parallel lane chip edits that lane\'s own target', () => {
  const changes: Array<[number, ExecutionTargetValue]> = [];
  const editor = resolveDraftTargetEditor(chip('parallel:1'), context({
    parallelTargets: [claude, codex],
    onParallelTargetChange: (index, value) => changes.push([index, value]),
  }));
  assert.ok(editor);
  assert.deepEqual(editor.target, codex);
  editor.onChange?.(claude);
  assert.deepEqual(changes, [[1, claude]]);
  assert.equal(editor.onOpenSettings, undefined);

  assert.equal(resolveDraftTargetEditor(chip('parallel:5'), context({
    parallelTargets: [claude, codex],
    onParallelTargetChange: () => {},
  })), null, 'a lane that no longer exists has no editor');
});

test('a draft cat edits a draft override that starts from the cat default', () => {
  const overrides: Array<[string, ExecutionTargetValue]> = [];
  const opened: string[] = [];
  const mochi = chip('cat:mochi', { isCat: true, catId: 'mochi', name: 'Mochi' });
  const fresh = resolveDraftTargetEditor(mochi, context({
    onDraftCatExecutionTargetOverride: (catId, value) => overrides.push([catId, value]),
    openCatPage: (catId) => opened.push(catId),
  }));
  assert.ok(fresh);
  assert.deepEqual(fresh.target, claude);
  fresh.onChange?.(codex);
  assert.deepEqual(overrides, [['mochi', codex]]);
  fresh.onOpenSettings?.();
  assert.deepEqual(opened, ['mochi']);

  const picked = resolveDraftTargetEditor(mochi, context({
    draftCatExecutionTargetOverrides: new Map([['mochi', codex]]),
  }));
  assert.deepEqual(picked?.target, codex);
});

test('a draft temporary participant edits its own target', () => {
  const updates: Array<[string, DraftTemporaryParticipantUpdate]> = [];
  const editor = resolveDraftTargetEditor(chip('temp:helper', { participantId: 'helper' }), context({
    draftTemporaryParticipants: [{ participantId: 'helper', name: 'Helper', provider: 'codex', model: 'gpt-5.6-sol' }],
    onUpdateDraftTemporaryParticipant: (participantId, input) => updates.push([participantId, input]),
  }));
  assert.ok(editor);
  assert.equal(editor.target.provider, 'codex');
  editor.onChange?.(claude);
  assert.deepEqual(updates, [['helper', { provider: 'claude', instance: 'native', model: 'opus', modelSelection: null }]]);
});

test('a draft temporary participant edits its own name and role hint', () => {
  const updates: Array<[string, DraftTemporaryParticipantUpdate]> = [];
  const editor = resolveDraftTargetEditor(chip('temp:helper', { participantId: 'helper' }), context({
    draftTemporaryParticipants: [{
      participantId: 'helper', name: 'Helper', provider: 'codex', model: 'gpt-5.6-sol', roleHint: 'Skeptic',
    }],
    onUpdateDraftTemporaryParticipant: (participantId, input) => updates.push([participantId, input]),
  }));
  assert.ok(editor?.profile?.onSave);
  assert.equal(editor.profile.name, 'Helper');
  assert.equal(editor.profile.roleHint, 'Skeptic');
  editor.profile.onSave({ name: 'Critic' });
  editor.profile.onSave({ roleHint: null });
  assert.deepEqual(updates, [['helper', { name: 'Critic' }], ['helper', { roleHint: null }]]);
});

test('a participant added from an assistant preset is read-only in the draft', () => {
  const editor = resolveDraftTargetEditor(chip('temp:reviewer', { participantId: 'reviewer' }), context({
    draftTemporaryParticipants: [{
      participantId: 'reviewer', presetId: 'preset-reviewer', name: 'Reviewer', provider: 'claude',
      model: 'opus', roleHint: 'Reviews diffs',
    }],
  }));
  assert.ok(editor);
  assert.equal(editor.target.provider, 'claude');
  assert.equal(editor.onChange, undefined, 'its model changes on the assistant, not here');
  assert.deepEqual(editor.profile, { name: 'Reviewer', roleHint: 'Reviews diffs' });
});

test('a draft nobody has joined starts with its default participant, and lanes keep their own', () => {
  const [seeded, ...rest] = resolveDraftRosterTemporaryParticipants({
    temporaryParticipants: [],
    defaultTarget: codex,
    seedsDefault: true,
  });
  assert.deepEqual(rest, []);
  assert.equal(seeded?.participantId, DRAFT_DEFAULT_PARTICIPANT_ID);
  assert.equal(seeded?.provider, 'codex');
  assert.equal(seeded?.model, 'gpt-5.6-sol');

  // A cat, a direct lane or parallel lanes do not seed it (the caller decides).
  assert.deepEqual(resolveDraftRosterTemporaryParticipants({
    temporaryParticipants: [],
    defaultTarget: codex,
    seedsDefault: false,
  }), []);

  // Once participants are added, the roster is theirs, default included or not.
  const added: DraftTemporaryParticipant[] = [
    { participantId: 'temp-1', name: 'Bram', provider: 'claude', model: 'opus', modelSelection: null },
  ];
  assert.equal(resolveDraftRosterTemporaryParticipants({
    temporaryParticipants: added,
    defaultTarget: codex,
    seedsDefault: true,
  }), added);
});

test('a group draft grows from its default participant, which stays first', () => {
  const [lead, second] = createInitialGroupParticipants(codex, 5);
  assert.equal(lead?.participantId, DRAFT_DEFAULT_PARTICIPANT_ID);
  assert.equal(lead?.provider, 'codex');
  assert.notEqual(second?.participantId, DRAFT_DEFAULT_PARTICIPANT_ID);
});

test('the default participant edits the remembered default, with a name only once others joined', () => {
  const remembered: ExecutionTargetValue[] = [];
  const defaultParticipant = createDraftDefaultParticipant(codex);
  const defaultChip = chip(`temp:${DRAFT_DEFAULT_PARTICIPANT_ID}`, {
    participantId: DRAFT_DEFAULT_PARTICIPANT_ID,
  });
  const alone = resolveDraftTargetEditor(defaultChip, context({
    selectedExecutionTarget: codex,
    onExecutionTargetChange: (value) => remembered.push(value),
    draftTemporaryParticipants: [defaultParticipant],
    draftParticipantCount: 1,
  }));
  assert.ok(alone);
  assert.deepEqual(alone.target, codex);
  alone.onChange?.(claude);
  assert.deepEqual(remembered, [claude]);
  assert.equal(alone.profile, undefined, 'one participant shows only its model');

  const updates: Array<[string, DraftTemporaryParticipantUpdate]> = [];
  const grouped = resolveDraftTargetEditor(defaultChip, context({
    selectedExecutionTarget: codex,
    onExecutionTargetChange: () => {},
    draftTemporaryParticipants: [defaultParticipant],
    draftParticipantCount: 2,
    onUpdateDraftTemporaryParticipant: (participantId, update) => updates.push([participantId, update]),
  }));
  assert.equal(grouped?.profile?.name, defaultParticipant.name);
  grouped?.profile?.onSave?.({ name: 'Lead' });
  assert.deepEqual(updates, [[DRAFT_DEFAULT_PARTICIPANT_ID, { name: 'Lead' }]]);
});

test('the default participant follows the remembered default wherever it sits', () => {
  const other: DraftTemporaryParticipant = {
    participantId: 'temp-1', name: 'Bram', provider: 'claude', model: 'opus', modelSelection: null,
  };
  const participants = [other, createDraftDefaultParticipant(codex)];
  const synced = syncDraftParticipantsWithDefaultTarget(participants, claude, 'default');
  assert.equal(synced[0], other, 'another participant is left alone outside a group');
  assert.equal(synced[1]?.participantId, DRAFT_DEFAULT_PARTICIPANT_ID);
  assert.equal(synced[1]?.provider, 'claude');
  assert.equal(synced[1]?.model, 'opus');
  assert.equal(
    syncDraftParticipantsWithDefaultTarget(synced, claude, 'default'),
    synced,
    'an unchanged target keeps the same array',
  );
});
