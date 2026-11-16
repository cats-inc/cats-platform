import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from 'electron';

import { normalizeDesktopTrayLocale, type DesktopTrayLocale } from './trayMenu.js';

/**
 * ADR-155 on the Desktop host: while any Runtime session holds a standing grant, a topmost notice
 * that takes no focus says that a cat may act without asking. That notice, the tray and a global
 * hotkey all offer Stop.
 *
 * The host reads grants from Runtime directly, so Stop stays in reach while Platform is down. It
 * also covers sessions Platform no longer references. A failed read keeps what was known, marked
 * unconfirmed, and never clears the notice.
 */

export interface StandingGrantHolder { sessionId: string; categories: string[] }
export interface StandingGrantsState { holders: StandingGrantHolder[]; unconfirmed: boolean }

export const STANDING_GRANTS_STOP_ACCELERATOR = 'CommandOrControl+Alt+Shift+D';
export const STANDING_GRANTS_STOP_LABEL = 'Ctrl+Alt+Shift+D';
const RUNTIME_GRANTS_PATH = '/interactions/grants';
const PLATFORM_CANCEL_PATH = '/api/internal/provider-grants/host-cancel';
const AUTH_HEADER = 'x-cats-desktop-auth-key';
const STOP_URL = 'cats-stop:';
const NOTICE_WIDTH = 360;
const NOTICE_HEIGHT = 52;
const NOTICE_MARGIN = 16;
const GRANT_CATEGORIES = new Set(['computer_use', 'command', 'file']);

function parseHolders(body: unknown): StandingGrantHolder[] {
  const rows = (body as { sessions?: unknown } | null)?.sessions;
  if (!Array.isArray(rows)) throw new Error('Runtime grants answer is malformed.');
  return rows.flatMap((row) => {
    const sessionId = typeof row?.sessionId === 'string' ? row.sessionId.slice(0, 200) : '';
    const grants: unknown[] = Array.isArray(row?.standingGrants) ? row.standingGrants : [];
    const categories = [...new Set(grants.flatMap((grant) => {
      const category = (grant as { category?: unknown } | null)?.category;
      return typeof category === 'string' && GRANT_CATEGORIES.has(category) ? [category] : [];
    }))];
    return sessionId && categories.length ? [{ sessionId, categories }] : [];
  });
}

/** Polls Runtime for every session holding a grant, and runs Stop for all of them. */
export function createStandingGrantsWatcher(options: {
  runtimeBaseUrl: string;
  /** Runtime's key, only when the environment sets one. */
  runtimeKey?: string;
  platformBaseUrl: string;
  desktopKey: string;
  onChange(state: StandingGrantsState): void;
  intervalMs?: number;
  fetch?: typeof fetch;
}) {
  const fetchImpl = options.fetch ?? fetch;
  let state: StandingGrantsState = { holders: [], unconfirmed: false };
  let last = JSON.stringify(state);
  let timer: NodeJS.Timeout | null = null;
  let polling = false;

  const publish = (next: StandingGrantsState) => {
    const serialized = JSON.stringify(next);
    state = next;
    if (serialized === last) return;
    last = serialized;
    options.onChange(next);
  };
  const runtime = (path: string, method: 'GET' | 'POST' | 'DELETE') => fetchImpl(new URL(path, options.runtimeBaseUrl), {
    method, redirect: 'error', signal: AbortSignal.timeout(3_000), cache: 'no-store',
    headers: options.runtimeKey ? { authorization: `Bearer ${options.runtimeKey}` } : {},
  });

  async function poll(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      const response = await runtime(RUNTIME_GRANTS_PATH, 'GET');
      if (!response.ok) throw new Error(`Runtime grants answered ${response.status}`);
      publish({ holders: parseHolders(await response.json()), unconfirmed: false });
    } catch {
      // Unknown is not "none": keep what was shown, and say it is unconfirmed.
      publish({ holders: state.holders, unconfirmed: state.holders.length > 0 });
    } finally {
      polling = false;
    }
  }

  /**
   * Revokes every held grant in Runtime and cancels the running turns at the same time. Platform
   * cancels its conversations' turns so they end as stopped. If Platform does not answer, Runtime
   * cancels the sessions instead. Returns whether Runtime confirmed every revoke; 404 counts.
   */
  async function stop(): Promise<boolean> {
    const sessionIds = state.holders.map((holder) => holder.sessionId);
    if (!sessionIds.length) { await poll(); return !state.unconfirmed; }
    const revoke = Promise.all(sessionIds.map(async (id) => {
      try {
        const response = await runtime(`/sessions/${encodeURIComponent(id)}/interactions/grants`, 'DELETE');
        if (response.status === 404) return true;
        if (!response.ok) return false;
        const body = await response.json() as { standingGrants?: unknown[] };
        return !body.standingGrants?.length;
      } catch { return false; }
    }));
    const cancel = (async () => {
      try {
        const response = await fetchImpl(new URL(PLATFORM_CANCEL_PATH, options.platformBaseUrl), {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3_000),
          headers: { [AUTH_HEADER]: options.desktopKey, 'content-type': 'application/json' },
          body: JSON.stringify({ sessionIds }),
        });
        if (!response.ok) throw new Error(`Platform answered ${response.status}`);
      } catch {
        await Promise.allSettled(sessionIds.map((id) => runtime(`/sessions/${encodeURIComponent(id)}/cancel`, 'POST')));
      }
    })();
    const [confirmed] = await Promise.all([revoke, cancel]);
    await poll();
    return confirmed.every(Boolean) && !state.unconfirmed;
  }

  return {
    poll,
    stop,
    current: () => state,
    start() {
      if (timer) return;
      timer = setInterval(() => { void poll(); }, options.intervalMs ?? 1_500);
      timer.unref();
      void poll();
    },
    dispose() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, (char) => `&#${char.charCodeAt(0)};`);

