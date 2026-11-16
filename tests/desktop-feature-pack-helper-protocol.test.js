// Helper protocol 1 (SPEC-145 FR-A4) as the host parses it, driven by the
// scripted helper inside fixture packs.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';

import { parseVoiceCaptureHelperEvent } from '../build/desktop/voiceCapture.js';
import { FIXTURE_HELPER_SOURCE, FIXTURE_PACK_ENTRY } from './fixtures/featurePackFixtures.mjs';

async function writeFixtureHelper() {
  const directory = await mkdtemp(join(tmpdir(), 'cats-feature-pack-helper-'));
  const helperPath = join(directory, FIXTURE_PACK_ENTRY);
  await writeFile(helperPath, FIXTURE_HELPER_SOURCE, 'utf8');
  return helperPath;
}

/** Runs the helper, sends `command` after `ready`, and returns the parsed events. */
async function runFixtureHelper({ args = [], command, scenario } = {}) {
  const helperPath = await writeFixtureHelper();
  const sessionId = 'session-1';
  const child = spawn(process.execPath, [helperPath, '--session-id', sessionId, ...args], {
    env: { ...process.env, ...(scenario ? { CATS_STT_FIXTURE_SCENARIO: scenario } : {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const events = [];
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    const event = parseVoiceCaptureHelperEvent(line);
    if (event) {
      events.push(event);
      if (event.type === 'ready' && command) {
        child.stdin.write(`${JSON.stringify({ type: command, sessionId })}\n`);
      }
    }
  });
  const status = await new Promise((resolve) => child.on('close', resolve));
  return { events, status };
}

test('the host parses a ready event whose locale is auto', () => {
  assert.deepEqual(
    parseVoiceCaptureHelperEvent(
      JSON.stringify({ type: 'ready', sessionId: 's', locale: 'auto', mode: 'on-device' }),
    ),
    { type: 'ready', sessionId: 's', locale: 'auto', mode: 'on-device' },
  );
});

test('the scripted helper detects by default and transcribes on stop', async () => {
  const { events, status } = await runFixtureHelper({ command: 'stop' });
  assert.equal(status, 0);
  assert.deepEqual(events, [
    { type: 'ready', sessionId: 'session-1', locale: 'auto', mode: 'on-device' },
    { type: 'final', sessionId: 'session-1', text: 'fixture transcript' },
    { type: 'end', sessionId: 'session-1' },
  ]);
});

test('the scripted helper echoes --locale and honors cancel', async () => {
  const { events } = await runFixtureHelper({ args: ['--locale', 'zh'], command: 'cancel' });
  assert.deepEqual(events, [
    { type: 'ready', sessionId: 'session-1', locale: 'zh', mode: 'on-device' },
    { type: 'error', sessionId: 'session-1', reason: 'cancelled' },
    { type: 'end', sessionId: 'session-1' },
  ]);
});

test('the scripted helper can fail before ready', async () => {
  const unavailable = await runFixtureHelper({ scenario: 'engine_unavailable' });
  assert.deepEqual(unavailable.events, [
    { type: 'error', sessionId: 'session-1', reason: 'engine_unavailable' },
    { type: 'end', sessionId: 'session-1' },
  ]);

  const crashed = await runFixtureHelper({ scenario: 'exit_before_ready' });
  assert.equal(crashed.status, 1);
  assert.deepEqual(crashed.events, []);
});
