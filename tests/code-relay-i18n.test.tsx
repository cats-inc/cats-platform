import assert from 'node:assert/strict';
import test from 'node:test';

import { createTranslator } from '../src/shared/i18n/index.ts';
import { labelRelayTransport } from '../src/products/code/renderer/components/CodeRelayView.tsx';
import { presentCodeRelayAvailabilitySummary } from '../src/products/code/renderer/components/codeRelayAvailabilitySummaryLabels.ts';
import type { CodeRelayRosterEntryPayload } from '../src/products/code/renderer/api/relay.ts';

function createRosterEntry(
  patch: Partial<CodeRelayRosterEntryPayload>,
): CodeRelayRosterEntryPayload {
  return {
    id: 'agent-1',
    provider: 'cursor',
    label: 'Cursor Agent',
    instance: 'native',
    model: null,
    modelSelection: null,
    transport: 'runtime_session_bridge',
    availability: 'unknown',
    availabilitySummary: null,
    quotaNote: null,
    recentRole: 'idle',
    enabled: true,
    ...patch,
  };
}

test('code relay availability summaries localize deterministic runtime probes', () => {
  const t = createTranslator('zh-TW');
  const unavailable = presentCodeRelayAvailabilitySummary(
    createRosterEntry({
      availabilitySummary: {
        kind: 'provider_path_missing',
        providerLabel: 'Cursor Agent',
      },
    }),
    t,
  );
  const ready = presentCodeRelayAvailabilitySummary(
    createRosterEntry({
      availabilitySummary: {
        kind: 'runtime_ready_via',
        target: 'cursor-native',
      },
    }),
    t,
  );

  assert.equal(
    unavailable,
    '執行階段沒有回報已設定的 Cursor Agent 供應器路徑。',
  );
  assert.equal(ready, '執行階段已透過 cursor-native 就緒。');
});

test('code relay availability summaries keep provider fallback stable', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    presentCodeRelayAvailabilitySummary(
      createRosterEntry({
        provider: 'claude',
        instance: null,
      }),
      t,
    ),
    'claude:預設',
  );
});

test('code relay transport metadata localizes known connector transports', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    labelRelayTransport('runtime_session_bridge', t),
    '執行階段工作階段橋接',
  );
  assert.equal(labelRelayTransport(null, t), '未知傳輸');
  assert.equal(labelRelayTransport('future_pipe', t), '未知傳輸（future_pipe）');
});
