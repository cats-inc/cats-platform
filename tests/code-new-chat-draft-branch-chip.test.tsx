import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload } from '../src/products/code/api/contracts.ts';
import {
  NewChatDraft,
  type NewChatDraftProps,
} from '../src/products/code/renderer/components/NewChatDraft.tsx';
import { NewChatDraft as WorkspaceNewChatDraft } from '../src/products/shared/renderer/components/NewChatDraft.tsx';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';

function createPayload(): AppShellPayload {
  return {
    guideCatAssist: { codeNewDraft: null },
    chat: {
      bossCatId: null,
      botBindings: [],
      capabilities: {
        maxCats: 5,
        maxChatParticipants: 5,
        maxAudienceParticipants: 3,
        maxParallelChats: 5,
      },
      cats: [],
    },
  } as unknown as AppShellPayload;
}

function createProps(overrides: Partial<NewChatDraftProps> = {}): NewChatDraftProps {
  return {
    payload: createPayload(),
    composerDraft: '',
    busy: clearBusyState(),
    draftFiles: [],
    draftCwd: null,
    draftCatIds: [],
    draftTemporaryParticipants: [],
    plusMenuOpen: false,
    plusMenuRef: { current: null },
    fileInputRef: { current: null },
    bossCatName: 'Boss Cat',
    bossCatAvatarColor: null,
    onComposerChange: () => {},
    onComposerKeyDown: () => {},
    onSendMessage: () => {},
    onTogglePlusMenu: () => {},
    onFileSelect: () => {},
    onPickFolder: () => {},
    onOpenAddCat: () => {},
    onDraftFilesChange: () => {},
    onDraftCwdClear: () => {},
    onToggleDraftCat: () => {},
    onAddDraftTemporaryParticipant: () => {},
    onRemoveDraftTemporaryParticipant: () => {},
    onUpdateDraftTemporaryParticipant: () => {},
    autoResize: () => {},
    draftDefaultRecipientCatId: null,
    onDraftDefaultRecipientChange: () => {},
    draftHighlightedCatId: null,
    onHighlightDraftCat: () => {},
    draftCatExecutionTargetOverrides: new Map(),
    onDraftCatExecutionTargetOverride: () => {},
    ...overrides,
  };
}

test('new code default draft initial render does not show the branch or workspace mode chip before the repo probe resolves', () => {
  const markup = renderToStaticMarkup(<NewChatDraft {...createProps({ draftCwd: '/tmp/my-repo' })} />);

  assert.doesNotMatch(markup, /class="composerBranchChip"/u);
  assert.doesNotMatch(markup, /class="composerWorkspaceModeChip"/u);
});

test('new code default draft without a draft cwd never renders the branch or workspace mode chip', () => {
  const markup = renderToStaticMarkup(<NewChatDraft {...createProps({ draftCwd: null })} />);

  assert.doesNotMatch(markup, /class="composerBranchChip"/u);
  assert.doesNotMatch(markup, /class="composerWorkspaceModeChip"/u);
});

test('new code default draft hides the permission chip and footer row entirely when no cwd is selected', () => {
  const markup = renderToStaticMarkup(<NewChatDraft {...createProps({ draftCwd: null })} />);

  assert.doesNotMatch(markup, /class="composerPermissionChip"/u);
  assert.doesNotMatch(markup, /class="composerFooterRow"/u);
});

test('new code default draft renders the permission chip in the header when a cwd is set', () => {
  const markup = renderToStaticMarkup(
    <NewChatDraft
      {...createProps({ draftCwd: '/tmp/my-repo' })}
    />,
  );

  // Branch chip is absent on first render (probe not resolved yet) but the
  // permission chip should still anchor the session policy controls.
  assert.match(
    markup,
    /class="composerHeaderRight"[\s\S]*?composerPermissionChipWrapper/u,
  );
  assert.match(markup, /composerPermissionChip[\s\S]*?Full access/u);
});

test('shared workspace draft renders composerFooterAccessory below the composer card when provided', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceNewChatDraft
      {...createProps({ draftCwd: '/tmp/my-repo' })}
      composerFooterAccessory={
        <>
          <span className="composerBranchChip">
            <span>main</span>
          </span>
          <button className="composerSelectChip composerWorkspaceModeChip" type="button">
            <span>Current folder</span>
          </button>
        </>
      }
    />,
  );

  assert.match(
    markup,
    /<\/form>[\s\S]*?class="composerFooterRow"[\s\S]*?class="composerBranchChip"/u,
  );
  assert.match(
    markup,
    /class="composerBranchChip"[\s\S]*?class="composerSelectChip composerWorkspaceModeChip"/u,
  );
  assert.match(markup, />main</u);
  assert.match(markup, />Current folder</u);
});
