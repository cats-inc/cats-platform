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

interface DesktopIpcFrame {
  processId?: unknown;
  routingId?: unknown;
}

/**
 * The main window's top-level frame only, not a frame it embeds
 * (SPEC-145 FR-C4). Frames are compared by process and routing id.
 */
export function isMainWindowMainFrameIpcSender(
  event: unknown,
  mainWindow: Pick<DesktopIpcMainWindow, 'webContents'> | null,
): boolean {
  if (!mainWindow || !isMainWindowIpcSender(event, mainWindow)) {
    return false;
  }
  const frame = (event as { senderFrame?: DesktopIpcFrame | null }).senderFrame;
  const mainFrame = (mainWindow.webContents as { mainFrame?: DesktopIpcFrame | null }).mainFrame;
  return Boolean(
    frame
    && mainFrame
    && typeof frame.routingId === 'number'
    && frame.routingId === mainFrame.routingId
    && frame.processId === mainFrame.processId,
  );
}
