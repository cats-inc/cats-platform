import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { PracticeProposalSection } from '../src/products/work/renderer/components/tasks/PracticeProposalSection.tsx';

afterEach(() => { cleanup(); resetTestDom(); });
const proposal = { schemaVersion: 1, source: 'cats-practice', category: 'product_defect', evidenceMode: 'fixture',
  runId: '12345678-1234-1234-1234-123456789abc', attemptId: '0001', attemptDigest: 'a'.repeat(64),
  candidateDigest: 'b'.repeat(64), exerciseDigest: 'c'.repeat(64), diagnosisDigest: 'd'.repeat(64),
  diagnosedBy: 'reviewer', title: 'Inspect mismatch', summary: 'Reproduce the selected failed observation.' };
const file = (value: unknown) => ({ size: 1000, text: async () => JSON.stringify(value) });
test('proposal import previews fixture provenance and requires a separate owner confirmation', async t => {
  let submitted: unknown;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    submitted = JSON.parse(String(options?.body)); return Response.json({ taskId: 'proposal', created: true, path: '/work/tasks/proposal' });
  });
  const view = render(<MemoryRouter><PracticeProposalSection /></MemoryRouter>);
  fireEvent.click(view.getByText('Import a practice finding'));
  fireEvent.change(view.getByLabelText('Development proposal'), { target: { files: [file(proposal)] } });
  await waitFor(() => assert.ok(view.getByText('Inspect mismatch')));
  assert.ok(view.getByText(/Synthetic test evidence/u));
  assert.equal((view.getByRole('button') as HTMLButtonElement).disabled, true); assert.equal(submitted, undefined);
  fireEvent.click(view.getByRole('checkbox')); fireEvent.click(view.getByRole('button'));
  await waitFor(() => assert.ok(view.getByRole('link')));
  assert.deepEqual(submitted, { confirmed: true, proposal });
});

test('unexpected authority fields are rejected locally and reselection clears approval', async () => {
  const view = render(<MemoryRouter><PracticeProposalSection /></MemoryRouter>);
  fireEvent.click(view.getByText('Import a practice finding'));
  const input = view.getByLabelText('Development proposal');
  fireEvent.change(input, { target: { files: [file({ ...proposal, executionGrant: 'must not be sent' })] } });
  await waitFor(() => assert.ok(view.getByRole('alert')));
  assert.equal(view.queryByRole('checkbox'), null);
  fireEvent.change(input, { target: { files: [file(proposal)] } });
  await waitFor(() => assert.ok(view.getByRole('checkbox')));
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.change(input, { target: { files: [file({ ...proposal, title: 'Another finding' })] } });
  await waitFor(() => assert.ok(view.getByText('Another finding')));
  assert.equal((view.getByRole('checkbox') as HTMLInputElement).checked, false);
});
