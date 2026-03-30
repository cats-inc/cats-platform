import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopBootstrapPage } from '../dist-electron/bootstrapPage.js';

test('desktop bootstrap page surfaces setup recovery details from the host bridge', () => {
  const html = buildDesktopBootstrapPage();

  assert.match(html, /Setup Recovery/);
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
  assert.match(html, /Optional capability-pack follow-through/);
  assert.match(html, /interruption-chip/);
  assert.match(html, /renderInterruptions/);
  assert.match(html, /repo-owned packaged assets/);
});
