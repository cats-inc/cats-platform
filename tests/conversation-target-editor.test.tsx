import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import type { ResolvedChannelParticipant } from '../src/products/shared/channelParticipants.ts';
import { buildConversationSidePanelSections } from '../src/products/shared/renderer/components/conversation-view/ConversationSidePanelSections.tsx';
import {
  resolveConversationTargetEditor,
  type ConversationTargetEditorContext,
} from '../src/products/shared/renderer/components/conversation-view/conversationTargetEditor.ts';
import type { ExecutionTargetValue } from '../src/products/shared/renderer/components/ExecutionTarget.ts';
import type { DraftComposerStackParticipant } from '../src/products/shared/renderer/components/newConversationDraftSupport.ts';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

const claudeOpus: ExecutionTargetValue = { provider: 'claude', instance: 'native', model: 'opus', modelSelection: null };
const codexSol: ExecutionTargetValue = { provider: 'codex', instance: 'native', model: 'gpt-5.6-sol', modelSelection: null };

// A deliberate partial: the resolver reads identity and execution target only.
function roomParticipant(
  participantId: string,
  catId: string | null,
  target: ExecutionTargetValue,
): ResolvedChannelParticipant {
  return {
    participantId,
    sourceKind: catId ? 'cat' : 'adhoc',
    sourceRefId: catId,
    name: participantId,
    status: 'active',
    execution: {
      target: { provider: target.provider, instance: target.instance, model: target.model },
      modelSelection: target.modelSelection,
    },
  } as unknown as ResolvedChannelParticipant;
}

function chip(overrides: Partial<DraftComposerStackParticipant>): DraftComposerStackParticipant {
  return {
    key: 'implicit:execution_target',
    name: 'Claude-CLI · opus',
    executionLabel: null,
    avatarColor: null,
    avatarUrl: null,
    isCat: false,
    catId: null,
    participantId: null,
    ...overrides,
  };
}

function context(overrides: Partial<ConversationTargetEditorContext> = {}): ConversationTargetEditorContext {
  return {
    activeRoomParticipants: [],
    defaultRecipientParticipant: null,
    directLaneCat: null,
    directLaneExecutionTarget: null,
    isDirectLane: false,
    openCatPage: () => assert.fail('no cat page expected'),
    ...overrides,
  };
}

test('the default chat chip edits the default target and carries start fresh', () => {
  const changes: ExecutionTargetValue[] = [];
  let startedFresh = 0;
  const editor = resolveConversationTargetEditor(chip({}), context({
    selectedExecutionTarget: claudeOpus,
    onExecutionTargetChange: (value) => changes.push(value),
    startFresh: { label: 'Start fresh', hint: 'Why', onSelect: () => { startedFresh++; } },
  }));
  assert.ok(editor);
  assert.deepEqual(editor.target, claudeOpus);
  editor.onChange(codexSol);
  assert.deepEqual(changes, [codexSol]);
  editor.action?.onSelect();
  assert.equal(startedFresh, 1);
  assert.equal(editor.onOpenSettings, undefined);

  assert.equal(resolveConversationTargetEditor(chip({}), context({ selectedExecutionTarget: claudeOpus })), null);
});

test('a direct-lane cat edits the conversation\'s own participant target, never the cat profile', () => {
  // The cat profile default is shared by every conversation with this cat. The
  // conversation's own target is what a send uses, so the chip edits that.
  const updates: Array<[string, ExecutionTargetValue]> = [];
  const opened: string[] = [];
  const participant = roomParticipant('participant-1', 'cat-1', claudeOpus);
  const editor = resolveConversationTargetEditor(
    chip({ key: 'cat:cat-1', name: 'Work Cat', isCat: true, catId: 'cat-1' }),
    context({
      isDirectLane: true,
      directLaneCat: { id: 'cat-1', name: 'Work Cat' } as AppShellPayload['chat']['cats'][number],
      directLaneExecutionTarget: codexSol,
      defaultRecipientParticipant: participant,
      onUpdateParticipantTarget: (participantId, value) => updates.push([participantId, value]),
      onDirectLaneExecutionTargetChange: () => assert.fail('the cat profile must not change'),
      startFresh: { label: 'Start fresh', onSelect: () => {} },
      openCatPage: (catId) => opened.push(catId),
    }),
  );
  assert.ok(editor);
  assert.deepEqual(editor.target, claudeOpus);
  assert.equal(editor.action, undefined, 'start fresh belongs to the default chat only');

  // The picker republishes the same target with a label; that is not a change.
  editor.onChange({ ...claudeOpus, executionLabel: 'Claude-CLI · Opus' });
  assert.deepEqual(updates, []);
  editor.onChange(codexSol);
  assert.deepEqual(updates, [['participant-1', codexSol]]);

  editor.onOpenSettings?.();
  assert.deepEqual(opened, ['cat-1']);
});

