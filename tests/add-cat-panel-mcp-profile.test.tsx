import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import {
  WorkspaceAddCatPanel,
  type WorkspaceAddCatPanelProps,
} from '../src/products/shared/renderer/components/AddCatPanel.tsx';
import { emptyCatForm } from '../src/products/shared/renderer/workspaceChatUtils.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

function renderPanel(overrides: Partial<WorkspaceAddCatPanelProps> = {}): string {
  const catForm = {
    ...emptyCatForm(),
    name: 'Work Planner',
    model: 'claude-sonnet',
  };

  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <WorkspaceAddCatPanel
        selectableCats={[]}
        assignableCatCount={0}
        addCatTab="new"
        busy={clearBusyState()}
        feedback=""
        showingNewChatDraft={false}
        draftCatIdSet={new Set()}
        assignedCatIds={new Set()}
        catForm={catForm}
        onClose={() => {}}
        onTabChange={() => {}}
        onAssignExistingCat={() => {}}
        onRemoveAssignedCat={() => {}}
        onToggleDraftCat={() => {}}
        onCatFormChange={() => {}}
        onCreateCat={() => {}}
        ProviderModelFieldsComponent={() => <div data-provider-fields="true" />}
        {...overrides}
      />
    </I18nProvider>,
  );
}

test('Add Cat panel exposes the Cat tool profile selector while creating a Cat', () => {
  const markup = renderPanel();

  assert.match(markup, />Tool Profile</u);
  assert.match(markup, />Chat memory</u);
  assert.match(markup, />Work memory</u);
  assert.match(markup, /draftLeadPillActive/u);
});

test('Add Cat panel existing Cat list surfaces Work memory Cats', () => {
  const markup = renderPanel({
    addCatTab: 'existing',
    selectableCats: [
      {
        id: 'cat-work',
        name: 'Work Planner',
        roles: ['planner'],
        status: 'active',
        skillProfile: 'companion',
        mcpProfile: 'work-memory',
        avatarColor: null,
        avatarUrl: null,
        products: ['chat', 'work'],
        defaultExecutionTarget: {
          provider: 'claude',
          instance: null,
          model: 'claude-sonnet',
        },
        defaultModelSelection: null,
        memory: { updatedAt: null, content: null },
        createdAt: '2026-05-13T00:00:00.000Z',
        updatedAt: '2026-05-13T00:00:00.000Z',
        archivedAt: null,
      },
    ],
    assignableCatCount: 1,
  });

  assert.match(markup, />Work Planner</u);
  assert.match(markup, />Work memory</u);
});

test('Add Cat panel marks work-memory active when the draft chooses it', () => {
  const markup = renderPanel({
    catForm: {
      ...emptyCatForm(),
      name: 'Work Planner',
      model: 'claude-sonnet',
      mcpProfile: 'work-memory',
    },
  });

  assert.match(markup, /Work memory/u);
  assert.match(markup, /draftLeadPillActive/u);
});
