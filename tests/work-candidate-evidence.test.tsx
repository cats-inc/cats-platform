import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { CandidateEvidenceSection } from '../src/products/work/renderer/components/tasks/CandidateEvidenceSection.tsx';
import { CandidateLifecycleSection } from '../src/products/work/renderer/components/tasks/CandidateLifecycleSection.tsx';
import { CandidateReviewSection } from '../src/products/work/renderer/components/tasks/CandidateReviewSection.tsx';

afterEach(() => { cleanup(); resetTestDom(); });
const reviewTarget = { bindingDigest: 'a'.repeat(64), members: [{ member: 'platform' as const, commitId: 'b'.repeat(40) },
  { member: 'runtime' as const, commitId: 'c'.repeat(40) }] };

test('manual review is explicit, retries the same request after a lost response and keeps the selected build', async t => {
  const calls: Array<{ url: string; body: Record<string, string> }> = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body)); calls.push({ url: String(url), body });
    if (calls.length === 1) throw new Error('Lost saved response');
    return Response.json({ created: false, review: { artifactId: 'review-record', bindingDigest: body.bindingDigest,
      verdict: body.verdict, checks: body.checks, reviewerActorId: 'mapped-owner', reviewedAt: '2026-09-27T00:00:00Z' } });
  });
  const view = render(<CandidateReviewSection taskId="owned-task" artifactId="owned-build" target={reviewTarget} />);
  fireEvent.click(view.getByText('Record manual review'));
  assert.equal(calls.length, 0);
  assert.equal((view.getByRole('button', { name: 'Save review' }) as HTMLButtonElement).disabled, true);
  fireEvent.change(view.getByLabelText('Checks and observed results'), { target: { value: 'Checked opening and closing the candidate.' } });
  fireEvent.change(view.getByLabelText('Conclusion'), { target: { value: 'accepted' } });
  fireEvent.click(view.getByRole('button', { name: 'Save review' }));
  await view.findByRole('alert');
  fireEvent.click(view.getByRole('button', { name: 'Save review' }));
  await view.findByText('Last recorded review: Accepted by reviewer');
  assert.equal(calls.length, 2); assert.deepEqual(calls[1], calls[0]);
  assert.equal(calls[0].url, '/api/work/tasks/owned-task/candidate-review');
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['artifactId', 'bindingDigest', 'checks', 'requestId', 'verdict']);
  assert.equal(calls[0].body.bindingDigest, reviewTarget.bindingDigest); assert.equal(calls[0].body.artifactId, 'owned-build');
  assert.equal((view.getByLabelText('Checks and observed results') as HTMLTextAreaElement).value, '');
});

test('switching a review target ignores late replies and clears the old draft', async t => {
  let release!: (response: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { release = resolve; }));
  const view = render(<CandidateReviewSection taskId="first" artifactId="old-build" target={reviewTarget} />);
  fireEvent.click(view.getByText('Record manual review'));
  fireEvent.change(view.getByLabelText('Checks and observed results'), { target: { value: 'Old result' } });
  fireEvent.click(view.getByRole('button', { name: 'Save review' }));
  view.rerender(<CandidateReviewSection taskId="second" artifactId="new-build" target={{ ...reviewTarget, bindingDigest: 'd'.repeat(64) }} />);
  release(Response.json({ review: { verdict: 'accepted', checks: 'Old result', reviewerActorId: 'old-owner' } }));
  await waitFor(() => assert.equal((view.getByLabelText('Checks and observed results') as HTMLTextAreaElement).value, ''));
  assert.equal(view.queryByText('Old result'), null); assert.equal(view.queryByRole('status'), null);
});

test('candidate management exposes the stored review only for a complete review target', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ candidates: [
    { artifactId: 'draft', root: '/draft' }, { artifactId: 'ready', root: '/ready', reviewTarget,
      lastReview: { artifactId: 'review', bindingDigest: reviewTarget.bindingDigest, verdict: 'changes_requested', checks: 'The second window needs attention.',
        reviewerActorId: 'owner', reviewedAt: '2026-09-27T00:00:00Z' } },
  ] }); });
  const view = render(<CandidateLifecycleSection taskId="owned" />);
  fireEvent.click(view.getByText('Manage prepared candidates'));
  fireEvent.click(view.getByRole('button', { name: 'Load candidate records' }));
  await view.findByText('The second window needs attention.');
  assert.equal(view.getAllByText('Record manual review').length, 1); assert.equal(calls, 1);
});