test('a direct lane without a participant yet seeds from the cat and saves through the direct-lane handler', () => {
  const saved: Array<[string, ExecutionTargetValue]> = [];
  const editor = resolveConversationTargetEditor(
    chip({ key: 'cat:cat-1', name: 'Work Cat', isCat: true, catId: 'cat-1' }),
    context({
      isDirectLane: true,
      directLaneCat: { id: 'cat-1', name: 'Work Cat' } as AppShellPayload['chat']['cats'][number],
      directLaneExecutionTarget: codexSol,
      onUpdateParticipantTarget: () => assert.fail('there is no participant to update'),
      onDirectLaneExecutionTargetChange: (catId, value) => saved.push([catId, value]),
      openCatPage: () => {},
    }),
  );
  assert.ok(editor);
  assert.deepEqual(editor.target, codexSol);
  editor.onChange(claudeOpus);
  assert.deepEqual(saved, [['cat-1', claudeOpus]]);
});

test('group participants resolve by participant id, and only cats link to a cat page', () => {
  const updates: string[] = [];
  const shared = context({
    activeRoomParticipants: [
      roomParticipant('participant-cat', 'cat-7', claudeOpus),
      roomParticipant('participant-temp', null, codexSol),
    ],
    onUpdateParticipantTarget: (participantId) => updates.push(participantId),
    openCatPage: () => {},
  });
  const temporary = resolveConversationTargetEditor(
    chip({ key: 'participant:participant-temp', name: 'Reviewer', participantId: 'participant-temp' }),
    shared,
  );
  assert.ok(temporary);
  assert.deepEqual(temporary.target, codexSol);
  assert.equal(temporary.onOpenSettings, undefined);
  temporary.onChange(claudeOpus);

  const cat = resolveConversationTargetEditor(
    chip({ key: 'participant:participant-cat', name: 'Mochi', isCat: true, participantId: 'participant-cat' }),
    shared,
  );
  assert.ok(cat?.onOpenSettings);
  cat.onChange(codexSol);
  assert.deepEqual(updates, ['participant-temp', 'participant-cat']);

  assert.equal(resolveConversationTargetEditor(
    chip({ key: 'participant:gone', name: 'Gone', participantId: 'gone' }),
    shared,
  ), null);
});

test('the conversation side panel no longer carries an execution section', () => {
  function SectionIds() {
    const sections = buildConversationSidePanelSections({
      payload: { chat: { bossCatId: null, cats: [] } } as unknown as AppShellPayload,
      selectedChannel: { id: 'channel-1', title: 'Default Thread', topic: 'Test' } as never,
      busy: clearBusyState(),
      operatorView: null,
      operatorLoading: false,
      operatorError: '',
      assignedCatRecords: [],
      assignedAdhocParticipants: [],
      defaultRecipientCatId: null,
      inspectedRun: null,
      showAddCatButton: true,
      editingParticipantId: null,
      editingParticipantName: '',
      canRenameParticipants: false,
      onEditingParticipantNameChange: () => {},
      onBeginParticipantRename: () => {},
      onCancelParticipantRename: () => {},
      onSubmitParticipantRename: () => {},
      onCloseSidePanel: () => {},
      onInspectRun: () => {},
      onApprovalDecision: () => {},
      onOperatorAction: () => {},
    });
    return <>{sections.map((section) => section.id).join(',')}</>;
  }
  const ids = renderToStaticMarkup(<I18nProvider locale="en"><SectionIds /></I18nProvider>).split(',');
  assert.deepEqual(ids, ['cats', 'cwd', 'operator']);
});
