import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendHostEvent,
  appendRuntimeEvent,
  buildDesktopAggregationBundle,
  createDesktopBootstrapEvent,
  createEmptyDesktopDiagnosticsState,
} from '../dist-electron/bootstrapDiagnostics.js';

test('desktop aggregation bundle prefers the active bootstrap attempt and keeps layer representation', () => {
  let diagnostics = createEmptyDesktopDiagnosticsState(['cats-runtime', 'cats']);
  diagnostics = {
    ...diagnostics,
    activeAttemptId: 'attempt-current',
  };
  diagnostics = appendRuntimeEvent(diagnostics, createDesktopBootstrapEvent({
    layer: 'runtime',
    kind: 'runtime_status_observed',
    timestamp: '2026-03-31T02:00:00.000Z',
    attemptId: 'attempt-current',
    summary: 'Runtime is unavailable.',
    status: 'unavailable',
  }));
  diagnostics = appendHostEvent(diagnostics, createDesktopBootstrapEvent({
    layer: 'host',
    kind: 'host_phase_changed',
    timestamp: '2026-03-31T02:00:01.000Z',
    attemptId: 'attempt-current',
    summary: 'Desktop host phase is failed.',
    status: 'unavailable',
  }));

  const bundle = buildDesktopAggregationBundle({
    generatedAt: '2026-03-31T02:00:02.000Z',
    attemptId: 'attempt-current',
    runtimeEvents: diagnostics.runtimeEvents,
    product: {
      generatedAt: '2026-03-31T02:00:02.000Z',
      attemptId: 'attempt-current',
      status: 'info',
      summary: 'Setup was opened.',
      historyPath: 'C:/Users/test/AppData/Roaming/Cats/config/suite-onboarding-history.json',
      latestReference: null,
      events: [
        createDesktopBootstrapEvent({
          layer: 'product',
          kind: 'setup_opened',
          timestamp: '2026-03-31T02:00:00.500Z',
          attemptId: 'attempt-current',
          summary: 'Packaged suite setup was opened.',
          status: 'info',
        }),
        createDesktopBootstrapEvent({
          layer: 'product',
          kind: 'setup_opened',
          timestamp: '2026-03-31T01:59:00.000Z',
          attemptId: 'attempt-old',
          summary: 'Old attempt setup opened.',
          status: 'info',
        }),
      ],
    },
    hostEvents: diagnostics.hostEvents,
    runtimeFallback: {
      status: 'unavailable',
      summary: 'Runtime is unavailable.',
    },
    hostFallback: {
      status: 'unavailable',
      summary: 'Desktop host failed.',
    },
  });

  assert.equal(bundle.attemptId, 'attempt-current');
  assert.equal(bundle.chronology.length, 3);
  assert.deepEqual(
    bundle.chronology.map((event) => event.layer),
    ['host', 'product', 'runtime'],
  );
  assert.equal(bundle.layers.product.summary, 'Packaged suite setup was opened.');
});
