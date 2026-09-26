import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
import { KnowledgeContributionsPage } from '../src/products/code/renderer/components/KnowledgeContributionsPage.tsx';
import type { LocalKnowledgeWorkspace } from '../src/platform/knowledge/localKnowledgeContracts.ts';

afterEach(() => { cleanup(); resetTestDom(); });
const locales = [
  { locale: 'en', title: 'Knowledge contributions', english: 'English', chinese: 'Traditional Chinese',
    save: 'Save contribution', adopt: 'Adopt locally', revoke: 'Revoke and restore bundled text' },
  { locale: 'zh-TW', title: '知識貢獻', english: '英文', chinese: '繁體中文',
    save: '儲存貢獻', adopt: '採用到本機', revoke: '撤回並恢復隨附知識' },
] as const;

for (const labels of locales) {
  test(`user can submit, review, adopt and revoke in ${labels.locale}; saving alone never adopts`, async t => {
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
    const view = render(<I18nProvider locale={labels.locale}>
      <MemoryRouter><KnowledgeContributionsPage /></MemoryRouter>
    </I18nProvider>);
    await waitFor(() => assert.equal((view.getByRole('textbox', { name: labels.english }) as HTMLTextAreaElement).value, 'Original.'));
    assert.ok(view.getByRole('heading', { name: labels.title }));
    assert.deepEqual(actions, []);
    fireEvent.change(view.getByRole('textbox', { name: labels.english }), { target: { value: 'Proposed lesson.' } });
    fireEvent.change(view.getByRole('textbox', { name: labels.chinese }), { target: { value: '建議知識。' } });
    fireEvent.click(view.getByRole('button', { name: labels.save }));
    await waitFor(() => assert.ok(view.getByRole('button', { name: labels.adopt })));
    assert.deepEqual(actions, ['submit']);
    assert.equal((view.getByRole('button', { name: labels.adopt }) as HTMLButtonElement).disabled, true);
    fireEvent.click(view.getByRole('checkbox'));
    fireEvent.click(view.getByRole('button', { name: labels.adopt }));
    await waitFor(() => assert.ok(view.getByRole('button', { name: labels.revoke })));
    fireEvent.click(view.getByRole('button', { name: labels.revoke }));
    await waitFor(() => assert.deepEqual(actions, ['submit', 'adopt', 'revoke']));
  });
}
