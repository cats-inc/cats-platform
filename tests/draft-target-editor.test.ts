import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatCat } from '../src/products/shared/api/workspaceContracts.ts';
import type { ExecutionTargetValue } from '../src/products/shared/renderer/components/ExecutionTarget.ts';
import type { DraftComposerStackParticipant } from '../src/products/shared/renderer/components/newConversationDraftSupport.ts';
import {
  resolveDraftTargetEditor,
  type DraftTargetEditorContext,
} from '../src/products/shared/renderer/components/newConversationDraftTargetEditor.ts';
import type { DraftTemporaryParticipantUpdate } from '../src/products/shared/renderer/draftChatUtils.tsx';

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
  editor.onChange(claude);
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
  fresh.onChange(codex);
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
  editor.onChange(claude);
  assert.deepEqual(updates, [['helper', { provider: 'claude', instance: 'native', model: 'opus', modelSelection: null }]]);
});
