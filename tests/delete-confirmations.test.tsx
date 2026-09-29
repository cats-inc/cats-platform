import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { ConfirmDialog } from '../src/design/components/ConfirmDialog.tsx';
import { createTranslator } from '../src/shared/i18n/index.ts';
import { confirmRecentDeletion } from '../mobile/src/renderer/hooks/recentDeleteConfirmation.ts';
import {
  useWorkspaceAppNavigationActions,
  type WorkspaceNavigationPayloadLike,
} from '../src/products/shared/renderer/hooks/useWorkspaceAppNavigationActions.ts';

import {
  buildDeleteCatConfirmation,
  buildDeleteParallelChatGroupConfirmation,
  buildDeleteChannelConfirmation,
  channelDeleteTargets,
  sessionDeletionWarning,
} from '../src/products/shared/renderer/deleteConfirmations.ts';

test('delete confirmation helpers fall back to generic entity labels', () => {
  assert.match(
    buildDeleteParallelChatGroupConfirmation(null).message,
    /"this parallel chat".*cleans up linked runtime sessions/u,
  );
  assert.match(
    buildDeleteCatConfirmation(undefined).message,
    /"this cat".*cleans up linked runtime sessions/u,
  );
});

for (const locale of ['en', 'zh-TW'] as const) {
  const t = createTranslator(locale);
  test(`${locale} mobile deletion waits for its clearly labelled destructive action`, () => {
    let deleted = 0;
    let confirm: (() => void) | undefined;
    confirmRecentDeletion(locale, (_title, message, buttons) => {
      assert.match(message, locale === 'en' ? /native transcripts.*permanently deleted.*without a backup or recovery/u
        : /原生對話紀錄.*永久刪除.*不會保留備份.*無法復原/u);
      assert.equal(buttons[0].style, 'cancel');
      assert.equal(buttons[0].onPress, undefined);
      assert.equal(buttons[1].text, locale === 'en' ? 'Delete permanently' : '永久刪除');
      assert.equal(buttons[1].style, 'destructive');
      confirm = buttons[1].onPress;
    }, () => { deleted += 1; });
    assert.equal(deleted, 0);
    confirm!();
    assert.equal(deleted, 1);
  });
  for (const provider of ['claude', 'junie', 'cline', 'grok', 'muse', 'copilot', 'antigravity']) {
    test(`${locale} dialog names ${provider} and warns that native transcripts cannot be recovered`, () => {
      const options = buildDeleteChannelConfirmation('A conversation', [{ provider, instance: 'cli/native' }], t);
      const markup = renderToStaticMarkup(<ConfirmDialog dialog={{ options }} onClose={() => {}} />);
      assert.match(markup, new RegExp(provider, 'iu'));
      assert.match(markup, locale === 'en' ? /native transcripts.*permanently deleted.*no backup.*cannot be recovered/u
        : /原生對話紀錄.*永久刪除.*不會保留備份.*無法復原/u);
      assert.match(markup, locale === 'en' ? /confirmDestructiveButton[^>]*>Delete permanently/u
        : /confirmDestructiveButton[^>]*>永久刪除/u);
    });
  }
  test(`${locale} providers without native transcripts use generic wording`, () => {
    for (const target of [{ provider: 'openai', instance: 'api/default' }, { provider: 'codex', instance: 'api/default' }]) {
      const options = buildDeleteChannelConfirmation('API chat', [target], t);
      const markup = renderToStaticMarkup(<ConfirmDialog dialog={{ options }} onClose={() => {}} />);
      assert.match(markup, locale === 'en' ? /Runtime session data.*permanently deleted/u : /Runtime 工作階段資料將永久刪除/u);
      assert.doesNotMatch(markup, /native transcripts|原生對話紀錄/u);
    }
  });
  test(`${locale} unknown sessions and bulk deletes include conditional native transcript warning`, () => {
    const unknown = sessionDeletionWarning([], t);
    assert.match(unknown, locale === 'en' ? /any provider-side native transcripts.*permanently deleted/u
      : /供應器端的任何原生對話紀錄.*永久刪除/u);
    assert.ok(buildDeleteCatConfirmation('Cat', t).message.includes(unknown));
    const group = buildDeleteParallelChatGroupConfirmation('Group', t, [{ provider: 'claude' }, { provider: 'junie' }]);
    assert.match(group.message, /Claude.*Junie/u);
  });
}

