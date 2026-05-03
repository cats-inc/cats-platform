import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('CodeRelayView exposes thread shell, agent roster, and fan-out seams', () => {
  const source = readFileSync(
    new URL('../src/products/code/renderer/components/CodeRelayView.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /messageKeys\.codeRelayTitle/u);
  assert.match(source, /messageKeys\.codeRelayLabelRoster/u);
  assert.match(source, /messageKeys\.codeRelayLabelRoundPrompt/u);
  assert.match(source, /messageKeys\.codeRelayLabelQuotaNote/u);
  assert.match(source, /runCodeRelayFanOut/u);
  assert.match(source, /updateCodeRelayRosterEntry/u);
  assert.match(source, /labelCodeRelayModeForLocale\(round\.mode, t\)/u);
  assert.match(source, /labelCodeRelayRoleForLocale\(entry\.recentRole, t\)/u);
  assert.match(source, /messageKeys\.codeRelayActionCreateRelayThread/u);
});
