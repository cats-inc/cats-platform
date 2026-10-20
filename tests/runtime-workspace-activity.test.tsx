import assert from 'node:assert/strict';
import test from 'node:test';
import { isWorkspaceActivitySnapshot, readRuntimeWorkspaceActivity } from '../src/runtime/workspaceActivity.ts';
import { readRuntimeNdjsonResponse, readRuntimeSseResponse } from '../src/runtime/clientStreams.ts';
import { runtimeSnapshot } from './fixtures/workAreas.ts';

test('Runtime native snapshot wire consumer validates strict bounded facts without Node-only APIs', () => {
  const snapshot = runtimeSnapshot();
  assert.equal(isWorkspaceActivitySnapshot(snapshot), true);
  assert.equal(readRuntimeWorkspaceActivity(snapshot, 'foreign'), null);
  const withSecret = structuredClone(snapshot);
  Object.assign(withSecret.workspaces[0].repository!, { credential: 'secret' });
  assert.equal(readRuntimeWorkspaceActivity(withSecret), null);
  const oversized = { ...snapshot, startupCwd: 'x'.repeat(70000) };
  assert.equal(readRuntimeWorkspaceActivity(oversized), null);
  const detached = structuredClone(snapshot);
  detached.workspaces[0].detachedCommit = 'a'.repeat(40);
  assert.equal(readRuntimeWorkspaceActivity(detached), null, 'branch and detached identity cannot contradict');
});

test('NDJSON workspace snapshots stay outside transcript and a stalled consumer cannot stall the turn', async () => {
  const snapshot = runtimeSnapshot();
  const frames = Array.from({ length: 100 }, (_, i) => ({ type: 'workspace_activity', workspaceActivity: { ...snapshot, revision: i + 1 } }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const revisions: number[] = [];
  const body = [...frames, { type: 'text', text: 'Answer' }, { type: 'result', usage: { inputTokens: 1, outputTokens: 2 } }]
    .map(frame => JSON.stringify(frame)).join('\n');
  const result = await Promise.race([readRuntimeNdjsonResponse(new Response(body), {
    sessionId: snapshot.sessionId, onWorkspaceActivity: async value => { revisions.push(value.revision); await gate; },
  }), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('observation blocked message')), 1000))]);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].text, 'Answer');
  assert.equal(result.tokensUsed, 3);
  assert.equal(revisions.length, 1, 'one in-flight consumer');
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(revisions, [1, 100], 'only latest pending snapshot retained');
});

test('NDJSON observer failures and malformed/foreign snapshots do not affect model output', async () => {
  const snapshot = runtimeSnapshot();
  const seen: string[] = [];
  const body = [
    { type: 'workspace_activity', workspaceActivity: snapshot },
    { type: 'workspace_activity', workspaceActivity: { ...snapshot, sessionId: 'foreign' } },
    { type: 'workspace_activity', workspaceActivity: { ...snapshot, credential: 'SECRET' } },
    { type: 'text', text: 'Still succeeds' }, { type: 'result' },
  ].map(frame => JSON.stringify(frame)).join('\n');
  const result = await readRuntimeNdjsonResponse(new Response(body), { sessionId: snapshot.sessionId,
    onWorkspaceActivity: value => { seen.push(value.sessionId); throw new Error('optional consumer'); } });
  assert.equal(result.segments[0].text, 'Still succeeds');
  assert.deepEqual(seen, [snapshot.sessionId]);
});

test('SSE validates the same schema and preserves its side-channel event name', async () => {
  const snapshot = runtimeSnapshot();
  const body = [snapshot, { ...snapshot, sessionId: 'foreign' }, { ...snapshot, credential: 'secret' }]
    .map(workspaceActivity => `event: workspace_activity\ndata: ${JSON.stringify({ type: 'workspace_activity', workspaceActivity })}\n\n`).join('');
  const events: unknown[] = [];
  await readRuntimeSseResponse(new Response(body), event => { events.push(event); }, { sessionId: snapshot.sessionId });
  assert.deepEqual(events, [{ event: 'workspace_activity', data: { type: 'workspace_activity', workspaceActivity: snapshot } }]);
});
