import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  WINDOWS_APP_EXECUTABLE,
  WINDOWS_VOICE_HELPER,
  readPeArchitecture,
  verifyWindowsVoiceHelperArch,
} from '../scripts/shared/windows-voice-helper-arch.mjs';

const MACHINES = { x64: 0x8664, arm64: 0xaa64 };

// The smallest file readPeArchitecture accepts: a DOS header pointing at a COFF
// header that records the machine.
function peImage(arch) {
  const image = Buffer.alloc(0x86);
  image.write('MZ', 0, 'latin1');
  image.writeUInt32LE(0x80, 0x3c);
  image.write('PE\0\0', 0x80, 'latin1');
  image.writeUInt16LE(MACHINES[arch], 0x84);
  return image;
}

async function unpackedWindowsApp(t, { app, helper }) {
  const root = await mkdtemp(join(tmpdir(), 'cats-win-helper-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resources = join(root, 'resources');
  await mkdir(join(resources, 'native', 'windows-stt'), { recursive: true });
  await writeFile(join(root, WINDOWS_APP_EXECUTABLE), peImage(app));
  if (helper) {
    await writeFile(join(resources, WINDOWS_VOICE_HELPER), peImage(helper));
  }
  return resources;
}

test('PE machine fields map to the shipped Windows architectures', async (t) => {
  const resources = await unpackedWindowsApp(t, { app: 'arm64', helper: 'x64' });
  assert.equal(await readPeArchitecture(join(resources, '..', WINDOWS_APP_EXECUTABLE)), 'arm64');
  assert.equal(await readPeArchitecture(join(resources, WINDOWS_VOICE_HELPER)), 'x64');
  await writeFile(join(resources, 'not-pe.exe'), 'not a PE file');
  await assert.rejects(readPeArchitecture(join(resources, 'not-pe.exe')), /not a PE executable/u);
});

test('each Windows architecture ships the helper built for it', async (t) => {
  for (const arch of ['x64', 'arm64']) {
    const resources = await unpackedWindowsApp(t, { app: arch, helper: arch });
    assert.deepEqual(await verifyWindowsVoiceHelperArch(resources), { arch });
  }
});

test('an arm64 app carrying the x64 helper fails verification', async (t) => {
  // The x64 helper would still start on Windows on Arm under emulation, so
  // nothing else notices.
  const resources = await unpackedWindowsApp(t, { app: 'arm64', helper: 'x64' });
  await assert.rejects(verifyWindowsVoiceHelperArch(resources),
    /Windows voice helper is x64 but the app is arm64/u);
});

test('a Windows app without its helper fails verification', async (t) => {
  // electron-builder only warns when an extraResources ${arch} source is missing.
  const resources = await unpackedWindowsApp(t, { app: 'x64', helper: null });
  await assert.rejects(verifyWindowsVoiceHelperArch(resources), /lack the voice helper/u);
});

test('non-Windows resources are not checked', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cats-mac-helper-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'Resources'));
  assert.equal(await verifyWindowsVoiceHelperArch(join(root, 'Resources')), null);
});
