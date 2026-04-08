import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
  resolveRuntimeDotClassName,
  resolveRuntimeLobbyDotClassName,
} from '../build/server/shared/runtimeStatusPresentation.js';

describe('resolveRuntimePresentationStatus', () => {
  it('returns unknown when runtime is null', () => {
    assert.equal(resolveRuntimePresentationStatus(null), 'unknown');
  });

  it('returns unknown when runtime is undefined', () => {
    assert.equal(resolveRuntimePresentationStatus(undefined), 'unknown');
  });

  it('returns unknown when reachable is not a boolean', () => {
    assert.equal(resolveRuntimePresentationStatus({ status: 'ok' }), 'unknown');
  });

  it('returns unavailable when not reachable', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: false, status: 'ok' }),
      'unavailable',
    );
  });

  it('returns ready for ok status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'ok' }),
      'ready',
    );
  });

  it('returns ready for healthy status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'healthy' }),
      'ready',
    );
  });

  it('returns ready for ready status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'ready' }),
      'ready',
    );
  });

  it('returns degraded for warming status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'warming' }),
      'degraded',
    );
  });

  it('returns degraded for starting status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'starting' }),
      'degraded',
    );
  });

  it('returns degraded for degraded status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'degraded' }),
      'degraded',
    );
  });

  it('returns unavailable for error status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'error' }),
      'unavailable',
    );
  });

  it('returns unavailable for failed status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'failed' }),
      'unavailable',
    );
  });

  it('returns ready for reachable with unrecognised status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'some_new_status' }),
      'ready',
    );
  });

  it('handles case-insensitive status', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'OK' }),
      'ready',
    );
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: 'Degraded' }),
      'degraded',
    );
  });

  it('returns ready when status is null and reachable', () => {
    assert.equal(
      resolveRuntimePresentationStatus({ reachable: true, status: null }),
      'ready',
    );
  });
});

describe('resolveRuntimeTooltip', () => {
  it('returns connected copy for ready', () => {
    assert.equal(resolveRuntimeTooltip('ready'), 'Cats Runtime is connected');
  });

  it('returns starting copy for degraded', () => {
    assert.equal(resolveRuntimeTooltip('degraded'), 'Cats Runtime is starting up');
  });

  it('returns offline copy for unavailable', () => {
    assert.equal(resolveRuntimeTooltip('unavailable'), 'Cats Runtime is offline');
  });

  it('returns checking copy for unknown', () => {
    assert.match(resolveRuntimeTooltip('unknown'), /Checking/);
  });
});

describe('resolveRuntimeDotClassName', () => {
  it('maps ready to isConnected', () => {
    assert.match(resolveRuntimeDotClassName('ready'), /isConnected/);
  });

  it('maps degraded to isDegraded', () => {
    assert.match(resolveRuntimeDotClassName('degraded'), /isDegraded/);
  });

  it('maps unavailable to isUnavailable', () => {
    assert.match(resolveRuntimeDotClassName('unavailable'), /isUnavailable/);
  });

  it('maps unknown to isUnknown', () => {
    assert.match(resolveRuntimeDotClassName('unknown'), /isUnknown/);
  });
});

describe('resolveRuntimeLobbyDotClassName', () => {
  it('maps ready to ok', () => {
    assert.match(resolveRuntimeLobbyDotClassName('ready'), /--ok/);
  });

  it('maps degraded to warn', () => {
    assert.match(resolveRuntimeLobbyDotClassName('degraded'), /--warn/);
  });

  it('maps unavailable to warn', () => {
    assert.match(resolveRuntimeLobbyDotClassName('unavailable'), /--warn/);
  });

  it('maps unknown to warn', () => {
    assert.match(resolveRuntimeLobbyDotClassName('unknown'), /--warn/);
  });
});
