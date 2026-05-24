import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import {
  createCodeRelayThread,
  finishCodeRelayFanOut,
  readCodeRelayThread,
  startCodeRelayFanOut,
  updateCodeRelayRosterEntry,
} from '../build/server/products/code/state/relayState.js';

test('createCodeRelayThread seeds a persistent thread-wide roster', () => {
  const created = createCodeRelayThread(
    createDefaultCoreState(),
    {
      title: 'Relay MVP',
      objective: 'Compare agent opinions',
      repoPath: 'C:/repo/cats-platform',
    },
    new Date('2026-03-30T10:00:00.000Z'),
  );

  assert.equal(created.project.title, 'Relay MVP');
  assert.equal(created.project.summary, 'Compare agent opinions');
  assert.equal(created.thread.roster.length, 3);
  assert.deepEqual(
    created.thread.roster.map((entry) => entry.provider),
    ['claude', 'codex', 'antigravity'],
  );
  assert.ok(created.thread.roster.every((entry) => entry.modelSelection === null));
});

test('roster entry target can be reconfigured without changing slot identity', () => {
  const created = createCodeRelayThread(
    createDefaultCoreState(),
    {
      title: 'Relay MVP',
      objective: 'Compare agent opinions',
      repoPath: 'C:/repo/cats-platform',
    },
    new Date('2026-03-30T10:00:00.000Z'),
  );

  const originalEntry = created.thread.roster[0];
  const updated = updateCodeRelayRosterEntry(
    created.core,
    created.project.id,
    originalEntry.id,
    {
      provider: 'cursor',
      instance: 'native',
      model: 'gpt-5.4',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
      },
    },
    new Date('2026-03-30T10:01:00.000Z'),
  );

  assert.ok(updated);
  assert.equal(updated.thread.roster[0].id, originalEntry.id);
  assert.equal(updated.thread.roster[0].provider, 'cursor');
  assert.equal(updated.thread.roster[0].label, 'Cursor');
  assert.equal(updated.thread.roster[0].availability, 'unknown');
  assert.deepEqual(updated.thread.roster[0].modelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
  });
});

test('fan-out round records prompt, dispatch status, and proven providers', () => {
  const created = createCodeRelayThread(
    createDefaultCoreState(),
    {
      title: 'Relay MVP',
      objective: 'Compare agent opinions',
      repoPath: 'C:/repo/cats-platform',
    },
    new Date('2026-03-30T10:00:00.000Z'),
  );

  const started = startCodeRelayFanOut(
    created.core,
    created.project.id,
    {
      mode: 'discover',
      objective: 'Challenge implementation options',
      prompt: 'Which route is safer?',
      agentIds: created.thread.roster.slice(0, 2).map((entry) => entry.id),
    },
    new Date('2026-03-30T10:05:00.000Z'),
  );

  assert.ok(started);
  assert.equal(started.round.status, 'waiting_for_agents');
  assert.equal(started.round.messages.length, 1);
  assert.equal(started.round.dispatches.length, 2);

  const finished = finishCodeRelayFanOut(
    started.core,
    created.project.id,
    started.round.id,
    [
      {
        entryId: started.targetEntries[0].id,
        content: 'Codex says use the narrower route.',
        stdoutExcerpt: 'stdout-a',
        stderrExcerpt: null,
      },
      {
        entryId: started.targetEntries[1].id,
        error: 'Claude CLI unavailable.',
      },
    ],
    new Date('2026-03-30T10:06:00.000Z'),
  );

  assert.ok(finished);
  assert.equal(finished.thread.status, 'waiting_for_user');
  assert.deepEqual(finished.thread.provenProviderIds, [started.targetEntries[0].provider]);
  assert.equal(finished.thread.rounds[0].status, 'waiting_for_user');
  assert.equal(finished.thread.rounds[0].messages.length, 2);
  assert.equal(finished.thread.rounds[0].messages[0].kind, 'prompt');
  assert.equal(finished.thread.rounds[0].messages[1].kind, 'response');
  assert.equal(finished.thread.rounds[0].dispatches[0].status, 'completed');
  assert.equal(finished.thread.rounds[0].dispatches[1].status, 'failed');
});

test('readCodeRelayThread derives deterministic fallback ids for malformed metadata', () => {
  const created = createCodeRelayThread(
    createDefaultCoreState(),
    {
      title: 'Malformed relay',
      objective: 'Recover deterministic ids',
      repoPath: null,
    },
    new Date('2026-03-30T10:00:00.000Z'),
  );

  const malformedProject = {
    ...created.project,
    metadata: {
      codeRelay: {
        version: 1,
        contract: {
          version: 'phase0-runtime-bridge-v1',
          transport: 'runtime_session_bridge',
          supportedProviders: ['codex'],
          notes: [],
        },
        status: 'active',
        roster: [{ provider: 'codex', label: 'Codex' }],
        rounds: [{
          prompt: 'test',
          dispatches: [{ agentId: 'codex:native' }],
          messages: [{ content: 'hello' }],
        }],
        currentRoundId: null,
        provenProviderIds: [],
      },
    },
  };

  const firstRead = readCodeRelayThread(malformedProject);
  const secondRead = readCodeRelayThread(malformedProject);

  assert.ok(firstRead);
  assert.ok(secondRead);
  assert.equal(firstRead.roster[0].id, secondRead.roster[0].id);
  assert.equal(firstRead.rounds[0].id, secondRead.rounds[0].id);
  assert.equal(firstRead.rounds[0].dispatches[0].id, secondRead.rounds[0].dispatches[0].id);
  assert.equal(firstRead.rounds[0].messages[0].id, secondRead.rounds[0].messages[0].id);
});
