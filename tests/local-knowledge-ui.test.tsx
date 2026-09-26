import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeContributionsPage } from '../src/products/code/renderer/components/KnowledgeContributionsPage.tsx';
import type { LocalKnowledgeWorkspace } from '../src/platform/knowledge/localKnowledgeContracts.ts';

afterEach(() => { cleanup(); resetTestDom(); });
test('user can submit, review, adopt and revoke; saving alone never adopts', async t => {
  const original = { en: 'Original.', 'zh-TW': '原文。' };
  let state: LocalKnowledgeWorkspace = { revision: 'initial', targets: [
    { target: 'catlas', entries: [{ id: 'code.entry', content: original, activeId: null }] },
    { target: 'orchestrator', entries: [{ id: 'orchestrator.goal', content: original, activeId: null }] },
  ], drafts: [] };
  const actions: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const input = JSON.parse(String(init.body)); assert.equal(input.revision, state.revision);
      actions.push(input.action);
      if (input.action === 'submit') state = { ...state, revision: 'saved', drafts: [{ id: 'draft',
        target: input.target, entryId: input.entryId, content: input.content, before: original, note: input.note,
        bundleDigest: 'baseline', createdAt: '', active: false, stale: false }] };
      else state = { ...state, revision: input.action, drafts: state.drafts.map(draft => ({ ...draft, active: input.action === 'adopt' })) };
      if (input.action === 'adopt') assert.equal(input.confirm, 'manual-local-unverified');
    }
    return Response.json(state);
  });
  const view = render(<MemoryRouter><KnowledgeContributionsPage /></MemoryRouter>);
  await waitFor(() => assert.equal((view.getByRole('textbox', { name: 'English' }) as HTMLTextAreaElement).value, 'Original.'));
  assert.deepEqual(actions, []);
  fireEvent.change(view.getByRole('textbox', { name: 'English' }), { target: { value: 'Proposed lesson.' } });
  fireEvent.change(view.getByRole('textbox', { name: 'Traditional Chinese' }), { target: { value: '建議知識。' } });
  fireEvent.click(view.getByRole('button', { name: 'Save contribution' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Adopt locally' })));
  assert.deepEqual(actions, ['submit']);
  assert.equal((view.getByRole('button', { name: 'Adopt locally' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.click(view.getByRole('button', { name: 'Adopt locally' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Revoke and restore bundled text' })));
  fireEvent.click(view.getByRole('button', { name: 'Revoke and restore bundled text' }));
  await waitFor(() => assert.deepEqual(actions, ['submit', 'adopt', 'revoke']));
});
