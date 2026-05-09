import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  ARTIFACT_CANVAS_SURFACE_KINDS,
  ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH,
  ARTIFACT_CANVAS_RENDER_INTENT_STREAM_PATH,
  type ArtifactCanvasNavigateIntent,
  type CanvasSurfaceKind,
  type CanvasSurfaceRef,
} from './contracts.js';

export {
  ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH,
  ARTIFACT_CANVAS_RENDER_INTENT_STREAM_PATH,
  buildArtifactCanvasRenderIntentStreamUrl,
} from './contracts.js';

export const ARTIFACT_CANVAS_RENDER_INTENT_TTL_MS = 30_000;
export const ARTIFACT_CANVAS_RENDER_INTENT_SESSION_HEADER =
  'x-cats-renderer-session-id';

export interface ArtifactCanvasRenderIntentPendingRecord {
  intent: ArtifactCanvasNavigateIntent;
  sessionId: string;
  acknowledgedAt: string | null;
}

export interface ArtifactCanvasRenderIntentDeliveryResult {
  delivered: boolean;
  subscriberCount: number;
  ownerSessionId: string | null;
}

export interface ArtifactCanvasRenderIntentAckResult {
  status: 'ok';
  acknowledged: boolean;
}

interface ArtifactCanvasRenderIntentSubscriber {
  id: number;
  surface: CanvasSurfaceRef;
  sessionId: string;
  send: (intent: ArtifactCanvasNavigateIntent) => void;
}

export class ArtifactCanvasRenderIntentHub {
  private nextSubscriberId = 1;
  private readonly subscribers = new Map<number, ArtifactCanvasRenderIntentSubscriber>();
  private readonly pending = new Map<string, ArtifactCanvasRenderIntentPendingRecord>();

  subscribe(input: {
    surface: CanvasSurfaceRef;
    sessionId: string;
    send: (intent: ArtifactCanvasNavigateIntent) => void;
    now?: Date;
  }): () => void {
    const now = input.now ?? new Date();
    this.pruneExpired(now);
    const subscriber: ArtifactCanvasRenderIntentSubscriber = {
      id: this.nextSubscriberId,
      surface: input.surface,
      sessionId: input.sessionId,
      send: input.send,
    };
    this.nextSubscriberId += 1;
    this.subscribers.set(subscriber.id, subscriber);

    for (const record of this.pending.values()) {
      if (
        record.acknowledgedAt === null
        && record.sessionId === input.sessionId
        && surfacesEqual(record.intent.surface, input.surface)
        && !isIntentExpired(record.intent, now)
      ) {
        safeSend(subscriber, record.intent);
      }
    }

    return () => {
      this.subscribers.delete(subscriber.id);
    };
  }

  publish(input: {
    intent: ArtifactCanvasNavigateIntent;
    targetSessionId?: string | null;
    now?: Date;
  }): ArtifactCanvasRenderIntentDeliveryResult {
    const now = input.now ?? new Date();
    this.pruneExpired(now);
    if (isIntentExpired(input.intent, now)) {
      return { delivered: false, subscriberCount: 0, ownerSessionId: null };
    }

    const matchingSubscribers = [...this.subscribers.values()].filter((subscriber) =>
      surfacesEqual(subscriber.surface, input.intent.surface)
      && (!input.targetSessionId || subscriber.sessionId === input.targetSessionId),
    );
    const ownerSessionId = input.targetSessionId ?? matchingSubscribers[0]?.sessionId ?? null;
    if (!ownerSessionId) {
      return { delivered: false, subscriberCount: 0, ownerSessionId: null };
    }

    const targetSubscribers = matchingSubscribers.filter((subscriber) =>
      subscriber.sessionId === ownerSessionId);
    if (targetSubscribers.length === 0) {
      return { delivered: false, subscriberCount: 0, ownerSessionId: null };
    }

    this.pending.set(input.intent.intentId, {
      intent: structuredClone(input.intent),
      sessionId: ownerSessionId,
      acknowledgedAt: null,
    });
    for (const subscriber of targetSubscribers) {
      safeSend(subscriber, input.intent);
    }
    return {
      delivered: true,
      subscriberCount: targetSubscribers.length,
      ownerSessionId,
    };
  }

