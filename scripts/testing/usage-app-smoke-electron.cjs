// Isolated Electron fixture: no Desktop supervisor, user profile, or live services.
const { app, BrowserWindow } = require('electron');
app.setPath('userData', process.env.CATS_USAGE_SMOKE_PROFILE_DIR);
app.whenReady().then(async () => {
  globalThis.testWindow = new BrowserWindow({ width: 1440, height: 1200, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  await globalThis.testWindow.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
