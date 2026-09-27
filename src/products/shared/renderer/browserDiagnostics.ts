import { diagnosticText } from '../diagnosticReport.js';

interface BrowserErrorEntry {
  at: string;
  channelId: string;
  view: string;
  kind: 'error' | 'unhandledrejection';
  message: string | null;
  stack: string | null;
}

interface BrowserErrorStore {
  startedAt: string;
  entries: BrowserErrorEntry[];
  stop: () => void;
}

// Window-local, memory-only evidence; nothing is uploaded until the owner sends
// a diagnostic attachment. A reload discards the buffer.
const stores = new WeakMap<Window, BrowserErrorStore>();

function errorText(value: unknown, limit = 1200): string | null {
  // Source URLs in stacks can contain query credentials unrelated to key names.
  return diagnosticText(typeof value === 'string'
    ? value.replace(/((?:https?|file):\/\/[^\s?#)]*)[?#][^\s)]*/giu, '$1') : null, limit);
}

export function installBrowserErrorDiagnostics(target: Window = window): () => void {
  const existing = stores.get(target);
  if (existing) return existing.stop;

  const store: BrowserErrorStore = { startedAt: new Date().toISOString(), entries: [], stop };
  function record(kind: BrowserErrorEntry['kind'], message: unknown, error: unknown) {
    // Attribute only explicit conversation URLs. Never guess which conversation
    // caused an asynchronous failure on a different page or direct-lane route.
    const view = target.location.pathname;
    const match = /^\/(?:chat|code|work)\/chats\/([^/]+)\/?$/u.exec(view);
    if (!match || view.length > 400) return;
    let channelId: string;
    try { channelId = decodeURIComponent(match[1]!); } catch { return; }
    store.entries.push({
      at: new Date().toISOString(), channelId, view,
      kind, message: errorText(message),
      stack: error instanceof Error ? errorText(error.stack, 4000) : null,
    });
    if (store.entries.length > 20) store.entries.splice(0, store.entries.length - 20);
  }
  function onError(event: ErrorEvent) {
    if (event.message) record('error', event.message, event.error);
  }
  function onRejection(event: PromiseRejectionEvent) {
    const reason: unknown = event.reason;
    record('unhandledrejection', reason instanceof Error ? reason.message
      : typeof reason === 'string' ? reason : 'Non-Error rejection (details omitted)', reason);
  }
  function stop() {
    if (stores.get(target) !== store) return;
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
    store.entries.length = 0;
    stores.delete(target);
  }
  stores.set(target, store);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return stop;
}

export function readBrowserErrorDiagnostics(channelId: string, target: Window = window) {
  const store = stores.get(target);
  return {
    startedAt: store?.startedAt ?? null,
    availability: store
      ? 'Last 8 retained uncaught errors observed while this conversation URL was open in this window; at most 20 total retained since page load. The visible page does not prove the cause. Other windows, direct-lane routes and full console output are unavailable.'
      : 'unavailable (renderer error capture not installed)',
    entries: store?.entries.filter(entry => entry.channelId === channelId).slice(-8)
      .map(entry => ({ ...entry })) ?? [],
  };
}
