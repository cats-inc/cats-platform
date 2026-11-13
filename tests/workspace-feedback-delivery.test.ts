import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { isAddCatPanelShown } from '../src/products/shared/renderer/workspaceAppViewState.ts';
import { resolveWorkspaceFeedbackDelivery } from '../src/products/shared/renderer/workspaceFeedbackDelivery.ts';

// Since 2026-03-27 a failed send or retry set `feedback` that no conversation surface rendered.

test('feedback outside the Add cat panel is toasted once and cleared', () => {
  assert.deepEqual(
    resolveWorkspaceFeedbackDelivery({ feedback: 'Failed to send message.', shownInline: false, heldInline: '' }),
    { toast: 'Failed to send message.', clear: true, heldInline: '' },
  );
  assert.deepEqual(
    resolveWorkspaceFeedbackDelivery({ feedback: '', shownInline: false, heldInline: '' }),
    { toast: null, clear: false, heldInline: '' },
  );
});

test('the same failure twice is two toasts, because the first one clears feedback', () => {
  let held = '';
  const toasts: string[] = [];
  for (const feedback of ['Failed to retry response.', '', 'Failed to retry response.', '']) {
    const delivery = resolveWorkspaceFeedbackDelivery({ feedback, shownInline: false, heldInline: held });
    held = delivery.heldInline;
    if (delivery.toast) toasts.push(delivery.toast);
  }
  assert.deepEqual(toasts, ['Failed to retry response.', 'Failed to retry response.']);
});

test('the Add cat panel keeps its message inline and closing it does not replay that message', () => {
  const inline = resolveWorkspaceFeedbackDelivery({ feedback: 'Cat created.', shownInline: true, heldInline: '' });
  assert.deepEqual(inline, { toast: null, clear: false, heldInline: 'Cat created.' });
  const closed = resolveWorkspaceFeedbackDelivery({ feedback: 'Cat created.', shownInline: false, heldInline: inline.heldInline });
  assert.deepEqual(closed, { toast: null, clear: true, heldInline: '' });
  // A new failure after the panel closed is a toast, even with the same words.
  assert.equal(resolveWorkspaceFeedbackDelivery({ feedback: 'Cat created.', shownInline: false, heldInline: closed.heldInline }).toast,
    'Cat created.');
  // A different message while the panel was open but replaced before closing is toasted.
  assert.equal(resolveWorkspaceFeedbackDelivery({ feedback: 'Failed to send message.', shownInline: false, heldInline: 'Cat created.' }).toast,
    'Failed to send message.');
});

test('the Add cat panel is shown for a selected conversation or a generic new-chat draft', () => {
  // A deliberate partial: only whether a conversation is selected matters here.
  const channel = {} as Parameters<typeof isAddCatPanelShown>[0]['selectedChannel'];
  assert.equal(isAddCatPanelShown({ addCatOpen: false, selectedChannel: channel, showingNewChatDraft: false, draftDefaultRecipientCatId: null }), false);
  assert.equal(isAddCatPanelShown({ addCatOpen: true, selectedChannel: channel, showingNewChatDraft: false, draftDefaultRecipientCatId: null }), true);
  assert.equal(isAddCatPanelShown({ addCatOpen: true, selectedChannel: null, showingNewChatDraft: true, draftDefaultRecipientCatId: null }), true);
  assert.equal(isAddCatPanelShown({ addCatOpen: true, selectedChannel: null, showingNewChatDraft: true, draftDefaultRecipientCatId: 'cat-1' }), false);
  assert.equal(isAddCatPanelShown({ addCatOpen: true, selectedChannel: null, showingNewChatDraft: false, draftDefaultRecipientCatId: null }), false);
});

test('the shared product app delivers feedback through its toast', () => {
  // Bundled into build/test, so the source is read from the repository root.
  const source = readFileSync(join(process.cwd(), 'src/products/shared/renderer/WorkspaceProductApp.tsx'), 'utf8');
  assert.match(source, /resolveWorkspaceFeedbackDelivery\(\{\s*feedback,/u);
  assert.match(source, /if \(delivery\.toast\) showToast\(delivery\.toast\);/u);
  assert.match(source, /<ToastContainer toasts=\{toasts\} \/>/u);
});
