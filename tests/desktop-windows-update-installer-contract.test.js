import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveProjectPath } from './helpers/projectRoot.js';

/**
 * Guards the Windows installer choices the update path depends on.
 *
 * SPEC-111 sections 4 and 10 treat any change to these as an update-path
 * regression, because each one is load-bearing for a *silent upgrade* rather
 * than for a first install, and none of them is exercised by a normal test run:
 * the failure only shows up on a real machine, after shipping.
 */

function readProjectFile(relativePath) {
  return readFileSync(resolveProjectPath(import.meta.url, relativePath), 'utf8');
}

const buildConfig = JSON.parse(readProjectFile('package.json')).build;
const installerScript = readProjectFile('assets/build/installer.nsh');

test('the Windows package stays an assisted installer', () => {
  // A one-click installer would give the user no visible confirmation that an
  // update is installing, and Settings promises the wizard will open.
  assert.equal(buildConfig.nsis.oneClick, false);
  assert.equal(buildConfig.nsis.allowToChangeInstallationDirectory, true);
});

test('installation stays per-user so an update never asks for elevation', () => {
  // Packaged provider setup helpers refuse to run elevated, and every CLI they
  // install is user-scoped, so an all-users install would put Cats under
  // Program Files while its helpers wrote into the wrong profile.
  assert.equal(buildConfig.nsis.perMachine, false);
  assert.match(installerScript, /!macro\s+customInstallMode/u);
  assert.match(installerScript, /StrCpy\s+\$isForceCurrentInstall\s+"1"/u);
});

test('the uninstaller only removes user data when the user opts in', () => {
  // A Windows upgrade runs the previous uninstaller silently before installing.
  // An unconditional wipe here would reset Electron UI state and Cats runtime
  // state on every update.
  assert.match(installerScript, /!macro\s+customUnInstall/u);
  assert.match(
    installerScript,
    /\$\{If\}\s+\$RemoveUserDataState\s+==\s+\$\{BST_CHECKED\}/u,
  );

  const guarded = /\$\{If\}\s+\$RemoveUserDataState[\s\S]*?\$\{EndIf\}/u.exec(installerScript);
  assert.ok(guarded, 'user-data removal is no longer inside an opt-in guard');
  assert.match(guarded[0], /RMDir \/r "\$APPDATA\\Cats"/u);
  assert.match(guarded[0], /RMDir \/r "\$PROFILE\\\.cats"/u);

  // Neither path may be removed anywhere outside that guard.
  const unguarded = installerScript
    .replace(guarded[0], '')
    .match(/RMDir \/r "\$(APPDATA\\Cats|PROFILE\\\.cats)"/gu);
  assert.equal(unguarded, null);

  // The checkbox has to start unchecked, or a silent upgrade would inherit a
  // pre-ticked "remove all user data".
  assert.match(
    installerScript,
    /\$\{NSD_SetState\}\s+\$RemoveUserDataCheckbox\s+\$\{BST_UNCHECKED\}/u,
  );
});

test('the Windows target stays the x64 NSIS build the release matrix publishes', () => {
  const [target] = buildConfig.win.target;
  assert.equal(target.target, 'nsis');
  assert.deepEqual(target.arch, ['x64']);
});
