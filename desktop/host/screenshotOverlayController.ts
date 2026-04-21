import type {
  DesktopScreenshotOverlayWindowPlan,
} from './screenshotOverlayWindows.js';

export interface DesktopScreenshotOverlayWindowHandle {
  loadURL(url: string): Promise<void>;
  setAlwaysOnTop(enabled: true, level: 'screen-saver'): void;
  close(): void;
  isDestroyed(): boolean;
}

export interface DesktopScreenshotOverlayWindowFactory {
  createWindow(
    options: DesktopScreenshotOverlayWindowPlan['options'],
  ): DesktopScreenshotOverlayWindowHandle;
}

export interface DesktopScreenshotOverlayWindowsController {
  closeAll(): void;
}

export async function openScreenshotOverlayWindows(
  plans: DesktopScreenshotOverlayWindowPlan[],
  factory: DesktopScreenshotOverlayWindowFactory,
): Promise<DesktopScreenshotOverlayWindowsController> {
  const windows: DesktopScreenshotOverlayWindowHandle[] = [];

  try {
    for (const plan of plans) {
      const window = factory.createWindow(plan.options);
      windows.push(window);
      window.setAlwaysOnTop(plan.alwaysOnTop.enabled, plan.alwaysOnTop.level);
      await window.loadURL(plan.url);
    }
  } catch (error) {
    closeScreenshotOverlayWindows(windows);
    throw error;
  }

  return {
    closeAll() {
      closeScreenshotOverlayWindows(windows);
    },
  };
}

function closeScreenshotOverlayWindows(
  windows: DesktopScreenshotOverlayWindowHandle[],
): void {
  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.close();
    }
  }
}
