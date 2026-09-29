// Isolated Electron acceptance host. Uses the production App IPC request validator and surface.
const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const { pathToFileURL } = require('node:url');
app.setPath('userData', process.env.CATS_ASK_SMOKE_PROFILE);
const original = { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(), image: clipboard.readImage() };
app.whenReady().then(async () => {
  const { validateDesktopAppRequest } = await import(pathToFileURL(process.env.CATS_ASK_SMOKE_VALIDATOR).href);
  const window = new BrowserWindow({ width: 1280, height: 1100, show: false,
    webPreferences: { preload: process.env.CATS_ASK_SMOKE_PRELOAD, contextIsolation: true,
      nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  ipcMain.handle('cats-host:app-request', async (event, input) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || new URL(event.senderFrame.url).origin !== process.env.CATS_ASK_SMOKE_ORIGIN) throw new Error('Denied');
    const request = validateDesktopAppRequest(input);
    const response = await fetch(`${process.env.CATS_ASK_SMOKE_ORIGIN}${request.path}`, {
      method: request.method, headers: { 'x-cats-desktop-apps': process.env.CATS_ASK_SMOKE_KEY, 'content-type': 'application/json' },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  });
  await window.loadURL(process.env.CATS_ASK_SMOKE_ORIGIN);
});
app.on('before-quit', () => {
  if (clipboard.readText().startsWith('Cats Ask fixture')) clipboard.write(original);
});
app.on('window-all-closed', () => app.quit());
