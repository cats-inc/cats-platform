import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('CodeRelayView exposes thread shell, agent roster, and fan-out seams', () => {
  const source = readFileSync(
    new URL('../src/products/code/renderer/components/CodeRelayView.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /Code Relay/u);
  assert.match(source, /Agent Roster/u);
  assert.match(source, /Fan out prompt/u);
  assert.match(source, /Quota note/u);
  assert.match(source, /runCodeRelayFanOut/u);
  assert.match(source, /updateCodeRelayRosterEntry/u);
  assert.match(source, /Create relay thread/u);
});
