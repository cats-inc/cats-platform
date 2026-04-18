import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { buildChatSidePanelSections } from '../src/products/shared/renderer/components/chat-view/ChatSidePanelSections.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

function buildExecutionMarkup(overrides: {
  isSoloComposer?: boolean;
  isDirectLane?: boolean;
} = {}): string {
  const sections = buildChatSidePanelSections({
    payload: { chat: { bossCatId: null, cats: [] } } as unknown as AppShellPayload,
    selectedChannel: { id: 'channel-1', title: 'Solo Thread', topic: 'Test' } as never,
    busy: clearBusyState(),
    operatorView: null,
    operatorLoading: false,
    operatorError: '',
    assignedCatRecords: [],
    assignedAdhocParticipants: [],
    defaultRecipientCatId: null,
    defaultRecipientParticipant: null,
    directLaneCat: null,
    directLaneExecutionTarget: null,
    isDirectLane: overrides.isDirectLane ?? false,
    isSoloComposer: overrides.isSoloComposer ?? true,
    selectedExecutionTarget: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-sonnet',
      modelSelection: null,
    },
    inspectedRun: null,
    showAddCatButton: false,
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
    onExecutionTargetChange: () => {},
    onStartFresh: () => {},
    buildParticipantAvatarStyle: () => undefined,
  });
  const executionSection = sections.find((section) => section.id === 'execution');
  assert.ok(executionSection);
  return renderToStaticMarkup(<>{executionSection.children}</>);
}

test('solo side panel exposes an explicit start-fresh action', () => {
  const markup = buildExecutionMarkup();

  assert.match(markup, />Start fresh</u);
  assert.match(markup, /reset solo continuity so the next turn starts a new branch/u);
});

test('non-solo execution side panels do not expose the start-fresh action', () => {
  const markup = buildExecutionMarkup({ isSoloComposer: false });

  assert.doesNotMatch(markup, />Start fresh</u);
});
