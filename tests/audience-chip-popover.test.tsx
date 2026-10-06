// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { clearProviderCatalogClientCache } from '../src/app/renderer/providerCatalogClient.ts';
import { clearProviderRegistryClientCache } from '../src/app/renderer/providerRegistryClient.ts';
import {
  AudienceChip,
  type AudienceTargetEditor,
} from '../src/products/shared/renderer/components/AudienceChip.tsx';
import type { ExecutionTargetValue } from '../src/products/shared/renderer/components/ExecutionTarget.ts';
import type { DraftComposerStackParticipant } from '../src/products/shared/renderer/components/newConversationDraftSupport.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const originalFetch = globalThis.fetch;

function reset(): void {
  cleanup();
  resetTestDom();
  clearProviderCatalogClientCache();
  clearProviderRegistryClientCache();
  globalThis.fetch = originalFetch;
}

// The popover's picker reads through the shared client caches.
function installProviderFetch(): void {
  const catalog = {
    provider: 'claude', backend: 'cli', instance: 'cli/native', defaultModel: 'opus', source: 'dynamic', cache: null,
    models: [{ id: 'opus', label: 'Opus', default: true }],
    entries: [{ id: 'opus', label: 'Opus', default: true }],
    presets: [], controls: [], defaultSelection: { entryId: 'opus', entryMode: 'explicit' },
    support: { tier: 'full', notes: [] }, warnings: [],
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (/\/api\/providers(?:\?|$)/u.test(String(input))) {
      return Response.json({ state: 'ready', revision: 'r1', providers: [{
        id: 'claude', label: 'Claude', defaultModel: 'opus', defaultInstance: 'native', defaultBackend: 'cli',
        instances: [{ id: 'native', target: 'cli/native', label: 'Native', backend: 'cli', default: true }],
        modelsPath: '/api/providers/claude/models',
      }] });
    }
    return Response.json({ catalog });
  }) as typeof fetch;
}

const target: ExecutionTargetValue = { provider: 'claude', instance: 'cli/native', model: 'opus', modelSelection: null };

function cat(id: string, name: string): DraftComposerStackParticipant {
  return {
    key: `cat:${id}`, name, executionLabel: 'Stale label', avatarColor: '#8B7E74', avatarUrl: null,
    isCat: true, catId: id, participantId: null,
  };
}

test('a single participant chip opens its picker in a popover instead of the side panel', async (t) => {
  reset(); t.after(reset); installProviderFetch();
  const opened: string[] = [];
  const editor: AudienceTargetEditor = { target, onChange: () => {}, onOpenSettings: () => opened.push('mochi') };
  const view = render(<I18nProvider locale="en"><AudienceChip
    audienceParticipants={[cat('mochi', 'Mochi')]}
    resolveTargetEditor={() => editor}
    onSingleClick={() => assert.fail('the side panel must not open')}
  /></I18nProvider>);

  const chipButton = view.container.querySelector('.audienceChip');
  assert.ok(chipButton);
  // The chip describes the target the popover edits, not a stale label.
  assert.doesNotMatch(chipButton.getAttribute('data-tooltip') ?? '', /Stale label/u);

  fireEvent.click(chipButton);
  const dialog = view.getByRole('dialog', { name: 'Mochi' });
  assert.equal(dialog.querySelector('.audiencePopoverBack'), null, 'a single target has no list to go back to');
  await waitFor(() => assert.equal(
    (view.getByRole('combobox', { name: /^Provider/u }) as HTMLSelectElement).value,
    'claude',
  ));

  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(view.queryByRole('dialog'), null);

  fireEvent.click(chipButton);
  fireEvent.click(view.getByRole('button', { name: "Edit Mochi's settings" }));
  assert.deepEqual(opened, ['mochi']);
  assert.equal(view.queryByRole('dialog'), null);
});

test('a group popover drills into one participant\'s picker in place and returns to the list', async (t) => {
  reset(); t.after(reset); installProviderFetch();
  const mochi = cat('mochi', 'Mochi');
  const tora = cat('tora', 'Tora');
  const audienceKeys: string[][] = [];
  const view = render(<I18nProvider locale="en"><AudienceChip
    audienceParticipants={[mochi]}
    allParticipants={[mochi, tora]}
    onSetAudienceKeys={(keys) => audienceKeys.push(keys)}
    resolveTargetEditor={() => ({ target, onChange: () => {} })}
  /></I18nProvider>);

  fireEvent.click(view.container.querySelector('.audienceChip')!);
  const toraRow = view.getByRole('button', { name: "Change Tora's model" });
  assert.ok(toraRow.querySelector('.audiencePopoverModel'));

  // Choosing the audience never opens a picker.
  fireEvent.click(view.getAllByRole('checkbox')[1]!);
  assert.deepEqual(audienceKeys, [['cat:mochi', 'cat:tora']]);
  assert.equal(view.queryByRole('dialog'), null);

  fireEvent.click(toraRow);
  view.getByRole('dialog', { name: 'Tora' });
  assert.equal(view.queryByRole('button', { name: "Change Mochi's model" }), null, 'one floating layer only');
  await waitFor(() => view.getByRole('combobox', { name: /^Provider/u }));

  fireEvent.click(view.getByRole('button', { name: 'Back to participants' }));
  assert.equal(view.queryByRole('dialog'), null);
  view.getByRole('button', { name: "Change Mochi's model" });
});

test('the default chat popover shows start fresh with its explanation and closes after it', async (t) => {
  reset(); t.after(reset); installProviderFetch();
  let startedFresh = 0;
  const implicit: DraftComposerStackParticipant = {
    key: 'implicit:execution_target', name: 'Claude-CLI · opus', executionLabel: 'Claude-CLI · opus',
    avatarColor: null, avatarUrl: null, isCat: false, catId: null, participantId: null,
  };
  const view = render(<I18nProvider locale="en"><AudienceChip
    audienceParticipants={[implicit]}
    resolveTargetEditor={() => ({
      target,
      onChange: () => {},
      action: { label: 'Start fresh', hint: 'Keeps the chat but starts a new branch.', onSelect: () => { startedFresh++; } },
    })}
  /></I18nProvider>);

  fireEvent.click(view.container.querySelector('.audienceChip')!);
  const dialog = view.getByRole('dialog');
  assert.equal(dialog.querySelector('.audiencePopoverEditorHeader'), null, 'the implicit target has no identity header');
  assert.match(dialog.textContent ?? '', /Keeps the chat but starts a new branch\./u);
  await waitFor(() => view.getByRole('combobox', { name: /^Provider/u }));

  fireEvent.click(view.getByRole('button', { name: 'Start fresh' }));
  assert.equal(startedFresh, 1);
  assert.equal(view.queryByRole('dialog'), null);
});
