import './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CodespaceActions } from '../src/products/code/renderer/components/workspaces/CodespaceActions.tsx';
import type { CodeWorkspaceListItemSummary } from '../src/products/code/renderer/api/codeTask.ts';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';

test('Codespace removal names its non-destructive scope and uses revisioned action, removed entries offer restore', async t => {
  // The isolated TS loader uses classic JSX when its sandbox cannot read ancestor configs.
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  t.after(() => { if (previousReact) Object.defineProperty(globalThis, 'React', previousReact); else Reflect.deleteProperty(globalThis, 'React'); });
  const workspace: CodeWorkspaceListItemSummary = { id: 'codespace-1', title: 'Repository', path: 'C:/repo', summary: null, status: 'ready', source: 'owner_selected',
    conversationCount: 0, taskCount: 0, artifactCount: 0, lastActiveAt: '2026-10-20T00:00:00Z', management: { listing: 'visible', pinned: false, revision: 3 } };
  const oldFetch = globalThis.fetch;
  const calls: unknown[] = [];
  let changed = false;
  globalThis.fetch = async (_url, options) => {
    if (options?.body) calls.push(JSON.parse(String(options.body)));
    return new Response(JSON.stringify(options?.body ? { workspace: { ...workspace, management: { ...workspace.management, listing: 'removed', revision: 4 } }, conversations: [], tasks: [], artifacts: [] }
      : { workspaces: [], revision: 4 }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { cleanup(); globalThis.fetch = oldFetch; });
  const view = render(<MemoryRouter><I18nProvider locale="zh-TW"><CodespaceActions workspace={workspace} onChanged={() => { changed = true; }} /></I18nProvider></MemoryRouter>);
  fireEvent.click(view.getByText('操作'));
  fireEvent.click(view.getByText('從 Cats 移除 · 保留資料夾'));
  assert.equal(calls.length, 0);
  fireEvent.click(view.getAllByText('從 Cats 移除 · 保留資料夾').find(element => element.className === 'confirmDestructiveButton')!);
  await waitFor(() => assert.equal(changed, true));
  assert.deepEqual(calls, [{ action: 'remove', revision: 3, label: 'Repository' }]);
  assert.equal(changed, true);
  view.rerender(<MemoryRouter><I18nProvider locale="zh-TW"><CodespaceActions workspace={{ ...workspace, management: { listing: 'removed', pinned: false, revision: 4 } }} /></I18nProvider></MemoryRouter>);
  assert.ok(view.getByText('還原'));
  assert.equal(view.queryByText('在此開始 Code'), null);
});
