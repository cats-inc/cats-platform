declare namespace Electron {
  interface IpcRendererEvent {}
  interface Event {
    preventDefault(): void;
  }
}

declare global {
  namespace NodeJS {
    interface Process {
      resourcesPath?: string;
    }
  }
}

declare module 'electron' {
  export interface BrowserWindowConstructorOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    show?: boolean;
    title?: string;
    backgroundColor?: string;
    webPreferences?: {
      preload?: string;
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
      sandbox?: boolean;
    };
  }

  export interface WebContents {
    getURL(): string;
    send(channel: string, ...args: unknown[]): void;
    on(event: string, listener: (...args: any[]) => void): this;
    setWindowOpenHandler(
      handler: (details: { url: string }) => { action: 'allow' | 'deny' },
    ): void;
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions);
    webContents: WebContents;
    loadURL(url: string): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: () => void): this;
    show(): void;
    hide(): void;
    isMinimized(): boolean;
    restore(): void;
    focus(): void;
  }

  export const ipcMain: {
    handle<TArgs extends unknown[] = unknown[], TResult = unknown>(
      channel: string,
      listener: (event: unknown, ...args: TArgs) => TResult | Promise<TResult>,
    ): void;
  };

  export const ipcRenderer: {
    invoke<TResult = unknown>(channel: string, ...args: unknown[]): Promise<TResult>;
    on(
      channel: string,
      listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void,
    ): void;
    off(
      channel: string,
      listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void,
    ): void;
  };

  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };

  export const shell: {
    openExternal(url: string): Promise<void>;
  };

  export const Menu: {
    buildFromTemplate(template: Array<Record<string, unknown>>): unknown;
  };

  export const nativeImage: {
    createFromDataURL(dataUrl: string): unknown;
  };

  export class Tray {
    constructor(image: unknown);
    setToolTip(tooltip: string): void;
    setContextMenu(menu: unknown): void;
    on(event: string, listener: (...args: any[]) => void): this;
    destroy(): void;
  }

  export const app: {
    isPackaged: boolean;
    requestSingleInstanceLock(): boolean;
    whenReady(): Promise<void>;
    getPath(name: string): string;
    setPath(name: string, path: string): void;
    getLoginItemSettings(options?: {
      path?: string;
      args?: string[];
    }): {
      openAtLogin?: boolean;
      wasOpenedAtLogin?: boolean;
      executableWillLaunchAtLogin?: boolean;
    };
    setLoginItemSettings(settings: {
      openAtLogin: boolean;
      name?: string;
      path?: string;
      args?: string[];
    }): void;
    quit(): void;
    exit(exitCode?: number): void;
    on(event: string, listener: (...args: any[]) => void): void;
  };
}
