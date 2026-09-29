// Verify actual unpacked installer resources; never inspect the user's profile.
// Called by verify-desktop-app-bundle.mjs before its startup/release receipt gate.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractFile, uncache } from '@electron/asar';
import { assertCatsLicense, verifyRuntimeBundleNotices } from '../build/desktop/licenses.js';

export async function verifyDesktopLicenses(resourcesRoot) {
  const platform = await readFile(join(resourcesRoot, 'app-sidecar/LICENSE'));
  const runtime = await readFile(join(resourcesRoot, 'cats-runtime/LICENSE'));
  const archive = join(resourcesRoot, 'app.asar');
  uncache(archive);
  const host = extractFile(archive, 'LICENSE');
  assertCatsLicense(platform, 'Platform');
  assertCatsLicense(runtime, 'Runtime');
  assert.deepEqual(host, platform, 'Desktop host and Platform sidecar must ship the same Cats license');
  const plan = JSON.parse(await readFile(join(resourcesRoot, 'desktop-package-plan.json'), 'utf8'));
  if (plan.sidecarLayout?.runtime === 'bundle') {
    const directory = join(resourcesRoot, 'cats-runtime/build/runtime');
    verifyRuntimeBundleNotices(
      await readFile(join(directory, 'index.js')),
      await readFile(join(directory, 'THIRD-PARTY-NOTICES.txt')),
      await readFile(join(directory, 'THIRD-PARTY-NOTICES.json')),
    );
  } else {
    assert.equal(plan.sidecarLayout?.runtime, 'split', 'Unknown Runtime license layout');
  }
  return { catsLicenses: true, runtimeBundledNotices: plan.sidecarLayout.runtime === 'bundle' };
}