export function standingGrantsNoticeText(state: StandingGrantsState, options: { hotkey: boolean; stopFailed?: boolean },
  localeInput?: string | null) {
  const locale: DesktopTrayLocale = normalizeDesktopTrayLocale(localeInput);
  const zh = locale === 'zh-TW';
  const hotkey = options.hotkey ? STANDING_GRANTS_STOP_LABEL : null;
  const message = options.stopFailed
    ? (zh ? '停止沒有得到確認，授權可能仍然有效' : 'Stop was not confirmed; grants may still be in force')
    : state.unconfirmed
      ? (zh ? '無法確認授權狀態，可能仍有免詢問的動作' : 'Cannot confirm grants; a cat may still act without asking')
      : (zh ? '有 Cat 可以不詢問就動作' : 'A cat may act without asking');
  return {
    message,
    stop: hotkey ? (zh ? `停止（${hotkey}）` : `Stop (${hotkey})`) : (zh ? '停止' : 'Stop'),
    trayStop: zh ? `停止免詢問的動作${hotkey ? `（${hotkey}）` : ''}` : `Stop actions allowed without asking${hotkey ? ` (${hotkey})` : ''}`,
    tooltip: zh ? 'Cats — 有免詢問的動作' : 'Cats — actions allowed without asking',
  };
}

/** Static markup with no script: the only interaction is the Stop link the host intercepts. */
export function buildStandingGrantsNoticeHtml(state: StandingGrantsState, options: { hotkey: boolean; stopFailed?: boolean },
  localeInput?: string | null): string {
  const text = standingGrantsNoticeText(state, options, localeInput);
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'
    + '<style>html,body{margin:0;height:100%;overflow:hidden}body{display:flex;align-items:center;gap:12px;'
    + 'padding:0 14px;box-sizing:border-box;background:#8a4b00;color:#fff;font:600 13px/1.3 "Segoe UI",system-ui,sans-serif;'
    + 'border:1px solid #5c3200;user-select:none}span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + 'a{color:#8a4b00;background:#fff;border-radius:4px;padding:5px 12px;text-decoration:none;white-space:nowrap}</style></head>'
    + `<body><span>${escapeHtml(text.message)}</span><a href="${STOP_URL}">${escapeHtml(text.stop)}</a></body></html>`;
}

/** Above SPEC-133's desktop-control notice, so both can show at once. */
export function standingGrantsNoticeBounds(workArea: Rectangle): Rectangle {
  return {
    x: workArea.x + workArea.width - NOTICE_WIDTH - NOTICE_MARGIN,
    y: workArea.y + workArea.height - 2 * (NOTICE_HEIGHT + NOTICE_MARGIN),
    width: NOTICE_WIDTH,
    height: NOTICE_HEIGHT,
  };
}

export function createStandingGrantsNotice(options: {
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
      ...standingGrantsNoticeBounds(options.workArea()),
      show: false, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true, hasShadow: true,
      title: 'Cats standing grants',
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
    update(state: StandingGrantsState, notice: { hotkey: boolean; stopFailed?: boolean }) {
      if (!state.holders.length && !notice.stopFailed) {
        if (window && !window.isDestroyed()) window.hide();
        shown = '';
        return;
      }
      const html = buildStandingGrantsNoticeHtml(state, notice, options.locale());
      const target = ensureWindow();
      target.setBounds(standingGrantsNoticeBounds(options.workArea()));
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
