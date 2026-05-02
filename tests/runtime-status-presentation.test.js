import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  needsRuntimeSetupRecovery,
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
  resolveRuntimeDotClassName,
  resolveRuntimeLobbyDotClassName,
  resolveRuntimeRecoveryTarget,
  resolveRuntimeRecoveryUrl,
} from '../build/server/shared/runtimeStatusPresentation.js';
import { createTranslator } from '../build/server/shared/i18n/index.js';

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

  it('localizes copy when a translator is provided', () => {
    const zh = createTranslator('zh-TW');

    assert.equal(resolveRuntimeTooltip('ready', zh), 'Cats Runtime 已連線');
    assert.equal(resolveRuntimeTooltip('degraded', zh), 'Cats Runtime 正在啟動');
    assert.equal(resolveRuntimeTooltip('unavailable', zh), 'Cats Runtime 離線');
    assert.equal(resolveRuntimeTooltip('unknown', zh), '正在檢查 Cats Runtime 狀態…');
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

describe('resolveRuntimeRecoveryTarget', () => {
  it('returns runtime-setup when runtime setup needs attention', () => {
    assert.equal(
      resolveRuntimeRecoveryTarget('ready', { runtimeSetupStatus: 'attention_required' }),
      'runtime-setup',
    );
  });

  it('returns runtime-setup when runtime setup is ready to apply', () => {
    assert.equal(
      resolveRuntimeRecoveryTarget('ready', { runtimeSetupStatus: 'ready_to_apply' }),
      'runtime-setup',
    );
  });

  it('returns runtime-setup for unavailable', () => {
    assert.equal(resolveRuntimeRecoveryTarget('unavailable'), 'runtime-setup');
  });

  it('returns runtime-setup for degraded', () => {
    assert.equal(resolveRuntimeRecoveryTarget('degraded'), 'runtime-setup');
  });

  it('returns runtime-root for ready', () => {
    assert.equal(resolveRuntimeRecoveryTarget('ready'), 'runtime-root');
  });

  it('returns runtime-root for unknown', () => {
    assert.equal(resolveRuntimeRecoveryTarget('unknown'), 'runtime-root');
  });

  it('returns desktop-setup when desktopSetupRelevant is true', () => {
    assert.equal(
      resolveRuntimeRecoveryTarget('ready', { desktopSetupRelevant: true }),
      'desktop-setup',
    );
  });

  it('returns desktop-setup over runtime-setup when desktop is relevant', () => {
    assert.equal(
      resolveRuntimeRecoveryTarget('unavailable', { desktopSetupRelevant: true }),
      'desktop-setup',
    );
  });

  it('ignores desktopSetupRelevant when false', () => {
    assert.equal(
      resolveRuntimeRecoveryTarget('unavailable', { desktopSetupRelevant: false }),
      'runtime-setup',
    );
  });
});

describe('resolveRuntimeRecoveryUrl', () => {
  it('throws for desktop-setup because it is not a runtime URL target', () => {
    assert.throws(
      () => resolveRuntimeRecoveryUrl('desktop-setup'),
      /Desktop setup targets/i,
    );
  });

  it('returns platform runtime root path for runtime-root target', () => {
    assert.equal(
      resolveRuntimeRecoveryUrl('runtime-root'),
      '/runtime',
    );
  });

  it('returns platform setup path for runtime-setup target', () => {
    assert.equal(
      resolveRuntimeRecoveryUrl('runtime-setup'),
      '/runtime/setup',
    );
  });
});

describe('needsRuntimeSetupRecovery', () => {
  it('returns true for runtime setup states that need remediation', () => {
    assert.equal(needsRuntimeSetupRecovery('ready_to_apply'), true);
    assert.equal(needsRuntimeSetupRecovery('scan_required'), true);
    assert.equal(needsRuntimeSetupRecovery('attention_required'), true);
    assert.equal(needsRuntimeSetupRecovery('unavailable'), true);
  });

  it('returns false when runtime setup is ready or absent', () => {
    assert.equal(needsRuntimeSetupRecovery('ready'), false);
    assert.equal(needsRuntimeSetupRecovery(null), false);
    assert.equal(needsRuntimeSetupRecovery(undefined), false);
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
