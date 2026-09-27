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
  await waitFor(() => assert.equal((view.getByRole('button', { name: 'Check and attach' }) as HTMLButtonElement).disabled, false));
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
  await waitFor(() => assert.equal((view.getByRole('button', { name: 'Check and attach' }) as HTMLButtonElement).disabled, false));
  release(JSON.stringify({ ...receipt, root: 'old-selection' }));
  await Promise.resolve();
  fireEvent.click(view.getByRole('button', { name: 'Check and attach' }));
  await waitFor(() => assert.ok(view.getByRole('alert')));
  assert.deepEqual(delivered, receipt);
  assert.equal(view.queryByRole('link'), null);
});

test('owner prepares a downloadable record without starting or attaching a candidate', async t => {
  const calls: Array<{ url: string; body: { root: string; requestId: string } }> = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return Response.json({ artifactId: 'prepared', ownership: { root: '/new/candidate', claim: 'prepared_only' } });
  });
  const view = render(<MemoryRouter><CandidateEvidenceSection taskId="owned-task" /></MemoryRouter>);
  fireEvent.click(view.getByText('Prepare candidate record', { selector: 'summary' }));
  fireEvent.change(view.getByLabelText('New candidate folder (absolute path)'), { target: { value: '/new/candidate' } });
  assert.equal(calls.length, 0);
  fireEvent.click(view.getByRole('button', { name: 'Prepare candidate record' }));
  const link = await view.findByRole('link', { name: 'Download candidate record' });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/api/work/tasks/owned-task/candidate-preparation');
  assert.equal(calls[0].body.root, '/new/candidate'); assert.ok(calls[0].body.requestId);
  assert.equal(link.getAttribute('download'), 'candidate-ownership.json');
  assert.equal(view.queryByRole('link', { name: 'Open candidate build evidence' }), null);
});

test('switching tasks discards a late prepared download', async t => {
  let release!: (value: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { release = resolve; }));
  const view = render(<MemoryRouter><CandidateEvidenceSection taskId="first-task" /></MemoryRouter>);
  fireEvent.click(view.getByText('Prepare candidate record', { selector: 'summary' }));
  fireEvent.change(view.getByLabelText('New candidate folder (absolute path)'), { target: { value: '/new/candidate' } });
  fireEvent.click(view.getByRole('button', { name: 'Prepare candidate record' }));
  view.rerender(<MemoryRouter><CandidateEvidenceSection taskId="second-task" /></MemoryRouter>);
  release(Response.json({ ownership: { taskId: 'first-task' } }));
  await waitFor(() => assert.equal((view.getByLabelText('New candidate folder (absolute path)') as HTMLInputElement).value, ''));
  assert.equal(view.queryByRole('link', { name: 'Download candidate record' }), null);
});

test('selecting the companion task sends its identity and changing it clears prepared output', async t => {
  const requests: Array<{ companionTaskId?: string; requestId: string }> = [];
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body)); requests.push(body);
    return Response.json({ ownership: { taskId: 'platform-task', companionTaskId: body.companionTaskId } });
  });
  const view = render(<MemoryRouter><CandidateEvidenceSection taskId="platform-task"
    companionTasks={[{ id: 'runtime-task', title: 'Runtime fix' }]} /></MemoryRouter>);
  fireEvent.change(view.getByLabelText('New candidate folder (absolute path)'), { target: { value: '/new/candidate' } });
  const selector = view.getByLabelText('Include the other repository’s implementation task (optional)');
  fireEvent.change(selector, { target: { value: 'runtime-task' } });
  fireEvent.click(view.getByRole('button', { name: 'Prepare candidate record' }));
  await view.findByRole('link', { name: 'Download candidate record' });
  assert.equal(requests[0].companionTaskId, 'runtime-task');
  fireEvent.change(selector, { target: { value: '' } });
  assert.equal(view.queryByRole('link', { name: 'Download candidate record' }), null);
  fireEvent.click(view.getByRole('button', { name: 'Prepare candidate record' }));
  await view.findByRole('link', { name: 'Download candidate record' });
  assert.equal(requests[1].companionTaskId, undefined);
  assert.notEqual(requests[1].requestId, requests[0].requestId);
});
