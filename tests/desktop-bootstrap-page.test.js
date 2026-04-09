import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopBootstrapPage } from '../build/desktop/bootstrapPage.js';

test('desktop bootstrap page renders summary-first recovery with collapsed details', () => {
  const html = buildDesktopBootstrapPage();

  // Core structure
  assert.match(html, /id="app"/);
  assert.match(html, /class="app[\s"]/);
  assert.match(html, /class="hero/);

  // Recovery summary card with 3-slot action row
  assert.match(html, /recovery-summary/);
  assert.match(html, /recovery-title/);
  assert.match(html, /recovery-desc/);
  assert.match(html, /recovery-actions/);
  assert.match(html, /RecoverySummaryCard/);

  // Human-friendly copy per state
  assert.match(html, /couldn\u2019t start/);
  assert.match(html, /Something needs attention/);
  assert.match(html, /Ready for setup/);

  // Back button to leave detail mode
  assert.match(html, /recovery-back/);

  // Expandable detail sections (collapsed by default)
  assert.match(html, /expand-trigger/);
  assert.match(html, /expand-body/);
  assert.match(html, /ExpandableSection/);
  assert.match(html, /Why am I seeing this\?/);
  assert.match(html, /Service status/);
  assert.match(html, /Diagnostics/);
  assert.match(html, /Logs and paths/);
  assert.match(html, /Setup recovery/);

  // Service status section preserved
  assert.match(html, /getServiceDisplayName/);
  assert.match(html, /svc-row/);
  assert.match(html, /svc-status/);

  // Runtime diagnostics link moved into service status section
  assert.match(html, /open_runtime_diagnostics/);

  // Setup recovery section
  assert.match(html, /SetupRecoverySection/);
  assert.match(html, /getSetupSnapshot/);
  assert.match(html, /resumeSetup/);
  assert.match(html, /snap\.setup/);
  assert.match(html, /Recommended next step/);
  assert.match(html, /renderInterruptions/);

  // Diagnostics section preserved
  assert.match(html, /snap\.diagnostics/);
  assert.match(html, /Recent events/);
  assert.match(html, /hostStatePath/);

  // Slow-launch hint (progressive 20/40/60 s)
  assert.match(html, /slow-hint/);
  assert.match(html, /slowHintMessages/);
  assert.match(html, /retryHintMessage/);
  assert.match(html, /runRetryAction/);
  assert.match(html, /showRetryLoadingState/);
  assert.match(html, /scheduleSlowHint/);
  assert.match(html, /slowHintStep = 0;/);

  // Bridge integration & lifecycle
  assert.match(html, /snapshotListenerBound/);
  assert.match(html, /scheduleInitialSnapshotRetry/);
  assert.match(html, /bridge\.getSnapshot\(\)/);
  assert.match(html, /function applySnapshot\(snapshot\)/);
  assert.match(html, /currentSnapshot = snapshot;/);
  assert.match(html, /getSetupSnapshotOrNull\(\)\s*\n\s*\.then/);
  assert.match(html, /window\.setTimeout/);

  // Page mode handling
  assert.match(html, /resolvePageMode/);

  // CSS overflow / layout safety
  assert.match(html, /overflow-x: hidden/);
  assert.match(html, /word-break: break-all/);
  assert.match(html, /white-space: pre-wrap/);

  // Animations
  assert.match(html, /fadeSlideIn/);
  assert.match(html, /dot-pulse/);
  assert.match(html, /@keyframes pulse/);
});
