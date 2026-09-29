// Verify actual unpacked installer resources; never inspect the user's profile.
// Called by verify-desktop-app-bundle.mjs before its startup/release receipt gate.
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractFile, uncache } from '@electron/asar';
import { assertCatsLicense, verifyRuntimeBundleNotices } from '../build/desktop/licenses.js';
import { verifyRendererNotices } from '../build/desktop/rendererLicenses.js';
import { verifyDotnetRuntimeNotices } from './shared/dotnet-runtime-notices.mjs';

const WINDOWS_HELPER_DIRECTORY = 'native/windows-stt';
const WINDOWS_HELPER_BINARY = 'cats-stt-windows.exe';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function verifyDesktopLicenses(resourcesRoot) {
  const platform = await readFile(join(resourcesRoot, 'app-sidecar/LICENSE'));
  const runtime = await readFile(join(resourcesRoot, 'cats-runtime/LICENSE'));
  const archive = join(resourcesRoot, 'app.asar');
  uncache(archive);
  const host = extractFile(archive, 'LICENSE');
  assertCatsLicense(platform, 'Platform');
  assertCatsLicense(runtime, 'Runtime');
  assert.deepEqual(host, platform, 'Desktop host and Platform sidecar must ship the same Cats license');
  await verifyRendererNotices(join(resourcesRoot, 'app-sidecar/build/renderer'));
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
  // The Windows voice helper bundles a self-contained .NET runtime; whenever the
  // helper binary ships, its Microsoft license texts must ship beside it.
  const helperDir = join(resourcesRoot, WINDOWS_HELPER_DIRECTORY);
  const nativeWindowsNotices = await exists(join(helperDir, WINDOWS_HELPER_BINARY))
    ? await verifyDotnetRuntimeNotices(helperDir)
    : false;
  return {
    catsLicenses: true,
    rendererNotices: true,
    runtimeBundledNotices: plan.sidecarLayout.runtime === 'bundle',
    nativeWindowsNotices,
  };
}
