import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

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
      folder: {
        sectionTitle: 'Workspace',
        emptyState: 'No workspace selected yet.',
      },
    },
    t,
  );
  const sections = buildNewConversationDraftSidePanelSections({
    isSubmittingFirstTurn: false,
    draftCwd: null,
    draftRuntimeSessionPolicy: null,
    onCloseSidePanel: () => {},
    sidePanelCopy: copy,
    t,
  });

  assert.equal(copy.title, 'New Code Setup');
  // Participants are added, edited and removed on the composer, and the
  // model picker lives in each participant's avatar popover.
  assert.deepEqual(sections.map((section) => section.id), ['cwd']);
  assert.equal(sections[0]?.title, 'Workspace');

  const markup = renderToStaticMarkup(
    <>
      {sections.map((section) => (
        <React.Fragment key={section.id}>{section.children}</React.Fragment>
      ))}
    </>,
  );
  assert.match(markup, /No workspace selected yet\./u);
});
