import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { ToastContainer, useToast, type ShowToast } from '../src/design/components/Toast.tsx';
import { useWorkspaceFeedbackToast } from '../src/products/shared/renderer/hooks/useWorkspaceFeedbackToast.ts';

// An error toast stays until the owner closes it; the workspace feedback toast follows `feedback`.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Plain sleeps, not `waitFor`: see tests/macos-system-settings-ui.test.tsx.

function ToastHarness({ onReady }: { onReady: (show: ShowToast, dismiss: (key: string) => void) => void }) {
  const { toasts, showToast, dismissToast } = useToast();
  onReady(showToast, dismissToast);
  return <ToastContainer toasts={toasts} />;
}

test('an error toast stays past three seconds, has ✕, and the same error open is shown once', async (t) => {
  t.after(() => { cleanup(); resetTestDom(); });
  let show!: ShowToast;
  let closed = 0;
  const view = render(<I18nProvider locale="en"><ToastHarness onReady={(next) => { show = next; }} /></I18nProvider>);
  act(() => {
    show('Plain note');
    show('Failed to save.', { level: 'error', onDismiss: () => { closed += 1; } });
    show('Failed to save.', { level: 'error' });
  });
  await sleep(3_500);
  assert.equal(view.queryByText('Plain note'), null, 'an info toast still fades on its own');
  assert.equal(view.getAllByText('Failed to save.').length, 1);
  const alert = view.getByRole('alert');
  assert.ok(alert.className.includes('toastError'));
  fireEvent.click(view.getByRole('button', { name: 'Dismiss' }));
  assert.equal(closed, 1);
  await sleep(400);
  assert.equal(view.queryByText('Failed to save.'), null);
});

test('a keyed toast is replaced by the next one with its key and removed by dismissToast', async (t) => {
  t.after(() => { cleanup(); resetTestDom(); });
  let show!: ShowToast;
  let dismiss!: (key: string) => void;
  let closed = 0;
  const view = render(<I18nProvider locale="en"><ToastHarness onReady={(next, remove) => { show = next; dismiss = remove; }} /></I18nProvider>);
  act(() => { show('First failure.', { level: 'error', key: 'k', onDismiss: () => { closed += 1; } }); });
  act(() => { show('Second failure.', { level: 'error', key: 'k' }); });
  await sleep(400);
  assert.equal(view.queryByText('First failure.'), null);
  assert.ok(view.getByText('Second failure.'));
  act(() => { dismiss('k'); });
  await sleep(400);
  assert.equal(view.queryByText('Second failure.'), null);
  assert.equal(closed, 0, 'removing it from code is not the owner closing it');
});

let setFeedbackFromTest!: (value: string) => void;
let setInlineFromTest!: (value: boolean) => void;

function FeedbackHarness() {
  const [feedback, setFeedback] = useState('');
  const [shownInline, setShownInline] = useState(false);
  setFeedbackFromTest = setFeedback;
  setInlineFromTest = setShownInline;
  const { toasts, showToast, dismissToast } = useToast();
  useWorkspaceFeedbackToast({ feedback, setFeedback, shownInline, showToast, dismissToast });
  return <><output data-testid="feedback">{feedback}</output><ToastContainer toasts={toasts} /></>;
}

test('workspace feedback is one error toast that follows the state and clears it when closed', async (t) => {
  t.after(() => { cleanup(); resetTestDom(); });
  const view = render(<I18nProvider locale="en"><FeedbackHarness /></I18nProvider>);

  act(() => { setFeedbackFromTest('Failed to send message.'); });
  await sleep(3_500);
  assert.ok(view.getByRole('alert').textContent?.includes('Failed to send message.'), 'it stays');

  // A resend clears feedback at its start: the toast goes with it.
  act(() => { setFeedbackFromTest(''); });
  await sleep(400);
  assert.equal(view.queryByRole('alert'), null);

  // Failures replace each other instead of stacking.
  act(() => { setFeedbackFromTest('Failed to send message.'); });
  act(() => { setFeedbackFromTest('Failed to retry response.'); });
  await sleep(400);
  assert.equal(view.getAllByRole('alert').length, 1);
  assert.ok(view.getByRole('alert').textContent?.includes('Failed to retry response.'));

  // Closing it clears feedback, so nothing comes back.
  fireEvent.click(view.getByRole('button', { name: 'Dismiss' }));
  await sleep(400);
  assert.equal(view.getByTestId('feedback').textContent, '');
  assert.equal(view.queryByRole('alert'), null);
});

test('while the Add cat panel shows feedback inline there is no toast, and closing the panel adds none', async (t) => {
  t.after(() => { cleanup(); resetTestDom(); });
  const view = render(<I18nProvider locale="en"><FeedbackHarness /></I18nProvider>);
  act(() => { setInlineFromTest(true); });
  act(() => { setFeedbackFromTest('Cat created.'); });
  await sleep(50);
  assert.equal(view.queryByRole('alert'), null);
  act(() => { setInlineFromTest(false); });
  await sleep(50);
  assert.equal(view.queryByRole('alert'), null);
  act(() => { setFeedbackFromTest('Failed to send message.'); });
  await sleep(50);
  assert.ok(view.getByRole('alert'));
});
