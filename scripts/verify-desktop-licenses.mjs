// Verify actual unpacked installer resources; never inspect the user's profile.
// Called by verify-desktop-app-bundle.mjs before its startup/release receipt gate.
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractFile, uncache } from '@electron/asar';
import { assertCatsLicense, verifyRuntimeBundleNotices } from '../build/desktop/licenses.js';
import { verifyRendererNotices } from '../build/desktop/rendererLicenses.js';
import { verifyDotnetRuntimeNotices } from './shared/dotnet-runtime-notices.mjs';

const WINDOWS_HELPERS = [
  { directory: 'native/windows-stt', binary: 'cats-stt-windows.exe' },
  { directory: 'native/windows-desktop-control', binary: 'cats-desktop-control-windows.exe' },
];

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
  // Each Windows helper bundles a self-contained .NET runtime; whenever a helper
  // binary ships, its Microsoft license texts must ship beside it.
  let nativeWindowsNotices = false;
  for (const helper of WINDOWS_HELPERS) {
    const helperDir = join(resourcesRoot, helper.directory);
    if (await exists(join(helperDir, helper.binary))) {
      nativeWindowsNotices = await verifyDotnetRuntimeNotices(helperDir);
    }
  }
  return {
    catsLicenses: true,
    rendererNotices: true,
    runtimeBundledNotices: plan.sidecarLayout.runtime === 'bundle',
    nativeWindowsNotices,
  };
}
