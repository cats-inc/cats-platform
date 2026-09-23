// Disposable-profile native probe. Invoked by desktop-platform-shell-electron.test.js.
const { app, BrowserWindow, Menu, session } = require('electron');
const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const [profile, baseUrl, readerUrl, trayUrl, resultPath, phase] = process.argv.slice(2);
app.setPath('userData', profile);

app.whenReady().then(async () => {
  if (phase === 'seed') {
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await window.loadURL(`${baseUrl}/sign-in`);
    await session.defaultSession.cookies.flushStore();
    app.quit();
    return;
  }
  const { DesktopPlatformShellReader } = await import(readerUrl);
  const { buildDesktopTrayMenuState } = await import(trayUrl);
  // This is the old host transport: even after a normal authenticated renderer
  // load, Node fetch cannot see Chromium's HttpOnly session cookie.
  const oldResponse = await (await fetch(`${baseUrl}/api/app-shell`)).json();
  assert.equal(oldResponse.products, undefined);
  const reader = new DesktopPlatformShellReader(baseUrl,
    (url, init) => session.defaultSession.fetch(url, init));
  const menuLabels = () => {
    const shell = reader.read();
    const state = buildDesktopTrayMenuState({
      phase: 'ready_for_chat', summary: 'Ready', actions: [],
      setupCompleteAt: shell?.setupCompleteAt ?? null,
      products: shell?.products,
    });
    return Menu.buildFromTemplate(state.products.map((p) => ({ label: p.label })))
      .items.map((item) => item.label);
  };
  await reader.refresh();
  const coldStart = menuLabels();
  assert.deepEqual(coldStart, ['Open Chat', 'Open Work', 'Open Code']);
  await reader.refresh();
  assert.deepEqual(menuLabels(), coldStart);
  await session.defaultSession.cookies.remove(baseUrl, 'cats_session');
  await reader.refresh();
  assert.deepEqual(menuLabels(), []);
  assert.equal(reader.read().setupCompleteAt, '2026-09-24T00:00:00Z');
  await session.defaultSession.fetch(`${baseUrl}/sign-in`, { credentials: 'include' });
  await reader.refresh();
  assert.deepEqual(menuLabels(), coldStart);
  writeFileSync(resultPath, JSON.stringify({
    electron: process.versions.electron, coldStart, refreshed: true,
    signedOut: [], signedInAgain: menuLabels(), oldTransportProductsAbsent: true,
  }));
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