test('deletion uses active leases before changed Cat defaults or pending providers', () => {
  const chat = {
    channels: [{ id: 'chat', pendingProvider: 'openai', defaultRecipientCatId: 'cat' }],
    cats: [{ id: 'cat', defaultExecutionTarget: { provider: 'codex' } }],
    selectedChannel: {
      id: 'chat', orchestratorLease: { provider: 'claude' },
      participantAssignments: [{ execution: { lease: { provider: 'junie' } } }],
    },
  };
  assert.deepEqual(channelDeleteTargets(chat, 'chat'), [{ provider: 'claude' }, { provider: 'junie' }]);
  assert.deepEqual(channelDeleteTargets({ ...chat, selectedChannel: null }, 'chat'), []);
  assert.deepEqual(channelDeleteTargets({ channels: [{ id: 'chat', pendingProvider: 'muse' }] }, 'chat'), []);
  assert.deepEqual(channelDeleteTargets({ channels: [] }, 'unknown'), []);
});

for (const surface of ['chat', 'code', 'work'] as const) {
  test(`${surface} navigation waits for confirmation, cancels without DELETE and deletes once on approval`, async () => {
    const payload: WorkspaceNavigationPayloadLike = { chat: {
      channels: [{ id: 'old-cli-chat', title: 'Old chat', defaultRecipientCatId: 'cat' }],
      cats: [{ id: 'cat', defaultExecutionTarget: { provider: 'codex', instance: 'api/default' } }],
      selectedChannelId: null, selectedChannel: null,
    } };
    let approve = false;
    let calls = 0;
    let warnings = 0;
    let onDelete: (id: string) => Promise<void> = async () => { throw new Error('not rendered'); };
    const noop = () => {};
    const unused = async () => { throw new Error('Unexpected navigation API'); };
    function Harness() {
      onDelete = useWorkspaceAppNavigationActions<unknown, WorkspaceNavigationPayloadLike>({
        state: { status: 'ready', payload }, platformShellSurface: surface,
        setState: noop, navigate: noop, setBusy: noop, setFeedback: noop, setComposerDraft: noop,
        setAccountMenuOpen: noop, setAddCatOpen: noop, setPlusMenuOpen: noop, setChannelPlusMenuOpen: noop,
        setDraftCwd: noop, setDraftCatIds: noop, setDraftHighlightedCatId: noop,
        setDraftCatExecutionTargetOverrides: noop, setDraftFiles: noop, setChannelFiles: noop,
        confirm: async (copy) => {
          warnings += 1;
          assert.match(copy.message, /any provider-side native transcripts.*permanently deleted/u);
          assert.equal(copy.confirmLabel, 'Delete permanently');
          assert.equal(calls, 0);
          return approve;
        },
        navigationApi: {
          deleteChatChannel: async (id) => { assert.equal(id, 'old-cli-chat'); calls += 1; return payload; },
          deleteGlobalCat: unused, deleteParallelChatGroup: unused, renameChatChannel: unused,
          renameParallelChatGroup: unused, resetSetup: unused, ungroupParallelChatGroup: unused,
        },
      }).onDeleteChannel;
      return null;
    }
    renderToStaticMarkup(<Harness />);
    await onDelete('old-cli-chat');
    assert.equal(calls, 0);
    approve = true;
    await onDelete('old-cli-chat');
    assert.equal(calls, 1);
    assert.equal(warnings, 2);
  });
}
