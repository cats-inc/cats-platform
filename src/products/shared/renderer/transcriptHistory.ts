import type { ChatMessage } from '../../chat/api/contracts.js';
import type { MessagePage } from '../../chat/shared/transcript.js';
import { presentationTargetKey } from '../../chat/shared/transcript.js';

export interface TranscriptWindow {
  messages: ChatMessage[]; total: number; nextCursor: string | null; orderRevision: string;
  historyRevision?: string; rawCount: number;
}
export interface TranscriptHistoryState {
  messages: ChatMessage[]; nextCursor: string | null; expanded: boolean; loading: boolean;
  error: boolean; changed: boolean; orderRevision: string; version: number; resetVersion: number;
}
export type TranscriptPageReader = (before: string | undefined, signal: AbortSignal) => Promise<MessagePage>;

export function mergeTranscriptMessages(older: readonly ChatMessage[], newer: readonly ChatMessage[]): ChatMessage[] {
  const result = [...older]; const positions = new Map(result.map((message, index) => [message.id, index]));
  for (const message of newer) {
    const index = positions.get(message.id);
    if (index === undefined) { positions.set(message.id, result.length); result.push(message); }
    else result[index] = message;
  }
  // A complete block projection supersedes earlier raw chunks of the same target.
  const presented = new Map<string, string>();
  for (const message of result) if (message.metadata?.presentation) {
    const key = presentationTargetKey(message.metadata.turnId, message.metadata.targetStateId);
    const previous = presented.get(key);
    if (!previous || message.metadata.event !== 'conversation_presentation') presented.set(key, message.id);
  }
  return result.filter(message => {
    if (!['assistant_turn_segment', 'conversation_presentation'].includes(String(message.metadata?.event))) return true;
    const chosen = presented.get(presentationTargetKey(message.metadata.turnId, message.metadata.targetStateId));
    return !chosen || chosen === message.id;
  }).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

const fromPage = (page: MessagePage): TranscriptWindow => ({ ...page,
  messages: page.displayMessages ?? page.messages, rawCount: page.messages.length });

/** One retained, contiguous transcript range. All network reads remain bounded pages. */
export class TranscriptHistory {
  private state: TranscriptHistoryState;
  private latest: TranscriptWindow;
  private signature: string;
  private retiredOrders = new Set<string>();
  private retainedCount: number;
  private request: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private refreshing = false;
  private listeners = new Set<() => void>();
  private beforeChanges = new Set<(kind: 'prepend' | 'refresh') => void>();

  constructor(initial: TranscriptWindow, private read: TranscriptPageReader, private refreshDelayMs = 750) {
    this.latest = initial; this.signature = JSON.stringify(initial); this.retainedCount = initial.rawCount;
    this.state = { messages: initial.messages, nextCursor: initial.nextCursor, expanded: false, loading: false,
      error: false, changed: false, orderRevision: initial.orderRevision, version: 0, resetVersion: 0 };
  }
  getSnapshot = (): TranscriptHistoryState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.dirty && this.state.expanded) this.scheduleRefresh();
    return () => { this.listeners.delete(listener); if (!this.listeners.size) this.cancel(); };
  };
  get isObserved(): boolean { return this.listeners.size > 0; }
  beforeChange = (callback: (kind: 'prepend' | 'refresh') => void): (() => void) => {
    this.beforeChanges.add(callback); return () => { this.beforeChanges.delete(callback); };
  };
  isRetired(order: string): boolean { return this.retiredOrders.has(order); }
  get observed(): TranscriptWindow { return this.latest; }
  private publish(change: Partial<TranscriptHistoryState>, preserve: false | 'prepend' | 'refresh' = false): void {
    if (preserve) for (const callback of this.beforeChanges) { try { callback(preserve); } catch { /* Detached view. */ } }
    this.state = { ...this.state, ...change, version: this.state.version + 1 };
    for (const listener of this.listeners) listener();
  }
  observe(window: TranscriptWindow): void {
    const signature = JSON.stringify(window);
    if (signature === this.signature) { if (this.dirty && this.listeners.size) this.scheduleRefresh(); return; }
    if (this.retiredOrders.has(window.orderRevision)) return;
    this.signature = signature;
    if (window.orderRevision !== this.latest.orderRevision) {
      this.cancel(); this.install(window, true); return;
    }
    const previous = this.latest; this.latest = window;
    if (!this.state.expanded) {
      this.retainedCount = window.rawCount;
      this.publish({ messages: window.messages, nextCursor: window.nextCursor }); return;
    }
    const growth = Math.max(0, window.total - previous.total);
    this.retainedCount += growth;
    const currentIds = new Set(window.messages.map(message => message.id));
    const removedLive = new Set(previous.messages.filter(message => message.metadata?.event === 'conversation_presentation'
      && (message.metadata.presentation as { phase?: string } | undefined)?.phase === 'streaming'
      && !currentIds.has(message.id) && previous.historyRevision === window.historyRevision).map(message => message.id));
    this.publish({ messages: mergeTranscriptMessages(this.state.messages.filter(message => !removedLive.has(message.id)), window.messages) });
    if (window.historyRevision !== previous.historyRevision || growth > window.rawCount) this.scheduleRefresh();
  }
  private install(window: TranscriptWindow, changed: boolean): void {
    this.dirty = false;
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    if (window.orderRevision !== this.latest.orderRevision) this.retiredOrders.add(this.latest.orderRevision);
    this.latest = window; this.retainedCount = window.rawCount;
    this.publish({ messages: window.messages, nextCursor: window.nextCursor, orderRevision: window.orderRevision,
      expanded: false, error: false, changed, resetVersion: this.state.resetVersion + 1 });
  }
  cancel(): void {
    if (this.refreshing && this.state.expanded) this.dirty = true;
    this.refreshing = false;
    this.request?.abort(); this.request = null;
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    if (this.state.loading) this.publish({ loading: false });
  }
  private scheduleRefresh(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; if (this.dirty && !this.request) void this.refresh(); }, this.refreshDelayMs);
  }
  private finish(request: AbortController): void {
    if (this.request !== request) return;
    this.request = null; this.publish({ loading: false });
    this.refreshing = false;
    if (this.dirty) this.scheduleRefresh();
  }
  async loadOlder(): Promise<void> {
    if (this.request || !this.state.nextCursor) return;
    const request = new AbortController(); this.request = request;
    const cursor = this.state.nextCursor;
    this.publish({ loading: true, error: false, expanded: true });
    let stale = false;
    try {
      const page = await this.read(cursor, request.signal);
      if (this.request !== request) return;
      if (page.orderRevision !== this.latest.orderRevision) stale = true;
      else {
        this.retainedCount += page.messages.length;
        this.publish({ messages: mergeTranscriptMessages(page.displayMessages ?? page.messages, this.state.messages),
          nextCursor: page.nextCursor }, 'prepend');
        if (page.historyRevision !== this.latest.historyRevision) this.scheduleRefresh();
      }
    } catch (error) {
      if (this.request !== request || request.signal.aborted) return;
      stale = (error as { code?: string })?.code === 'stale_message_cursor';
      if (!stale) this.publish({ error: true });
    } finally { this.finish(request); }
    if (stale) await this.reload(true);
  }
  async reload(changed = false): Promise<void> {
    this.cancel(); const request = new AbortController(); this.request = request;
    this.publish({ loading: true, error: false });
    const signature = this.signature;
    try {
      const page = await this.read(undefined, request.signal);
      if (this.request === request && !this.retiredOrders.has(page.orderRevision)) {
        let window = fromPage(page);
        if (this.signature !== signature && window.orderRevision === this.latest.orderRevision) {
          const observed = new Map(this.latest.messages.map(message => [message.id, message]));
          window = this.latest.total >= window.total ? this.latest
            : { ...window, messages: window.messages.map(message => observed.get(message.id) ?? message) };
        }
        this.install(window, changed);
      }
    } catch { if (this.request === request && !request.signal.aborted) this.publish({ error: true }); }
    finally { this.finish(request); }
  }
  async refresh(): Promise<void> {
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    if (!this.state.expanded) { this.dirty = false; return; }
    if (this.request) { this.dirty = true; return; }
    this.dirty = false;
    this.refreshing = true;
    const request = new AbortController(); this.request = request;
    const count = this.retainedCount; const totalAtStart = this.latest.total; const signature = this.signature;
    this.publish({ loading: true, error: false });
    try {
      const first = await this.read(undefined, request.signal);
      if (this.request !== request) return;
      if (first.orderRevision !== this.latest.orderRevision) { this.install(fromPage(first), true); return; }
      const required = count + Math.max(0, first.total - totalAtStart);
      const pages = [first]; let loaded = first.messages.length; let cursor = first.nextCursor;
      while (cursor && loaded < required) {
        const page = await this.read(cursor, request.signal);
        if (this.request !== request) return;
        if (page.orderRevision !== first.orderRevision) { await this.reload(true); return; }
        pages.unshift(page); loaded += page.messages.length; cursor = page.nextCursor;
      }
      const rawIds = new Set(pages.flatMap(page => page.messages.map(message => message.id)));
      const refreshed = pages.flatMap(page => page.displayMessages ?? page.messages);
      const displayIds = new Set(refreshed.map(message => message.id));
      const observedDuringRead = this.signature !== signature;
      this.retainedCount = loaded + (observedDuringRead ? Math.max(0, this.latest.total - first.total) : 0);
      const live = observedDuringRead ? this.latest.messages : first.displayMessages ?? first.messages;
      const liveIds = new Set(live.map(message => message.id));
      const retained = this.state.messages.filter(message => !rawIds.has(message.id) && !displayIds.has(message.id)
        && (message.metadata?.event !== 'conversation_presentation' || liveIds.has(message.id)));
      this.latest = { ...fromPage(first), messages: live,
        ...(observedDuringRead ? { total: Math.max(first.total, this.latest.total) } : {}) };
      this.publish({ messages: mergeTranscriptMessages(mergeTranscriptMessages(refreshed, retained), live), nextCursor: cursor }, 'refresh');
      if (pages.some(page => page.historyRevision !== first.historyRevision)) this.dirty = true;
    } catch (error) {
      if (this.request !== request || request.signal.aborted) return;
      if ((error as { code?: string })?.code === 'stale_message_cursor') { await this.reload(true); return; }
      this.publish({ error: true });
    } finally { this.finish(request); }
  }
}