test('a late older or empty candidate list cannot replace a confirmed manual review', async t => {
  let reads = 0, release!: (response: Response) => void;
  const oldReview = { artifactId: 'old-review', bindingDigest: reviewTarget.bindingDigest, verdict: 'changes_requested',
    checks: 'Older review.', reviewerActorId: 'owner', reviewedAt: '2026-09-27T00:00:00Z' };
  const row = { artifactId: 'ready', root: '/ready', reviewTarget };
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body));
      return Response.json({ review: { ...oldReview, artifactId: 'new-review', verdict: body.verdict,
        checks: body.checks, reviewedAt: '2026-09-27T00:00:01Z' } });
    }
    if (++reads === 2) return new Promise<Response>(resolve => { release = resolve; });
    return Response.json({ candidates: [{ ...row, ...(reads === 1 ? { lastReview: oldReview } : {}) }] });
  });
  const view = render(<CandidateLifecycleSection taskId="owned" />);
  fireEvent.click(view.getByText('Manage prepared candidates'));
  const load = view.getByRole('button', { name: 'Load candidate records' });
  fireEvent.click(load); await view.findByText('Older review.');
  fireEvent.click(view.getByText('Record manual review'));
  fireEvent.click(load);
  fireEvent.change(view.getByLabelText('Checks and observed results'), { target: { value: 'New confirmed review.' } });
  fireEvent.click(view.getByRole('button', { name: 'Save review' }));
  await view.findByText('New confirmed review.');
  release(Response.json({ candidates: [{ ...row, lastReview: oldReview }] }));
  await waitFor(() => assert.equal((load as HTMLButtonElement).disabled, false));
  assert.equal(view.queryByText('Older review.'), null); assert.ok(view.getByText('New confirmed review.'));
  fireEvent.click(load);
  await waitFor(() => assert.equal(reads, 3));
  assert.ok(view.getByText('New confirmed review.'));
});

test('a delayed review POST cannot replace a newer review already loaded from the server', async t => {
  let reads = 0, release!: (response: Response) => void;
  const row = { artifactId: 'ready', root: '/ready', reviewTarget };
  const latest = { artifactId: 'latest', bindingDigest: reviewTarget.bindingDigest, verdict: 'accepted',
    checks: 'Newer server review.', reviewerActorId: 'another-reviewer', reviewedAt: '2026-09-27T00:00:02Z' };
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    if (options?.method === 'POST') return new Promise<Response>(resolve => { release = resolve; });
    return Response.json({ candidates: [{ ...row, ...(++reads === 2 ? { lastReview: latest } : {}) }] });
  });
  const view = render(<CandidateLifecycleSection taskId="owned" />);
  fireEvent.click(view.getByText('Manage prepared candidates'));
  const load = view.getByRole('button', { name: 'Load candidate records' });
  fireEvent.click(load); await view.findByText('Record manual review');
  fireEvent.click(view.getByText('Record manual review'));
  fireEvent.change(view.getByLabelText('Checks and observed results'), { target: { value: 'Earlier submitted review.' } });
  fireEvent.click(view.getByRole('button', { name: 'Save review' }));
  fireEvent.click(load); await view.findByText('Newer server review.');
  release(Response.json({ review: { ...latest, artifactId: 'earlier', checks: 'Earlier submitted review.', reviewedAt: '2026-09-27T00:00:01Z' } }));
  await waitFor(() => assert.equal((view.getByLabelText('Checks and observed results') as HTMLTextAreaElement).disabled, false));
  assert.ok(view.getByText('Newer server review.')); assert.equal(view.queryByText('Earlier submitted review.'), null);
});

