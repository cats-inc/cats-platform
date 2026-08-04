export interface DesktopIpcMainWindow {
  webContents: unknown;
}

export function isMainWindowIpcSender(
  event: unknown,
  mainWindow: Pick<DesktopIpcMainWindow, 'webContents'> | null,
): boolean {
  return Boolean(
    mainWindow
    && (event as { sender?: unknown }).sender === mainWindow.webContents,
  );
}

export function assertMainWindowIpcSender<TWindow extends DesktopIpcMainWindow>(
  event: unknown,
  mainWindow: TWindow | null,
  errorMessage: string,
): asserts mainWindow is TWindow {
  if (!isMainWindowIpcSender(event, mainWindow)) {
    throw new Error(errorMessage);
  }
}
