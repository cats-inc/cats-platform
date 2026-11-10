import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React, { useState } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
import type { AppShellPayload, ChatCat } from '../src/products/shared/api/workspaceContracts.ts';
import {
  CatsCanvas,
  type CatsRegistryActionsHookResult,
  type SharedCatsCanvasProps,
} from '../src/products/shared/renderer/components/cats/Cats.tsx';
import {
  emptyBotForm,
  type BotFormState,
} from '../src/products/shared/renderer/hooks/settingsCatsRegistryActions.ts';
import { emptyCatForm } from '../src/products/shared/renderer/workspaceChatUtils.tsx';
import { IDLE_BUSY_STATE } from '../src/shared/workspaceBusy.ts';

// Behaviour of the Cats Directory canvas now that its URL is the only source
// of the selected cat. The registry hook is injected, so no cat is created
// anywhere: the stub only hands the canvas the next payload.

function makeCat(id: string, name: string, extra: Partial<ChatCat> = {}): ChatCat {
  // A deliberately partial cat: the canvas reads these fields.
  return {
    id,
    name,
    status: 'active',
    group: 'standard',
    avatarUrl: null,
    avatarColor: null,
    roles: [],
    skillProfile: null,
    mcpProfile: null,
    defaultExecutionTarget: { provider: 'claude', instance: null, model: 'claude-sonnet' },
    defaultModelSelection: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...extra,
  } as unknown as ChatCat;
}

function makePayload(cats: ChatCat[]): AppShellPayload {
  // A deliberately partial payload: the canvas reads only these chat fields.
  return {
    chat: { cats, capabilities: { maxCats: 10 }, botBindings: [], channels: [] },
    products: [],
  } as unknown as AppShellPayload;
}

const mochi = makeCat('mochi', 'Mochi', { group: 'admin' });
const tofu = makeCat('tofu', 'Tofu', { createdAt: '2026-11-02T00:00:00.000Z' });
const pudding = makeCat('pudding', 'Pudding', { createdAt: '2026-11-03T00:00:00.000Z' });

const noop = async () => {};

function stubRegistryHook(
  options: Parameters<SharedCatsCanvasProps['useSettingsCatsRegistryActionsHook']>[0],
  created: ChatCat,
  currentCats: () => ChatCat[],
): CatsRegistryActionsHookResult<BotFormState> {
  return {
    botForm: emptyBotForm(),
    renameValue: '',
    setBotForm: () => {},
    setRenameValue: () => {},
    onCreateBinding: noop,
    onDeleteBinding: noop,
    onArchiveCat: noop,
    onUnarchiveCat: noop,
    onDeleteCat: noop,
    onSetBossCat: noop,
    onMcpProfileChange: noop,
    onRenameCat: noop,
    onSkillChange: noop,
    onCompanionChange: noop,
    catForm: { ...emptyCatForm(), name: created.name, provider: 'claude', model: 'claude-sonnet' },
    setCatForm: () => {},
    performCreateCat: async () => {
      const next = makePayload([...currentCats(), created]);
      options.onPayloadUpdate(next);
      return next;
    },
    onCreateCat: async () => null,
  };
}

function Harness({ initialCats }: { initialCats: ChatCat[] }) {
  const [payload, setPayload] = useState(() => makePayload(initialCats));
  return (
    <CatsCanvas
      payload={payload}
      busy={IDLE_BUSY_STATE}
      onPayloadUpdate={setPayload}
      onFeedback={() => {}}
      onBusy={() => {}}
      useSettingsCatsRegistryActionsHook={(options) =>
        stubRegistryHook(options, pudding, () => payload.chat.cats)}
    />
  );
}

function PathProbe() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderCanvas(t: TestContext, initialPath: string, initialCats: ChatCat[]) {
  resetTestDom();
  const originalFetch = globalThis.fetch;
  // Every request the canvas's hooks make (Telegram, memory, catalogs) fails
  // fast; this test is about navigation, not those panels.
  globalThis.fetch = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  const view = render(
    <I18nProvider locale="en">
      <MemoryRouter initialEntries={[initialPath]}>
        <PathProbe />
        <Routes>
          {['/entities/cats', '/entities/cats/new', '/entities/cats/:catId/settings'].map((path) => (
            <Route key={path} path={path} element={<Harness initialCats={initialCats} />} />
          ))}
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
  t.after(() => {
    view.unmount();
    cleanup();
    resetTestDom();
    globalThis.fetch = originalFetch;
  });
  const path = () => view.getByTestId('path').textContent;
  return { view, path };
}

test('with no cats, the roster root opens the add-cat flow', async (t) => {
  const { path } = renderCanvas(t, '/entities/cats', []);
  await waitFor(() => assert.equal(path(), '/entities/cats/new'));
});

test('the roster root opens the first cat, and the strip changes the URL', async (t) => {
  const { view, path } = renderCanvas(t, '/entities/cats', [mochi, tofu]);
  await waitFor(() => assert.equal(path(), '/entities/cats/mochi/settings'));

  fireEvent.click(view.getByRole('tab', { name: 'Tofu' }));
  await waitFor(() => assert.equal(path(), '/entities/cats/tofu/settings'));
  assert.equal(view.getByRole('tab', { name: 'Tofu' }).getAttribute('aria-selected'), 'true');
  assert.equal(view.getByRole('tab', { name: 'Mochi' }).getAttribute('aria-selected'), 'false');
});

test('Cancel on the add-cat flow returns to the cat that was open', async (t) => {
  const { view, path } = renderCanvas(t, '/entities/cats/tofu/settings', [mochi, tofu]);
  await waitFor(() => assert.ok(view.getByRole('tab', { name: 'Tofu' })));

  fireEvent.click(view.getByRole('button', { name: 'Add new cat' }));
  await waitFor(() => assert.equal(path(), '/entities/cats/new'));

  fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => assert.equal(path(), '/entities/cats/tofu/settings'));
});

test('creating a cat opens the new cat in its own settings URL', async (t) => {
  const { view, path } = renderCanvas(t, '/entities/cats/new', [mochi]);
  const save = await waitFor(() => view.getByRole('button', { name: 'Save Cat' }));

  fireEvent.click(save);
  await waitFor(() => assert.equal(path(), '/entities/cats/pudding/settings'));
  await waitFor(() => assert.equal(
    view.getByRole('tab', { name: 'Pudding' }).getAttribute('aria-selected'),
    'true',
  ));
});

test('a deleted cat in the URL falls back to the first cat', async (t) => {
  const { path } = renderCanvas(t, '/entities/cats/gone/settings', [mochi, tofu]);
  await waitFor(() => assert.equal(path(), '/entities/cats/mochi/settings'));
});
