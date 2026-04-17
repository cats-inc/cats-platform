import assert from 'node:assert/strict';
import test from 'node:test';
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

test('new code default draft initial render does not show the workspace chip before the repo probe resolves', () => {
  const markup = renderToStaticMarkup(<NewChatDraft {...createProps({ draftCwd: '/tmp/my-repo' })} />);

  assert.doesNotMatch(markup, /class="composerWorkspaceChip"/u);
});

test('new code default draft without a draft cwd never renders the workspace chip', () => {
  const markup = renderToStaticMarkup(<NewChatDraft {...createProps({ draftCwd: null })} />);

  assert.doesNotMatch(markup, /class="composerWorkspaceChip"/u);
});

test('shared workspace draft renders composerFooterAccessory below the composer card when provided', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceNewChatDraft
      {...createProps({ draftCwd: '/tmp/my-repo' })}
      composerFooterAccessory={
        <span className="composerWorkspaceChip" data-tooltip="/tmp/my-repo">
          <span>my-repo</span>
        </span>
      }
    />,
  );

  assert.match(
    markup,
    /<\/form>[\s\S]*?class="composerFooterRow"[\s\S]*?class="composerWorkspaceChip"/u,
  );
  assert.match(markup, />my-repo</u);
  assert.doesNotMatch(
    markup,
    /class="composerLeftGroup"[\s\S]*?class="composerWorkspaceChip"[\s\S]*?class="composerSendButton"/u,
  );
});
