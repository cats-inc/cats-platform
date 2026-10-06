import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/chat/api/contracts.ts';
import {
  buildNewConversationDraftSidePanelSections,
  resolveNewConversationDraftSidePanelCopy,
} from '../src/products/shared/renderer/components/newConversationDraftSidePanel.tsx';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('chat new draft side panel copy can be product-owned by callers', () => {
  const t = createTranslator('en');
  const copy = resolveNewConversationDraftSidePanelCopy(
    {
      title: 'New Code Setup',
      participants: {
        catsSectionTitle: 'Participants',
        groupSectionTitle: 'Participants',
        emptyState: 'No participants available yet.',
      },
      folder: {
        sectionTitle: 'Workspace',
        emptyState: 'No workspace selected yet.',
      },
    },
    t,
  );
  const sections = buildNewConversationDraftSidePanelSections({
    payload: { chat: { bossCatId: null, cats: [] }, assistantPresets: [] } as unknown as AppShellPayload,
    chatCats: [],
    draftCatIds: [],
    draftHighlightedCatId: null,
    effectiveDefaultRecipientCat: null,
    isGroupDraft: true,
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
  // The model picker lives in the composer chip's popover now.
  assert.equal(sections.find((section) => section.id === 'execution'), undefined);
  assert.equal(sections.find((section) => section.id === 'cwd')?.title, 'Workspace');

  const markup = renderToStaticMarkup(
    <>
      {sections.map((section) => (
        <React.Fragment key={section.id}>{section.children}</React.Fragment>
      ))}
    </>,
  );
  assert.match(markup, /No participants available yet\./u);
  assert.match(markup, /No workspace selected yet\./u);
});