test('saved candidate controls load only on request and stop sends only the selected artifact action', async t => {
  const calls: Array<{ url: string; body?: { artifactId: string; action: string } }> = [];
  let stopped = false;
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    calls.push({ url: String(url), ...(body ? { body } : {}) });
    if (!body) return Response.json({ candidates: [{ artifactId: 'owned', root: '/owned/candidate' }] });
    if (body.action === 'stop') stopped = true;
    return Response.json({ artifactId: 'owned', observation: { state: stopped ? 'drained' : 'running', instanceBoundStop: true } });
  });
  const view = render(<CandidateEvidenceSection taskId="historical" evidenceAvailable={false} />);
  assert.equal(view.queryByText('Prepare candidate record'), null);
  assert.equal(calls.length, 0);
  fireEvent.click(view.getByText('Manage prepared candidates'));
  fireEvent.click(view.getByRole('button', { name: 'Load candidate records' }));
  await view.findByText('/owned/candidate');
  assert.equal((view.getByRole('button', { name: 'Stop candidate Desktop' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Check candidate status' }));
  await waitFor(() => assert.equal((view.getByRole('button', { name: 'Stop candidate Desktop' }) as HTMLButtonElement).disabled, false));
  fireEvent.click(view.getByRole('button', { name: 'Stop candidate Desktop' }));
  await view.findByText('Last check: candidate reported a successful shutdown.');
  assert.deepEqual(calls.map(row => row.body), [undefined, { artifactId: 'owned', action: 'status' }, { artifactId: 'owned', action: 'stop' }]);
  assert.ok(calls.every(row => row.url === '/api/work/tasks/historical/candidate-control'));
  assert.equal((view.getByRole('button', { name: 'Stop candidate Desktop' }) as HTMLButtonElement).disabled, true);
});

test('switching tasks discards late candidate records and does not automatically send a stop', async t => {
  let release!: (value: Response) => void; let calls = 0;
  t.mock.method(globalThis, 'fetch', () => { calls++; return new Promise<Response>(resolve => { release = resolve; }); });
  const view = render(<CandidateLifecycleSection taskId="first" />);
  fireEvent.click(view.getByText('Manage prepared candidates'));
  fireEvent.click(view.getByRole('button', { name: 'Load candidate records' }));
  view.rerender(<CandidateLifecycleSection taskId="second" />);
  release(Response.json({ candidates: [{ artifactId: 'foreign', root: '/old/candidate' }] }));
  await waitFor(() => assert.equal((view.getByRole('button', { name: 'Load candidate records' }) as HTMLButtonElement).disabled, false));
  assert.equal(view.queryByText('/old/candidate'), null); assert.equal(calls, 1);
});

test('a lost stop response stays unconfirmed and requires status inspection instead of showing the old running state', async t => {
  const actions: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    if (!options?.body) return Response.json({ candidates: [{ artifactId: 'owned', root: '/candidate',
      observation: { state: 'running', instanceBoundStop: true } }] });
    const body = JSON.parse(String(options.body)); actions.push(body.action);
    if (body.action === 'stop') throw new Error('Lost response');
    return Response.json({ artifactId: 'owned', observation: { state: 'drained', instanceBoundStop: true } });
  });
  const view = render(<CandidateLifecycleSection taskId="owned-task" />);
  fireEvent.click(view.getByText('Manage prepared candidates'));
  fireEvent.click(view.getByRole('button', { name: 'Load candidate records' }));
  await view.findByText('Last check: candidate is starting or running.');
  fireEvent.click(view.getByRole('button', { name: 'Stop candidate Desktop' }));
  await view.findByRole('alert');
  assert.equal(view.queryByText('Last check: candidate is starting or running.'), null);
  assert.ok(view.getByText('Candidate status is unconfirmed. Check again before another action.'));
  assert.equal((view.getByRole('button', { name: 'Stop candidate Desktop' }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByRole('button', { name: 'Check candidate status' }) as HTMLButtonElement).disabled, false);
  assert.deepEqual(actions, ['stop']);
  fireEvent.click(view.getByRole('button', { name: 'Check candidate status' }));
  await view.findByText('Last check: candidate reported a successful shutdown.');
  assert.deepEqual(actions, ['stop', 'status']);
});
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
