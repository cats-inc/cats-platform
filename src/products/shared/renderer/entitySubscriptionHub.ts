import { useEffect, useRef } from 'react';

export type EntitySubscriptionKind = 'channel' | 'artifact';

export interface EntitySubscriptionSnapshot<TState = unknown> {
  kind: EntitySubscriptionKind;
  id: string;
  version: number;
  state: TState;
}

export interface EntitySubscriptionPatch<TPatch = unknown> {
  kind: EntitySubscriptionKind;
  id: string;
  version: number;
  patch: TPatch;
}

export interface EntitySubscriptionClose {
  reason: string;
}

export interface EntitySubscriptionCallbacks<TState = unknown, TPatch = unknown> {
  onSnapshot: (snapshot: EntitySubscriptionSnapshot<TState>) => void;
  onPatch: (patch: EntitySubscriptionPatch<TPatch>) => void;
  onClose?: (close: EntitySubscriptionClose) => void;
}

export interface EntitySubscriptionOptions<TState = unknown, TPatch = unknown>
  extends EntitySubscriptionCallbacks<TState, TPatch> {
  kind: EntitySubscriptionKind;
  id: string | null;
  enabled?: boolean;
}

type EventSourceFactory = (url: string) => EventSource;

interface EntitySubscriptionEntry {
  kind: EntitySubscriptionKind;
  id: string;
  callbacks: Set<EntitySubscriptionCallbacks>;
  source: EventSource | null;
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

function createSubscriptionKey(kind: EntitySubscriptionKind, id: string): string {
  return `${kind}:${id}`;
}

export class EntitySubscriptionHub {
  private entries = new Map<string, EntitySubscriptionEntry>();
  private readonly canOpen: boolean;
  private readonly createEventSource: EventSourceFactory;

  constructor(createEventSource?: EventSourceFactory) {
    this.canOpen = createEventSource !== undefined || typeof EventSource !== 'undefined';
    this.createEventSource = createEventSource ?? ((url) => new EventSource(url));
  }

  subscribe<TState, TPatch>(
    options: EntitySubscriptionOptions<TState, TPatch>,
  ): () => void {
    if (options.enabled === false || !options.id) {
      return () => {};
    }

    const key = createSubscriptionKey(options.kind, options.id);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        kind: options.kind,
        id: options.id,
        callbacks: new Set<EntitySubscriptionCallbacks>(),
        source: null,
        retryCount: 0,
        retryTimer: null,
        closed: false,
      };
      this.entries.set(key, entry);
      this.open(entry);
    }

    const callbacks = {
      onSnapshot: options.onSnapshot as EntitySubscriptionCallbacks['onSnapshot'],
      onPatch: options.onPatch as EntitySubscriptionCallbacks['onPatch'],
      onClose: options.onClose as EntitySubscriptionCallbacks['onClose'],
    };
    entry.callbacks.add(callbacks);

    return () => {
      const current = this.entries.get(key);
      if (!current) {
        return;
      }
      current.callbacks.delete(callbacks);
      if (current.callbacks.size === 0) {
        this.closeEntry(key, current);
      }
    };
  }

  getActiveSubscribedIds(kind: EntitySubscriptionKind): string[] {
    return [...this.entries.values()]
      .filter((entry) => entry.kind === kind && entry.callbacks.size > 0)
      .map((entry) => entry.id);
  }

  private open(entry: EntitySubscriptionEntry): void {
    if (entry.closed || !this.canOpen) {
      return;
    }

    const url = `/api/subscribe?kind=${encodeURIComponent(entry.kind)}&id=${encodeURIComponent(entry.id)}`;
    const source = this.createEventSource(url);
    entry.source = source;

    source.addEventListener('open', () => {
      entry.retryCount = 0;
    });

    source.addEventListener('snapshot', (event) => {
      const snapshot = JSON.parse((event as MessageEvent).data) as EntitySubscriptionSnapshot;
      for (const callbacks of entry.callbacks) {
        callbacks.onSnapshot(snapshot);
      }
    });

    source.addEventListener('patch', (event) => {
      const patch = JSON.parse((event as MessageEvent).data) as EntitySubscriptionPatch;
      for (const callbacks of entry.callbacks) {
        callbacks.onPatch(patch);
      }
    });

    source.addEventListener('close', (event) => {
      const close = JSON.parse((event as MessageEvent).data) as EntitySubscriptionClose;
      for (const callbacks of entry.callbacks) {
        callbacks.onClose?.(close);
      }
      this.closeEntry(createSubscriptionKey(entry.kind, entry.id), entry);
    });

    source.onerror = () => {
      source.close();
      if (entry.source === source) {
        entry.source = null;
      }
      this.scheduleReconnect(entry);
    };
  }

  private scheduleReconnect(entry: EntitySubscriptionEntry): void {
    if (entry.closed || entry.callbacks.size === 0 || entry.retryTimer) {
      return;
    }

    const delay = Math.min(250 * 2 ** entry.retryCount, 10_000);
    entry.retryCount += 1;
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      this.open(entry);
    }, delay);
  }

  private closeEntry(key: string, entry: EntitySubscriptionEntry): void {
    entry.closed = true;
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }
    entry.source?.close();
    entry.source = null;
    this.entries.delete(key);
  }
}

export const entitySubscriptionHub = new EntitySubscriptionHub();

export function useEntitySubscription<TState, TPatch>(
  options: EntitySubscriptionOptions<TState, TPatch>,
): void {
  const callbacksRef = useRef<EntitySubscriptionCallbacks<TState, TPatch>>({
    onSnapshot: options.onSnapshot,
    onPatch: options.onPatch,
    onClose: options.onClose,
  });
  callbacksRef.current = {
    onSnapshot: options.onSnapshot,
    onPatch: options.onPatch,
    onClose: options.onClose,
  };

  useEffect(() => entitySubscriptionHub.subscribe<TState, TPatch>({
    kind: options.kind,
    id: options.id,
    enabled: options.enabled,
    onSnapshot: (snapshot) => callbacksRef.current.onSnapshot(snapshot),
    onPatch: (patch) => callbacksRef.current.onPatch(patch),
    onClose: (close) => callbacksRef.current.onClose?.(close),
  }), [options.enabled, options.id, options.kind]);
}
