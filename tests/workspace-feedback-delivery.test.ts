import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { isAddCatPanelShown } from '../src/products/shared/renderer/workspaceAppViewState.ts';
import { resolveWorkspaceFeedbackDelivery } from '../src/products/shared/renderer/workspaceFeedbackDelivery.ts';

// Since 2026-03-27 a failed send or retry set `feedback` that no conversation surface rendered.

test('the feedback toast follows the state: shown while it holds a message, removed when it is cleared', () => {
  assert.deepEqual(
    resolveWorkspaceFeedbackDelivery({ feedback: 'Failed to send message.', shownInline: false, heldInline: '' }),
    { toast: 'Failed to send message.', heldInline: '' },
  );
  assert.deepEqual(
    resolveWorkspaceFeedbackDelivery({ feedback: '', shownInline: false, heldInline: '' }),
    { toast: null, heldInline: '' },
  );
});

test('the Add cat panel keeps its message inline and closing it does not turn that message into a toast', () => {
  const inline = resolveWorkspaceFeedbackDelivery({ feedback: 'Cat created.', shownInline: true, heldInline: '' });
  assert.deepEqual(inline, { toast: null, heldInline: 'Cat created.' });
  const closed = resolveWorkspaceFeedbackDelivery({ feedback: 'Cat created.', shownInline: false, heldInline: inline.heldInline });
  assert.deepEqual(closed, { toast: null, heldInline: 'Cat created.' });
  // A new failure after the panel closed is a toast.
  assert.deepEqual(
    resolveWorkspaceFeedbackDelivery({ feedback: 'Failed to send message.', shownInline: false, heldInline: closed.heldInline }),
    { toast: 'Failed to send message.', heldInline: '' },
  );
  // Once cleared, the same words again are a new failure.
  const cleared = resolveWorkspaceFeedbackDelivery({ feedback: '', shownInline: false, heldInline: closed.heldInline });
  assert.equal(resolveWorkspaceFeedbackDelivery({ feedback: 'Cat created.', shownInline: false, heldInline: cleared.heldInline }).toast,
    'Cat created.');
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
  assert.match(source, /const \{ toasts, showToast, dismissToast \} = useToast\(\);/u);
  assert.match(source, /useWorkspaceFeedbackToast\(\{\s*feedback,\s*setFeedback,/u);
  assert.match(source, /<ToastContainer toasts=\{toasts\} \/>/u);
});
