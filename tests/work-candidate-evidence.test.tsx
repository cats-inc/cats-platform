import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { CandidateEvidenceSection } from '../src/products/work/renderer/components/tasks/CandidateEvidenceSection.tsx';

afterEach(() => { cleanup(); resetTestDom(); });
const receipt = { root: 'C:/owned/candidate', launchId: 'a'.repeat(64), instanceId: 'b'.repeat(32) };
const file = (value: unknown) => ({ name: 'candidate-evidence.json', size: 200, text: async () => JSON.stringify(value) });
test('owner explicitly attaches selected receipt; only its bounded identity is sent', async t => {
  const calls: Array<{ url: string; body: unknown }> = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return Response.json({ artifactId: 'artifact', path: '/code/artifacts/artifact', created: true });
  });
  const view = render(<MemoryRouter><CandidateEvidenceSection taskId="owned-task" /></MemoryRouter>);
  fireEvent.change(view.getByLabelText('Candidate receipt'), { target: { files: [file({ ...receipt, token: 'must-not-be-sent' })] } });
  await waitFor(() => assert.equal((view.getByRole('button') as HTMLButtonElement).disabled, false));
  assert.equal(calls.length, 0);
  fireEvent.click(view.getByRole('button', { name: 'Check and attach' }));
  await waitFor(() => assert.ok(view.getByRole('link', { name: 'Open candidate build evidence' })));
  assert.deepEqual(calls, [{ url: '/api/work/tasks/owned-task/candidate-evidence', body: receipt }]);
});
test('bad files stay local and a late previous selection cannot replace the current receipt', async t => {
  let release!: (text: string) => void; let delivered: unknown;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    delivered = JSON.parse(String(options?.body)); return Response.json({}, { status: 409 });
  });
  const view = render(<MemoryRouter><CandidateEvidenceSection taskId="owned-task" /></MemoryRouter>);
  const input = view.getByLabelText('Candidate receipt');
  fireEvent.change(input, { target: { files: [file({ invalid: true })] } });
  await waitFor(() => assert.ok(view.getByRole('alert')));
  fireEvent.change(input, { target: { files: [{ size: 100, text: () => new Promise<string>(resolve => { release = resolve; }) }] } });
  fireEvent.change(input, { target: { files: [file(receipt)] } });
  await waitFor(() => assert.equal((view.getByRole('button') as HTMLButtonElement).disabled, false));
  release(JSON.stringify({ ...receipt, root: 'old-selection' }));
  await Promise.resolve();
  fireEvent.click(view.getByRole('button'));
  await waitFor(() => assert.ok(view.getByRole('alert')));
  assert.deepEqual(delivered, receipt);
  assert.equal(view.queryByRole('link'), null);
});
