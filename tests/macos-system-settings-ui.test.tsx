import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { PlatformSettingsDesktopStartupBehavior } from '../src/app/renderer/settings/PlatformSettingsDesktopStartupBehavior.tsx';
import { ToastContainer, useToast, type ShowToast, type ToastOptions } from '../src/design/components/Toast.tsx';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';
import { resolveVoiceErrorSystemSettingsPane } from '../src/products/shared/renderer/hooks/useVoiceInputComposer.ts';
import { canOpenDesktopSystemSettings } from '../src/shared/desktopSystemSettings.ts';

// ADR-147: a missing macOS permission is a toast whose button opens the pane.

// The page reads `window.catsDesktopHost` and the shared helpers `globalThis`; in Electron they
// are one object, in the test DOM two.
function setBridge(value: unknown): void {
  for (const target of new Set<object>([globalThis, window])) {
    Object.defineProperty(target, 'catsDesktopHost', { configurable: true, value });
  }
}

function installBridge(t: TestContext, bridge: Record<string, unknown>): void {
  const targets = [...new Set<object>([globalThis, window])];
  const previous = targets.map((target) => Object.getOwnPropertyDescriptor(target, 'catsDesktopHost'));
  setBridge(bridge);
  t.after(() => {
    cleanup();
    resetTestDom();
    targets.forEach((target, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(target, 'catsDesktopHost', descriptor);
      else Reflect.deleteProperty(target, 'catsDesktopHost');
    });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// The toast's own timers update state. Plain sleeps, not `waitFor` or `await act(async …)`:
// under the ESM test bundle those leave a referenced MessageChannel that keeps the
// no-isolation suite alive (see settings-desktop-updates-section.test.tsx).
const pass = (ms: number) => sleep(ms);
async function until(check: () => void, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await sleep(10);
    }
  }
}

function ToastHarness({ onReady }: { onReady: (show: ShowToast) => void }) {
  const { toasts, showToast } = useToast();
  onReady(showToast);
  return <ToastContainer toasts={toasts} />;
}

test('a toast with an action keeps its button until it is used, then goes', async (t) => {
  t.after(() => { cleanup(); resetTestDom(); });
  let show!: ShowToast;
  let selected = 0;
  const view = render(<I18nProvider locale="en"><ToastHarness onReady={(next) => { show = next; }} /></I18nProvider>);
  act(() => {
    show('Plain note');
    show('Screen Recording is off.', { action: { label: 'Open System Settings', onSelect: () => { selected += 1; } } });
  });
  // Past the plain toast's 3 s and its fade.
  await pass(3_500);
  assert.equal(view.queryByText('Plain note'), null, 'a plain toast still fades on its own');
  const button = view.getByRole('button', { name: 'Open System Settings' });
  assert.ok(view.getByRole('alert').textContent?.includes('Screen Recording is off.'));
  fireEvent.click(button);
  assert.equal(selected, 1);
  await pass(400);
  assert.equal(view.queryByRole('button', { name: 'Open System Settings' }), null);
});

test('the same action toast is shown once while it is open', (t) => {
  t.after(() => { cleanup(); resetTestDom(); });
  let show!: ShowToast;
  const view = render(<I18nProvider locale="en"><ToastHarness onReady={(next) => { show = next; }} /></I18nProvider>);
  const action = { label: 'Open System Settings', onSelect: () => {} };
  act(() => {
    show('Screen Recording is off.', { action });
    show('Screen Recording is off.', { action });
    show('Login Items needs you.', { action });
  });
  assert.equal(view.getAllByRole('alert').length, 2);
});

test('a toast with an action can be dismissed without using it', async (t) => {
  t.after(() => { cleanup(); resetTestDom(); });
  let show!: ShowToast;
  let selected = 0;
  const view = render(<I18nProvider locale="en"><ToastHarness onReady={(next) => { show = next; }} /></I18nProvider>);
  act(() => { show('Login Items needs you.', { action: { label: 'Open', onSelect: () => { selected += 1; } } }); });
  fireEvent.click(view.getByRole('button', { name: 'Dismiss' }));
  await pass(400);
  assert.equal(view.queryByText('Login Items needs you.'), null);
  assert.equal(selected, 0);
});

test('the panes are offered only where the host says it can open them', (t) => {
  installBridge(t, { systemSettingsAvailable: false, openSystemSettings: async () => {} });
  assert.equal(canOpenDesktopSystemSettings(), false);
  setBridge({ systemSettingsAvailable: true });
  assert.equal(canOpenDesktopSystemSettings(), false, 'no open function, no action');
  setBridge({ systemSettingsAvailable: true, openSystemSettings: async () => {} });
  assert.equal(canOpenDesktopSystemSettings(), true);
});

test('a denied microphone and a denied Speech Recognition point at their own panes', () => {
  assert.equal(resolveVoiceErrorSystemSettingsPane('permission_denied'), 'microphone');
  assert.equal(resolveVoiceErrorSystemSettingsPane('speech_permission_denied'), 'speech_recognition');
  assert.equal(resolveVoiceErrorSystemSettingsPane('mic_unavailable'), null);
  assert.equal(resolveVoiceErrorSystemSettingsPane('permission_not_determined'), null);
});

function payloadWith(startAtLogin: boolean): AppShellPayload {
  return {
    desktop: { startAtLogin, openWindowOnStartup: false, systemTrayEnabled: true },
  } as unknown as AppShellPayload;
}

function renderStartup(t: TestContext, options: { startAtLogin: boolean; needsApproval: boolean; available?: boolean }) {
  const opened: string[] = [];
  const toasts: Array<{ message: string; options?: ToastOptions }> = [];
  let approvalChecks = 0;
  installBridge(t, {
    systemSettingsAvailable: options.available ?? true,
    openSystemSettings: async (pane: string) => { opened.push(pane); },
    loginItemNeedsApproval: async () => { approvalChecks += 1; return options.needsApproval; },
    updateDesktopPreferences: async (prefs: unknown) => prefs,
  });
  let payload = payloadWith(options.startAtLogin);
  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsDesktopStartupBehavior
        payload={payload}
        onPayloadUpdate={(next) => { payload = next; }}
        showToast={(message, toastOptions) => { toasts.push({ message, options: toastOptions }); }}
      />
    </I18nProvider>,
  );
  return { view, opened, toasts, approvalChecks: () => approvalChecks };
}

test('an enabled login item waiting for approval is a toast that opens Login Items', async (t) => {
  const { toasts, opened } = renderStartup(t, { startAtLogin: true, needsApproval: true });
  await until(() => assert.equal(toasts.length, 1));
  assert.match(toasts[0]!.message, /General > Login Items/u);
  assert.equal(toasts[0]!.options?.action?.label, 'Open System Settings');
  toasts[0]!.options!.action!.onSelect();
  await until(() => assert.deepEqual(opened, ['login_items']));
});

test('turning the login item on checks approval; nothing is shown when macOS needs none', async (t) => {
  const { view, toasts, approvalChecks } = renderStartup(t, { startAtLogin: false, needsApproval: false });
  assert.equal(approvalChecks(), 0, 'an off login item is not checked');
  fireEvent.click(view.getAllByRole('checkbox')[0]!);
  await until(() => assert.equal(approvalChecks(), 1));
  assert.equal(toasts.length, 0);
});

test('off macOS (no panes) the login item is never checked', async (t) => {
  const { toasts, approvalChecks } = renderStartup(t, { startAtLogin: true, needsApproval: true, available: false });
  await sleep(20);
  assert.equal(approvalChecks(), 0);
  assert.equal(toasts.length, 0);
});
