import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { ConfirmDialog } from '../src/design/components/ConfirmDialog.tsx';
import { buildPlatformDataResetConfirmation } from '../src/app/renderer/settings/platformDataResetConfirmation.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';
import { isPlatformDataResetRequest } from '../src/shared/platformDataResetRequest.ts';

test('reset confirmation defaults to Platform only and requires the exact phrase for either scope', async () => {
  const dom = new JSDOM('<button id="trigger">Reset</button><div id="root"></div>', { url: 'http://localhost' });
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  // React DOM must observe this fixture's document when initializing its event
  // support; importing it before JSDOM makes input events look like old IE.
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  let chosenRuntime = false;
  const actions: unknown[] = [];
  const options = buildPlatformDataResetConfirmation(createTranslator('en'), true, value => { chosenRuntime = value; });
  const render = (open: boolean) => {
    act(() => { root.render(<ConfirmDialog dialog={open ? { options } : null} onClose={action => actions.push(action)} />); });
  };
  try {
    dom.window.document.getElementById('trigger')!.focus();
    render(true);
    const checkbox = dom.window.document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const input = dom.window.document.querySelector<HTMLInputElement>('input[type="text"]')!;
    const button = dom.window.document.querySelector<HTMLButtonElement>('.confirmDestructiveButton')!;
    assert.equal(checkbox.checked, false);
    assert.equal(checkbox.disabled, false);
    assert.equal(button.disabled, true);
    assert.equal(dom.window.document.activeElement?.className, 'confirmCancelButton');
    const setText = (value: string) => {
      act(() => {
        Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView!.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    };
    for (const text of ['reset', 'RESET ', 'RESE']) { setText(text); assert.equal(button.disabled, true); }
    act(() => { checkbox.click(); });
    assert.equal(chosenRuntime, true);
    assert.equal(button.disabled, true, 'checking Runtime does not bypass typed confirmation');
    setText('RESET');
    assert.equal(button.disabled, false);
    button.focus();
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(dom.window.document.activeElement, checkbox);
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(dom.window.document.activeElement, button);
    act(() => { button.click(); });
    assert.deepEqual(actions, ['confirm']);
    render(false);
    assert.equal(dom.window.document.activeElement?.id, 'trigger');
    chosenRuntime = false;
    render(true);
    assert.equal(dom.window.document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked, false);
    assert.equal(dom.window.document.querySelector<HTMLInputElement>('input[type="text"]')!.value, '');
    assert.equal(dom.window.document.querySelector<HTMLButtonElement>('.confirmDestructiveButton')!.disabled, true);
    act(() => { dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    assert.deepEqual(actions, ['confirm', 'cancel']);
    render(false); render(true);
    assert.equal(dom.window.document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked, false);
    assert.equal(dom.window.document.querySelector<HTMLInputElement>('input[type="text"]')!.value, '');
  } finally {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('both locales disclose the opt-in scope and unsupported clients cannot select it', () => {
  for (const locale of ['en', 'zh-TW'] as const) {
    const options = buildPlatformDataResetConfirmation(createTranslator(locale), false, () => {});
    assert.equal(options.checkbox?.disabled, true);
    assert.match(options.checkbox!.description, /Desktop/);
    assert.match(options.requiredText!.label, /RESET/);
    assert.equal(options.defaultAction, 'cancel');
  }
  assert.equal(isPlatformDataResetRequest({ confirmation: 'RESET', resetRuntime: false }), true);
  assert.equal(isPlatformDataResetRequest({ confirmation: 'RESET', resetRuntime: true }), true);
  for (const value of [null, {}, { confirmation: 'reset', resetRuntime: true },
    { confirmation: 'RESET', resetRuntime: 'false' }]) assert.equal(isPlatformDataResetRequest(value), false);
});
