import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from 'electron';

import { normalizeDesktopTrayLocale, type DesktopTrayLocale } from './trayMenu.js';

/**
 * SPEC-133 DC-11 and DC-12 on the Desktop host: while a conversation holds desktop control,
 * a topmost notice that cannot take focus names the app and offers Stop, and the tray offers
 * Stop too. The host learns the hold state from Platform's key-authenticated internal routes.
 */

export interface DesktopControlHold { channelId: string; app: string }

const HOST_STATE_PATH = '/api/internal/desktop-control/host-state';
const HOST_STOP_PATH = '/api/internal/desktop-control/host-stop';
const AUTH_HEADER = 'x-cats-desktop-auth-key';
const STOP_URL = 'cats-stop:';
const NOTICE_WIDTH = 360;
const NOTICE_HEIGHT = 52;
const NOTICE_MARGIN = 16;

function parseHolding(body: unknown): DesktopControlHold[] {
  const rows = (body as { holding?: unknown } | null)?.holding;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => typeof row?.channelId === 'string' && typeof row?.app === 'string'
    ? [{ channelId: row.channelId, app: row.app.slice(0, 120) }] : []);
}

/** Polls Platform for hold state; two failed polls in a row clear it, since nothing can hold control then. */
export function createDesktopControlHoldWatcher(options: {
  baseUrl: string;
  key: string;
  onChange(holding: DesktopControlHold[]): void;
  intervalMs?: number;
  fetch?: typeof fetch;
}) {
  const fetchImpl = options.fetch ?? fetch;
  let last = '[]';
  let failures = 0;
  let timer: NodeJS.Timeout | null = null;
  let polling = false;

  const publish = (holding: DesktopControlHold[]) => {
    const next = JSON.stringify(holding);
    if (next === last) return;
    last = next;
    options.onChange(holding);
  };
  const request = async (path: string, method: 'GET' | 'POST') => {
    const response = await fetchImpl(new URL(path, options.baseUrl), {
      method, redirect: 'error', signal: AbortSignal.timeout(3_000), headers: { [AUTH_HEADER]: options.key },
    });
    if (!response.ok) throw new Error(`desktop control host route answered ${response.status}`);
    return parseHolding(await response.json());
  };

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      publish(await request(HOST_STATE_PATH, 'GET'));
      failures = 0;
    } catch {
      if (++failures >= 2) publish([]);
    } finally {
      polling = false;
    }
  }

  return {
    poll,
    start() {
      if (timer) return;
      timer = setInterval(() => { void poll(); }, options.intervalMs ?? 1_500);
      timer.unref();
      void poll();
    },
    async stop() {
      publish(await request(HOST_STOP_PATH, 'POST'));
    },
    dispose() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, (char) => `&#${char.charCodeAt(0)};`);

export function desktopControlNoticeText(holding: DesktopControlHold[], localeInput?: string | null) {
  const locale: DesktopTrayLocale = normalizeDesktopTrayLocale(localeInput);
  const apps = [...new Set(holding.map((row) => row.app))].join(', ');
  return locale === 'zh-TW'
    ? { message: `Cats 正在操作 ${apps}`, stop: '停止', trayStop: `停止桌面控制（${apps}）`, tooltip: `Cats — 正在操作 ${apps}` }
    : { message: `Cats is operating ${apps}`, stop: 'Stop', trayStop: `Stop desktop control (${apps})`, tooltip: `Cats — operating ${apps}` };
}

/** Static markup with no script: the only interaction is the Stop link the host intercepts. */
export function buildDesktopControlNoticeHtml(holding: DesktopControlHold[], localeInput?: string | null): string {
  const text = desktopControlNoticeText(holding, localeInput);
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'
    + '<style>html,body{margin:0;height:100%;overflow:hidden}body{display:flex;align-items:center;gap:12px;'
    + 'padding:0 14px;box-sizing:border-box;background:#b3261e;color:#fff;font:600 13px/1.3 "Segoe UI",system-ui,sans-serif;'
    + 'border:1px solid #7a1912;user-select:none}span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + 'a{color:#b3261e;background:#fff;border-radius:4px;padding:5px 12px;text-decoration:none}</style></head>'
    + `<body><span>${escapeHtml(text.message)}</span><a href="${STOP_URL}">${escapeHtml(text.stop)}</a></body></html>`;
}

/** Parked in the bottom-right corner of the work area, away from where apps usually take input. */
export function desktopControlNoticeBounds(workArea: Rectangle): Rectangle {
  return {
    x: workArea.x + workArea.width - NOTICE_WIDTH - NOTICE_MARGIN,
    y: workArea.y + workArea.height - NOTICE_HEIGHT - NOTICE_MARGIN,
    width: NOTICE_WIDTH,
    height: NOTICE_HEIGHT,
  };
}

export function createDesktopControlNotice(options: {
  createWindow(options: BrowserWindowConstructorOptions): BrowserWindow;
  workArea(): Rectangle;
  locale(): string;
  onStop(): void;
}) {
  let window: BrowserWindow | null = null;
  let shown = '';

  function ensureWindow(): BrowserWindow {
    if (window && !window.isDestroyed()) return window;
    const created = options.createWindow({
      ...desktopControlNoticeBounds(options.workArea()),
      show: false, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true, hasShadow: true,
      title: 'Cats desktop control',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, spellcheck: false },
    });
    created.setAlwaysOnTop(true, 'screen-saver');
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    created.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      if (url === STOP_URL) options.onStop();
    });
    created.on('closed', () => { if (window === created) { window = null; shown = ''; } });
    window = created;
    return created;
  }

  return {
    update(holding: DesktopControlHold[]) {
      if (!holding.length) {
        if (window && !window.isDestroyed()) window.hide();
        shown = '';
        return;
      }
      const html = buildDesktopControlNoticeHtml(holding, options.locale());
      const target = ensureWindow();
      target.setBounds(desktopControlNoticeBounds(options.workArea()));
      if (html !== shown) {
        shown = html;
        void target.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      }
      if (!target.isVisible()) target.showInactive();
    },
    dispose() {
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
    },
  };
}
