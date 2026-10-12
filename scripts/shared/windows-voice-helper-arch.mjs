// Windows installers carry native/windows-stt from build/native-windows/${arch}.
// electron-builder only warns when an extraResources source is missing, and an
// x64 helper still starts on Windows on Arm under emulation, so neither mistake
// fails a build. Compare the helper's PE machine with the app executable beside
// the unpacked resources instead.
import assert from 'node:assert/strict';
import { access, open } from 'node:fs/promises';
import { join } from 'node:path';

export const WINDOWS_APP_EXECUTABLE = 'Cats.exe';
export const WINDOWS_VOICE_HELPER = 'native/windows-stt/cats-stt-windows.exe';

const PE_MACHINES = { 0x8664: 'x64', 0xaa64: 'arm64', 0x014c: 'ia32' };

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** The architecture recorded in a PE file's COFF header. */
export async function readPeArchitecture(file) {
  const handle = await open(file, 'r');
  try {
    const dos = Buffer.alloc(64);
    await handle.read(dos, 0, dos.length, 0);
    assert.equal(dos.toString('latin1', 0, 2), 'MZ', `${file} is not a PE executable`);
    const header = Buffer.alloc(6);
    await handle.read(header, 0, header.length, dos.readUInt32LE(0x3c));
    assert.equal(header.toString('latin1', 0, 4), 'PE\0\0', `${file} has no PE header`);
    const machine = header.readUInt16LE(4);
    return PE_MACHINES[machine] ?? `0x${machine.toString(16)}`;
  } finally {
    await handle.close();
  }
}

/**
 * Returns null for non-Windows resources. A Windows build must ship the helper
 * built for the same architecture as the app.
 */
export async function verifyWindowsVoiceHelperArch(resourcesRoot) {
  const app = join(resourcesRoot, '..', WINDOWS_APP_EXECUTABLE);
  if (!(await exists(app))) {
    return null;
  }
  const helper = join(resourcesRoot, WINDOWS_VOICE_HELPER);
  assert.ok(await exists(helper), `Windows installer resources lack the voice helper at ${helper}`);
  const [appArch, helperArch] = await Promise.all([
    readPeArchitecture(app),
    readPeArchitecture(helper),
  ]);
  assert.equal(helperArch, appArch,
    `Windows voice helper is ${helperArch} but the app is ${appArch}`);
  return { arch: appArch };
}
