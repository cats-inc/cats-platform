import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildLinuxAutostartEntry,
  readDesktopStartupPreferences,
  resolveDesktopStartupLaunchContext,
  syncDesktopStartupPreferences,
  updateDesktopStartupPreferences,
} from '../build/desktop/desktopStartup.js';

test('desktop startup preferences default to sign-in launch enabled and window open disabled', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-desktop-startup-'));
  const appStatePath = path.join(root, 'platform', 'state', 'chat-state.local.json');

  try {
    const prefs = await readDesktopStartupPreferences(appStatePath);
    assert.deepEqual(prefs, {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('desktop startup preferences preserve unrelated fields when updated', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-desktop-startup-'));
  const appStatePath = path.join(root, 'platform', 'state', 'chat-state.local.json');
  const prefsPath = path.join(root, 'platform', 'config', 'platform-preferences.json');

  try {
    await mkdir(path.dirname(prefsPath), { recursive: true });
    await writeFile(prefsPath, JSON.stringify({
      lastProductSurface: 'work',
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    }, null, 2) + '\n', 'utf8');

    await updateDesktopStartupPreferences(appStatePath, {
      startAtLogin: false,
    });

    const saved = JSON.parse(await readFile(prefsPath, 'utf8'));
    assert.equal(saved.lastProductSurface, 'work');
    assert.equal(saved.startAtLogin, false);
    assert.equal(saved.openWindowOnStartup, false);
    assert.equal(saved.systemTrayEnabled, true);

    const updated = await readDesktopStartupPreferences(appStatePath);
    assert.deepEqual(updated, {
      startAtLogin: false,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('desktop startup launch context starts hidden when openWindowOnStartup is disabled and background is available', () => {
  assert.deepEqual(resolveDesktopStartupLaunchContext({
    argv: ['Cats.exe'],
    preferences: {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    },
    background: {
      trayEnabled: true,
      keepServicesRunning: true,
      closeBehavior: 'minimize_to_tray',
    },
  }), {
    launchedAtLogin: false,
    showWindowOnStartup: false,
  });

  assert.deepEqual(resolveDesktopStartupLaunchContext({
    platform: 'win32',
    argv: ['Cats.exe', '--launch-at-login'],
    preferences: {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    },
    background: {
      trayEnabled: true,
      keepServicesRunning: true,
      closeBehavior: 'minimize_to_tray',
    },
  }), {
    launchedAtLogin: true,
    showWindowOnStartup: false,
  });
});

test('desktop startup still shows the main window if the tray background path is unavailable', () => {
  assert.deepEqual(resolveDesktopStartupLaunchContext({
    platform: 'win32',
    argv: ['Cats.exe', '--launch-at-login'],
    preferences: {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    },
    background: {
      trayEnabled: false,
      keepServicesRunning: true,
      closeBehavior: 'minimize_to_tray',
    },
  }), {
    launchedAtLogin: true,
    showWindowOnStartup: true,
  });
});

test('desktop startup still shows the main window if the system tray preference is disabled', () => {
  assert.deepEqual(resolveDesktopStartupLaunchContext({
    platform: 'win32',
    argv: ['Cats.exe', '--launch-at-login'],
    preferences: {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: false,
    },
    background: {
      trayEnabled: true,
      keepServicesRunning: true,
      closeBehavior: 'minimize_to_tray',
    },
  }), {
    launchedAtLogin: true,
    showWindowOnStartup: true,
  });
});

test('desktop startup sync uses login item settings on Windows and writes autostart entries on Linux', async () => {
  const calls = [];
  await syncDesktopStartupPreferences({
    isPackaged: true,
    getPath(name) {
      if (name === 'home') {
        return path.join(tmpdir(), 'cats-linux-home');
      }
      return '';
    },
    setLoginItemSettings(settings) {
      calls.push(settings);
    },
  }, {
    startAtLogin: true,
    openWindowOnStartup: false,
    systemTrayEnabled: true,
  }, {
    platform: 'win32',
    executablePath: 'C:/Program Files/Cats/Cats.exe',
  });

  assert.deepEqual(calls, [{
    openAtLogin: true,
    path: 'C:/Program Files/Cats/Cats.exe',
    args: ['--launch-at-login'],
  }]);

  const linuxHome = await mkdtemp(path.join(tmpdir(), 'cats-linux-home-'));
  try {
    await syncDesktopStartupPreferences({
      isPackaged: true,
      getPath(name) {
        if (name === 'home') {
          return linuxHome;
        }
        return '';
      },
    }, {
      startAtLogin: true,
      openWindowOnStartup: false,
      systemTrayEnabled: true,
    }, {
      platform: 'linux',
      executablePath: '/opt/Cats/cats',
      homeDir: linuxHome,
    });

    const autostartPath = path.join(linuxHome, '.config', 'autostart', 'cats.desktop');
    const desktopEntry = await readFile(autostartPath, 'utf8');
    assert.match(desktopEntry, /\[Desktop Entry\]/u);
    assert.match(desktopEntry, /Exec="\/opt\/Cats\/cats" --launch-at-login/u);
  } finally {
    await rm(linuxHome, { recursive: true, force: true });
  }
});

test('buildLinuxAutostartEntry quotes the executable path', () => {
  assert.match(
    buildLinuxAutostartEntry('/opt/Cats Desktop/cats'),
    /Exec="\/opt\/Cats Desktop\/cats" --launch-at-login/u,
  );
});
