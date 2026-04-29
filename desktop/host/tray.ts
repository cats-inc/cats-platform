import path from 'node:path';
import { app, Menu, Tray, nativeImage } from 'electron';

import type {
  BrowserWindow,
  Menu as ElectronMenu,
  MenuItemConstructorOptions,
} from 'electron';
import type { DesktopBootstrapPhase, DesktopHostActionId } from './contracts.js';
import { resolveDesktopTrayInteractionPolicy } from './trayInteractionPolicy.js';
import { createGuardedTrayLifecycle } from './trayLifecycle.js';
import type { DesktopTrayMenuState } from './trayMenu.js';

export interface DesktopTrayController {
  showWindow(): void;
  hideWindowToTray(): void;
  updateMenu(state: DesktopTrayMenuState): void;
  dispose(): void;
}

interface CreateDesktopTrayControllerOptions {
  getWindow: () => BrowserWindow | null;
  onShowWindow: () => Promise<void>;
  onNavigate: (path: string) => Promise<void>;
  onRunAction: (actionId: DesktopHostActionId) => Promise<void>;
  onQuit: () => void;
  canInteract?: () => boolean;
}

function createBundledTrayImage(name: string): Electron.NativeImage | null {
  try {
    const iconPath = path.join(app.getAppPath(), 'assets', name);
    const bundled = nativeImage.createFromPath(iconPath);
    if (!bundled.isEmpty()) {
      return bundled;
    }
  } catch {
    // Fall through to alternate tray icon sources.
  }
  return null;
}

function buildStatusLabel(phase: DesktopBootstrapPhase, summary: string): string {
  if (phase === 'starting_services') {
    return 'Starting Cats services...';
  }
  if (phase === 'checking_prerequisites') {
    return 'Checking Cats readiness...';
  }
  return summary;
}

async function createTrayIcon(): Promise<Electron.NativeImage> {
  if (process.platform === 'darwin') {
    const template = createBundledTrayImage('tray-iconTemplate.png');
    if (template) {
      template.setTemplateImage(true);
      return template;
    }
  }

  const bundled = createBundledTrayImage('tray-icon.png');
  if (bundled) {
    if (process.platform === 'linux') {
      return bundled.resize({ width: 22, height: 22 });
    }
    return bundled;
  }

  try {
    const icon = await app.getFileIcon(app.getPath('exe'), { size: 'normal' });
    if (!icon.isEmpty()) {
      return icon;
    }
  } catch {
    // Fall through to empty image — Electron will use its default.
  }
  return nativeImage.createEmpty();
}

function runTrayAction(action: () => Promise<void>): void {
  void action().catch((error) => {
    process.stderr.write(
      `Desktop tray action failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  });
}

export function runDesktopTrayShowWindow(onShowWindow: () => Promise<void>): void {
  runTrayAction(onShowWindow);
}

function buildDesktopTrayMenuTemplate(
  state: DesktopTrayMenuState,
  options: Pick<
    CreateDesktopTrayControllerOptions,
    'onNavigate' | 'onRunAction' | 'onQuit' | 'canInteract'
  >,
  showWindow: () => void,
): MenuItemConstructorOptions[] {
  if (state.lockedLabel) {
    return [{
      label: state.lockedLabel,
      enabled: false,
    }];
  }

  const template: MenuItemConstructorOptions[] = [];
  const pushSeparator = () => {
    if (template.length > 0 && template.at(-1)?.type !== 'separator') {
      template.push({ type: 'separator' });
    }
  };

  for (const action of state.actions) {
    template.push({
      label: action.label,
      click: () => {
        runTrayAction(async () => {
          if (options.canInteract?.() === false) {
            return;
          }
          await options.onRunAction(action.id);
          showWindow();
        });
      },
    });
  }

  if (state.products.length > 0) {
    pushSeparator();
    for (const product of state.products) {
      template.push({
        label: product.label,
        click: () => {
          runTrayAction(async () => {
            if (options.canInteract?.() === false) {
              return;
            }
            await options.onNavigate(product.path);
            showWindow();
          });
        },
      });
    }
  }

  if (state.setupCompleteAt) {
    pushSeparator();
    template.push({
      label: 'Settings',
      click: () => {
        runTrayAction(async () => {
          if (options.canInteract?.() === false) {
            return;
          }
          await options.onNavigate('/settings');
          showWindow();
        });
      },
    });
  }

  if (template.length === 0) {
    template.push({
      label: buildStatusLabel(state.phase, state.summary),
      enabled: false,
    });
  }

  pushSeparator();
  template.push({
    label: 'Quit',
    click: () => {
      if (options.canInteract?.() === false) {
        return;
      }
      options.onQuit();
    },
  });

  return template;
}

export async function createDesktopTrayController(
  options: CreateDesktopTrayControllerOptions,
): Promise<DesktopTrayController> {
  const icon = await createTrayIcon();
  const tray = new Tray(icon);
  tray.setToolTip('Cats');

  const canInteract = () => options.canInteract?.() !== false;
  const showWindow = () => {
    if (!canInteract()) {
      return;
    }
    runDesktopTrayShowWindow(options.onShowWindow);
  };

  const interactionPolicy = resolveDesktopTrayInteractionPolicy();
  let currentMenu: ElectronMenu | null = null;

  const trayLifecycle = createGuardedTrayLifecycle<DesktopTrayMenuState>({
    apply(state) {
      tray.setToolTip(state.lockedLabel ?? 'Cats');
      currentMenu = Menu.buildFromTemplate(
        buildDesktopTrayMenuTemplate(state, options, showWindow),
      );
      if (interactionPolicy.contextMenuBinding === 'native-context-menu') {
        tray.setContextMenu(currentMenu);
      }
    },
    destroy() {
      currentMenu = null;
      tray.destroy();
    },
  });

  const updateMenu = (state: DesktopTrayMenuState) => {
    trayLifecycle.update(state);
  };

  updateMenu({
    phase: 'starting_services',
    summary: 'Starting Cats services.',
    setupCompleteAt: null,
    actions: [],
    products: [],
  });

  tray.on('click', () => {
    showWindow();
  });

  tray.on('double-click', () => {
    showWindow();
  });

  if (interactionPolicy.contextMenuBinding === 'manual-right-click-popup') {
    tray.on('right-click', () => {
      if (currentMenu) {
        tray.popUpContextMenu(currentMenu);
      }
    });
  }

  return {
    showWindow,
    hideWindowToTray() {
      const window = options.getWindow();
      if (!window) {
        return;
      }
      window.hide();
    },
    updateMenu,
    dispose() {
      trayLifecycle.dispose();
    },
  };
}
