import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopBootstrapPage } from '../build/desktop/bootstrapPage.js';

test('desktop bootstrap page surfaces setup recovery details from the host bridge', () => {
  const html = buildDesktopBootstrapPage();

  // Core structure
  assert.match(html, /id="app"/);
  assert.match(html, /class="app[\s"]/);
  assert.match(html, /class="hero/);

  // Services section
  assert.match(html, /getServiceDisplayName/);
  assert.match(html, /svc-row/);
  assert.match(html, /svc-status/);

  // Runtime section
  assert.match(html, /providerSummary/);

  // Setup Recovery section
  assert.match(html, /Setup Recovery/);
  assert.match(html, /setup-summary/);
  assert.match(html, /getSetupSnapshot/);
  assert.match(html, /resumeSetup/);
  assert.match(html, /snap\.setup/);
  assert.match(html, /providerSetup\.localProviders/);
  assert.match(html, /bundledInCurrentInstaller/);
  assert.match(html, /Recommended resume step/);
  assert.match(html, /Capability pack coverage/);
  assert.match(html, /providerSetup\.capabilityPacks/);
  assert.match(html, /Local provider rollout/);
  assert.match(html, /Not bundled in this desktop build/);
  assert.match(html, /isOptionalCapabilityPackSetupAction/);
  assert.match(html, /describeSetupPack/);
  assert.match(html, /renderInterruptions/);
  assert.match(html, /repo-owned packaged assets/);

  // Diagnostics section
  assert.match(html, /Diagnostics/);
  assert.match(html, /snap\.diagnostics/);
  assert.match(html, /Recent chronology/);
  assert.match(html, /DiagSection/);
  assert.match(html, /hostStatePath/);

  // Slow-launch hint (progressive 20/40/60 s)
  assert.match(html, /slow-hint/);
  assert.match(html, /slowHintMessages/);
  assert.match(html, /scheduleSlowHint/);

  // Bridge integration & lifecycle
  assert.match(html, /snapshotListenerBound/);
  assert.match(html, /scheduleInitialSnapshotRetry/);
  assert.match(html, /bridge\.getSnapshot\(\)/);
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
