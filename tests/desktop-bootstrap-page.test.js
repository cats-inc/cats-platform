import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopBootstrapPage } from '../dist-electron/bootstrapPage.js';

test('desktop bootstrap page surfaces setup recovery details from the host bridge', () => {
  const html = buildDesktopBootstrapPage();

  assert.match(html, /Setup Recovery/);
  assert.match(html, /setup-summary/);
  assert.match(html, /getSetupSnapshot/);
  assert.match(html, /snapshot\.setup/);
  assert.match(html, /repo-owned packaged assets/);
});
