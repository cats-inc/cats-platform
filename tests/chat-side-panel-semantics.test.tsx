import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import { buildChatSidePanelSections } from '../src/products/shared/renderer/components/chat-view/ChatSidePanelSections.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

type SidePanelOptions = Parameters<typeof buildChatSidePanelSections>[0];

function createExecutionOptions(overrides: Partial<SidePanelOptions> = {}): SidePanelOptions {
  return {
    payload: { chat: { bossCatId: null, cats: [] } } as unknown as AppShellPayload,
    selectedChannel: { id: 'channel-1', title: 'Default Thread', topic: 'Test' } as never,
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
    isDirectLane: false,
    isDefaultChatComposer: true,
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
    ...overrides,
  };
}

function ExecutionSection({ options }: { options: SidePanelOptions }) {
  const sections = buildChatSidePanelSections(options);
  const executionSection = sections.find((section) => section.id === 'execution');
  assert.ok(executionSection);
  return <>{executionSection.children}</>;
}

function renderExecutionMarkup(options: SidePanelOptions): string {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <ExecutionSection options={options} />
    </I18nProvider>,
  );
}

function buildExecutionMarkup(overrides: {
  isDefaultChatComposer?: boolean;
  isDirectLane?: boolean;
} = {}): string {
  return renderExecutionMarkup(createExecutionOptions({
    isDirectLane: overrides.isDirectLane ?? false,
    isDefaultChatComposer: overrides.isDefaultChatComposer ?? true,
  }));
}

test('default side panel exposes an explicit start-fresh action', () => {
  const markup = buildExecutionMarkup();

  assert.match(markup, />Start fresh</u);
  assert.match(markup, /reset default continuity so the next turn starts a new branch/u);
});

test('non-default execution side panels do not expose the start-fresh action', () => {
  const markup = buildExecutionMarkup({ isDefaultChatComposer: false });

  assert.doesNotMatch(markup, />Start fresh</u);
});

test('cat execution side panel surfaces the Cat tool profile', () => {
  const markup = renderExecutionMarkup(createExecutionOptions({
    payload: {
      chat: {
        bossCatId: null,
        cats: [{
          id: 'cat-1',
          name: 'Boss Work Cat',
          avatarColor: null,
          avatarUrl: null,
          mcpProfile: 'work-memory',
        }],
      },
    } as unknown as AppShellPayload,
    selectedChannel: { id: 'channel-1', title: 'Direct', topic: 'Test' } as never,
    defaultRecipientCatId: 'cat-1',
    defaultRecipientParticipant: {
      participantId: 'cat-1',
      sourceKind: 'cat',
      sourceRefId: 'cat-1',
      name: 'Boss Work Cat',
      avatarColor: null,
      avatarUrl: null,
      execution: {
        target: {
          provider: 'claude',
          instance: 'native',
          model: 'claude-sonnet',
        },
        modelSelection: null,
      },
    } as never,
    isDefaultChatComposer: false,
    selectedExecutionTarget: null,
  }));

  assert.match(markup, />Tool Profile</u);
  assert.match(markup, />Work memory</u);
});
