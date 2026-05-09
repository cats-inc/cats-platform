import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH,
  buildArtifactCanvasRenderIntentStreamUrl,
  type ArtifactCanvasNavigateIntent,
  type CanvasSurfaceRef,
} from '../artifactCanvas/contracts.js';

const ACK_RETRY_DELAYS_MS = [250, 500, 1000] as const;

export function useCanvasNavigateIntent(surface: CanvasSurfaceRef | null): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!surface || typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource(buildArtifactCanvasRenderIntentStreamUrl(surface));
    const handleIntent = (event: MessageEvent) => {
      const intent = readArtifactCanvasNavigateIntent(event.data);
      if (!intent || !surfacesEqual(intent.surface, surface)) {
        return;
      }
      navigate(intent.targetUrl);
      globalThis.setTimeout(() => {
        void ackArtifactCanvasNavigateIntent(intent.intentId);
      }, 0);
    };

    source.addEventListener('artifact_canvas_intent', handleIntent);
    return () => {
      source.removeEventListener('artifact_canvas_intent', handleIntent);
      source.close();
    };
  }, [navigate, surface]);
}

export async function ackArtifactCanvasNavigateIntent(
  intentId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  for (const delay of [0, ...ACK_RETRY_DELAYS_MS]) {
    if (delay > 0) {
      await wait(delay);
    }
    try {
      const response = await fetcher(ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intentId }),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Best effort; retry below and then give up silently.
    }
  }
}

export function readArtifactCanvasNavigateIntent(input: unknown): ArtifactCanvasNavigateIntent | null {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }
  const record = asRecord(value);
  const envelopeIntent = asRecord(record?.intent);
  const candidate = envelopeIntent ?? record;
  const surface = asRecord(candidate?.surface);
  const kind = surface?.kind;
  const surfaceId = surface?.surfaceId;
  const intentId = candidate?.intentId;
  const targetUrl = candidate?.targetUrl;
  if (
    typeof kind !== 'string'
    || typeof surfaceId !== 'string'
    || typeof intentId !== 'string'
    || typeof targetUrl !== 'string'
  ) {
    return null;
  }
  return candidate as unknown as ArtifactCanvasNavigateIntent;
}

function surfacesEqual(left: CanvasSurfaceRef, right: CanvasSurfaceRef): boolean {
  return left.kind === right.kind && left.surfaceId === right.surfaceId;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}
