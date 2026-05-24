import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import {
  buildChatNewChatDraftSidePanelSections,
  resolveChatNewChatDraftSidePanelCopy,
} from '../src/products/shared/renderer/components/chatNewChatDraftSidePanel.tsx';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('chat new draft side panel copy can be product-owned by callers', () => {
  const t = createTranslator('en');
  const copy = resolveChatNewChatDraftSidePanelCopy(
    {
      title: 'New Code Setup',
      participants: {
        catsSectionTitle: 'Participants',
        groupSectionTitle: 'Participants',
        emptyState: 'No participants available yet.',
      },
      execution: {
        sectionTitle: 'Execution',
        emptyState: 'No execution target set yet.',
      },
      folder: {
        sectionTitle: 'Workspace',
        emptyState: 'No workspace selected yet.',
      },
    },
    t,
  );
  const sections = buildChatNewChatDraftSidePanelSections({
    payload: { chat: { bossCatId: null, cats: [] }, assistantPresets: [] } as unknown as AppShellPayload,
    chatCats: [],
    draftCatIds: [],
    draftHighlightedCatId: null,
    effectiveDefaultRecipientCat: null,
    isGroupDraft: true,
    isDirectLaneContext: false,
    isParallelMode: false,
    groupDraftSelectionLabel: 'No participants selected.',
    assistantPresets: [],
    draftTemporaryParticipants: [],
    editingTemporaryParticipantId: null,
    editingTemporaryParticipantName: '',
    temporaryParticipantFormOpen: false,
    temporaryParticipantForm: {
      roleHint: '',
      provider: 'claude',
      instance: 'native',
      model: 'opus',
      modelSelection: null,
    },
    hasReachedGroupParticipantLimit: false,
    isSubmittingFirstTurn: false,
    defaultRecipientCat: null,
    activePanelExecutionTarget: null,
    onToggleDraftCat: () => {},
    onHighlightDraftCat: () => {},
    onAddDraftTemporaryParticipant: () => {},
    onRemoveDraftTemporaryParticipant: () => {},
    onBeginTemporaryParticipantRename: () => {},
    onCancelTemporaryParticipantRename: () => {},
    onSubmitTemporaryParticipantRename: () => {},
    onEditingTemporaryParticipantNameChange: () => {},
    onTemporaryParticipantFormChange: () => {},
    createTemporaryParticipantFormValue: () => ({
      roleHint: '',
      provider: 'claude',
      instance: 'native',
      model: 'opus',
      modelSelection: null,
    }),
    onTemporaryParticipantFormOpenChange: () => {},
    onSubmitTemporaryParticipant: () => {},
    draftCwd: null,
    draftRuntimeSessionPolicy: null,
    onCloseSidePanel: () => {},
    sidePanelCopy: copy,
    t,
  });

  assert.equal(copy.title, 'New Code Setup');
  assert.equal(sections.find((section) => section.id === 'cats')?.title, 'Participants');
  assert.equal(sections.find((section) => section.id === 'execution')?.title, 'Execution');
  assert.equal(sections.find((section) => section.id === 'cwd')?.title, 'Workspace');

  const markup = renderToStaticMarkup(
    <>
      {sections.map((section) => (
        <React.Fragment key={section.id}>{section.children}</React.Fragment>
      ))}
    </>,
  );
  assert.match(markup, /No participants available yet\./u);
  assert.match(markup, /No execution target set yet\./u);
  assert.match(markup, /No workspace selected yet\./u);
});
