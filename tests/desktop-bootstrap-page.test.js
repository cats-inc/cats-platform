import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopBootstrapPage } from '../build/desktop/bootstrapPage.js';

test('desktop bootstrap page surfaces setup recovery details from the host bridge', () => {
  const html = buildDesktopBootstrapPage();

  assert.match(html, /Setup Recovery/);
  assert.match(html, /Diagnostics/);
  assert.match(html, /snapshot\.diagnostics/);
  assert.match(html, /Recent chronology/);
  assert.match(html, /renderDiagnostics/);
  assert.match(html, /setup-summary/);
  assert.match(html, /getSetupSnapshot/);
  assert.match(html, /resumeSetup/);
  assert.match(html, /snapshot\.setup/);
  assert.match(html, /providerSetup\.localProviders/);
  assert.match(html, /bundledInCurrentInstaller/);
  assert.match(html, /Recommended resume step/);
  assert.match(html, /Capability pack coverage/);
  assert.match(html, /providerSetup\.capabilityPacks/);
  assert.match(html, /Local provider rollout/);
  assert.match(html, /Not bundled in this desktop build/);
  assert.match(html, /optionalPackLabel/);
  assert.match(html, /interruption-chip/);
  assert.match(html, /renderInterruptions/);
  assert.match(html, /repo-owned packaged assets/);
  assert.match(html, /snapshotListenerBound/);
  assert.match(html, /scheduleInitialSnapshotRetry/);
  assert.match(html, /bridge\.getSnapshot\(\)/);
  assert.match(html, /window\.setTimeout/);
  assert.match(html, /id="host-shell"/);
  assert.match(html, /data-page-mode="loading"/);
  assert.match(html, /data-recovery-only="true"/);
  assert.match(html, /resolvePageMode/);
  assert.match(html, /hostShell\.dataset\.pageMode/);
  assert.match(html, /overflow-x: hidden/);
  assert.match(html, /align-items: start/);
  assert.match(html, /flex-wrap: wrap/);
  assert.match(html, /white-space: pre-wrap/);
  assert.match(html, /overflow-wrap: anywhere/);
  assert.match(html, /min-width: 0/);
  assert.match(html, /main\[data-page-mode="loading"\] \[data-recovery-only="true"\]/);
});

