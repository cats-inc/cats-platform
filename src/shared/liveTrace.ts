export interface LiveTraceEntry {
  seq: number;
  at: string;
  origin: 'browser' | 'server';
  event: string;
  channelId: string | null;
  containerId: string | null;
  conversationId: string | null;
  turnId: string | null;
  laneId: string | null;
  sourceMessageId: string | null;
  targetStateId: string | null;
  sessionId: string | null;
  participantId: string | null;
  catId: string | null;
  speakerLabel: string | null;
  activeTurnUpdatedAt: string | null;
  visible: boolean | null;
  reason: string | null;
  details: Record<string, unknown> | null;
}

interface BrowserLiveTraceStore {
  enabled: boolean;
  seq: number;
  entries: LiveTraceEntry[];
  lastSignature: string | null;
}

export interface PushLiveTraceInput {
  event: string;
  channelId?: string | null;
  containerId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  laneId?: string | null;
  sourceMessageId?: string | null;
  targetStateId?: string | null;
  sessionId?: string | null;
  participantId?: string | null;
  catId?: string | null;
  speakerLabel?: string | null;
  activeTurnUpdatedAt?: string | null;
  visible?: boolean | null;
  reason?: string | null;
  details?: Record<string, unknown> | null;
  signature?: string | null;
}

const LIVE_TRACE_LIMIT = 200;
const BROWSER_TRACE_STORE_KEY = '__catsLiveTraceStore';
const BROWSER_TRACE_ENTRIES_KEY = '__catsLiveTrace';
const BROWSER_TRACE_ENABLED_KEY = '__catsLiveTraceEnabled';

// Process-local by design. The current Cats app server runs as one local process,
// so a module-scoped ring buffer is enough for developer debugging.
let serverTraceSeq = 0;
let serverTraceLastSignature: string | null = null;
const serverTraceEntries: LiveTraceEntry[] = [];

export function setBrowserLiveTraceEnabled(enabled: boolean): void {
  const store = resolveBrowserLiveTraceStore();
  if (enabled && !store.enabled) {
    store.entries.length = 0;
    store.seq = 0;
    store.lastSignature = null;
  }
  store.enabled = enabled;
  syncBrowserLiveTraceGlobals(store);
}

export function readBrowserLiveTrace(): LiveTraceEntry[] {
  return [...resolveBrowserLiveTraceStore().entries];
}

export function isBrowserLiveTraceEnabled(): boolean {
  return resolveBrowserLiveTraceStore().enabled;
}

export function pushBrowserLiveTrace(input: PushLiveTraceInput): void {
  const store = resolveBrowserLiveTraceStore();
  if (!store.enabled) {
    return;
  }

  const signature = input.signature ?? buildTraceSignature(input);
  if (signature && store.lastSignature === signature) {
    return;
  }

  store.lastSignature = signature;
  store.seq += 1;
  store.entries.push(buildTraceEntry('browser', store.seq, input));
  trimTraceEntries(store.entries);
  syncBrowserLiveTraceGlobals(store);
}

export function clearServerLiveTrace(): void {
  serverTraceEntries.length = 0;
  serverTraceSeq = 0;
  serverTraceLastSignature = null;
}

export function readServerLiveTrace(): LiveTraceEntry[] {
  return [...serverTraceEntries];
}

export function pushServerLiveTrace(input: PushLiveTraceInput): void {
  const signature = input.signature ?? buildTraceSignature(input);
  if (signature && serverTraceLastSignature === signature) {
    return;
  }

  serverTraceLastSignature = signature;
  serverTraceSeq += 1;
  serverTraceEntries.push(buildTraceEntry('server', serverTraceSeq, input));
  trimTraceEntries(serverTraceEntries);
}

function resolveBrowserLiveTraceStore(): BrowserLiveTraceStore {
  const traceGlobal = globalThis as Record<string, unknown>;
  const existing = traceGlobal[BROWSER_TRACE_STORE_KEY];
  if (isBrowserLiveTraceStore(existing)) {
    return existing;
  }

  const nextStore: BrowserLiveTraceStore = {
    enabled: false,
    seq: 0,
    entries: [],
    lastSignature: null,
  };
  traceGlobal[BROWSER_TRACE_STORE_KEY] = nextStore;
  syncBrowserLiveTraceGlobals(nextStore);
  return nextStore;
}

function isBrowserLiveTraceStore(value: unknown): value is BrowserLiveTraceStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<BrowserLiveTraceStore>;
  return Array.isArray(candidate.entries)
    && typeof candidate.enabled === 'boolean'
    && typeof candidate.seq === 'number';
}

function syncBrowserLiveTraceGlobals(store: BrowserLiveTraceStore): void {
  const traceGlobal = globalThis as Record<string, unknown>;
  traceGlobal[BROWSER_TRACE_ENTRIES_KEY] = store.entries;
  traceGlobal[BROWSER_TRACE_ENABLED_KEY] = store.enabled;
}

function buildTraceEntry(
  origin: LiveTraceEntry['origin'],
  seq: number,
  input: PushLiveTraceInput,
): LiveTraceEntry {
  return {
    seq,
    at: new Date().toISOString(),
    origin,
    event: input.event,
    channelId: input.channelId ?? null,
    containerId: input.containerId ?? null,
    conversationId: input.conversationId ?? null,
    turnId: input.turnId ?? null,
    laneId: input.laneId ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    targetStateId: input.targetStateId ?? null,
    sessionId: input.sessionId ?? null,
    participantId: input.participantId ?? null,
    catId: input.catId ?? null,
    speakerLabel: input.speakerLabel ?? null,
    activeTurnUpdatedAt: input.activeTurnUpdatedAt ?? null,
    visible: input.visible ?? null,
    reason: input.reason ?? null,
    details: input.details ?? null,
  };
}

function trimTraceEntries(entries: LiveTraceEntry[]): void {
  if (entries.length <= LIVE_TRACE_LIMIT) {
    return;
  }
  entries.splice(0, entries.length - LIVE_TRACE_LIMIT);
}

function buildTraceSignature(input: PushLiveTraceInput): string {
  return [
    input.event,
    input.channelId ?? '',
    input.containerId ?? '',
    input.conversationId ?? '',
    input.turnId ?? '',
    input.laneId ?? '',
    input.sourceMessageId ?? '',
    input.targetStateId ?? '',
    input.sessionId ?? '',
    input.participantId ?? '',
    input.catId ?? '',
    input.speakerLabel ?? '',
    input.activeTurnUpdatedAt ?? '',
    input.visible == null ? '' : input.visible ? '1' : '0',
    input.reason ?? '',
    JSON.stringify(input.details ?? {}),
  ].join('::');
}