  acknowledge(input: {
    intentId: string | null;
    sessionId: string;
    now?: Date;
  }): ArtifactCanvasRenderIntentAckResult {
    const now = input.now ?? new Date();
    this.pruneExpired(now);
    const intentId = input.intentId?.trim();
    if (!intentId) {
      return { status: 'ok', acknowledged: false };
    }

    const record = this.pending.get(intentId);
    if (!record || record.sessionId !== input.sessionId || isIntentExpired(record.intent, now)) {
      return { status: 'ok', acknowledged: false };
    }

    this.pending.delete(intentId);
    return { status: 'ok', acknowledged: true };
  }

  getPendingIntent(intentId: string): ArtifactCanvasRenderIntentPendingRecord | null {
    return this.pending.get(intentId) ?? null;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  private pruneExpired(now: Date): void {
    for (const [intentId, record] of this.pending) {
      if (isIntentExpired(record.intent, now)) {
        this.pending.delete(intentId);
      }
    }
  }
}

let defaultArtifactCanvasRenderIntentHub: ArtifactCanvasRenderIntentHub | null = null;

export function getDefaultArtifactCanvasRenderIntentHub(): ArtifactCanvasRenderIntentHub {
  defaultArtifactCanvasRenderIntentHub ??= new ArtifactCanvasRenderIntentHub();
  return defaultArtifactCanvasRenderIntentHub;
}

export function createArtifactCanvasIntentId(): string {
  return randomBytes(16).toString('base64url');
}

export function resolveArtifactCanvasRequestSessionId(request: IncomingMessage): string {
  return (
    readHeader(request, ARTIFACT_CANVAS_RENDER_INTENT_SESSION_HEADER)
    ?? readHeader(request, 'x-cats-session-id')
    ?? readCookie(request.headers.cookie, 'cats_session')
    ?? 'anonymous'
  );
}

export function parseArtifactCanvasRenderIntentStreamUrl(url: URL): CanvasSurfaceRef | null {
  if (url.pathname !== ARTIFACT_CANVAS_RENDER_INTENT_STREAM_PATH) {
    return null;
  }
  const kind = readCanvasSurfaceKind(url.searchParams.get('surfaceKind'));
  const surfaceId = normalizeNonEmptyString(url.searchParams.get('surfaceId'));
  return kind && surfaceId ? { kind, surfaceId } : null;
}

export function writeArtifactCanvasRenderIntentStreamHeaders(
  response: ServerResponse,
): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
}

export function writeArtifactCanvasRenderIntentSseEvent(
  response: ServerResponse,
  event: string,
  data: Record<string, unknown>,
): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function safeSend(
  subscriber: ArtifactCanvasRenderIntentSubscriber,
  intent: ArtifactCanvasNavigateIntent,
): void {
  try {
    subscriber.send(structuredClone(intent));
  } catch {
    // Subscriber failures are isolated so one broken stream cannot block delivery.
  }
}

function surfacesEqual(left: CanvasSurfaceRef, right: CanvasSurfaceRef): boolean {
  return left.kind === right.kind && left.surfaceId === right.surfaceId;
}

function isIntentExpired(intent: ArtifactCanvasNavigateIntent, now: Date): boolean {
  const expiresAt = Date.parse(intent.expiresAt);
  return Number.isFinite(expiresAt) ? expiresAt <= now.getTime() : true;
}

function readCanvasSurfaceKind(value: string | null): CanvasSurfaceKind | null {
  return ARTIFACT_CANVAS_SURFACE_KINDS.includes(value as CanvasSurfaceKind)
    ? value as CanvasSurfaceKind
    : null;
}

function readHeader(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  return normalizeNonEmptyString(raw ?? null);
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.split('=');
    if (key?.trim() === name) {
      return normalizeNonEmptyString(decodeURIComponent(rest.join('=')));
    }
  }
  return null;
}

function normalizeNonEmptyString(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
