import { randomUUID } from 'node:crypto';

import type {
  DesktopBootstrapAggregationBundle,
  DesktopBootstrapEvent,
  DesktopBootstrapEventError,
  DesktopBootstrapEventReference,
  DesktopBootstrapEventStatus,
  DesktopBootstrapLayerSummary,
  DesktopHealthStatus,
  DesktopHostDiagnosticsState,
  DesktopManagedServiceLog,
  DesktopProductBootstrapDiagnostics,
  ManagedServiceName,
} from './contracts.js';

const HOST_EVENT_LIMIT = 100;
const RUNTIME_EVENT_LIMIT = 100;
const MERGED_EVENT_LIMIT = 150;
const PER_LAYER_MINIMUM = 20;

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortEvents(events: DesktopBootstrapEvent[]): DesktopBootstrapEvent[] {
  return [...events].sort((left, right) => {
    const timestampDelta = parseTimestamp(right.timestamp) - parseTimestamp(left.timestamp);
    if (timestampDelta !== 0) {
      return timestampDelta;
    }
    return left.kind.localeCompare(right.kind);
  });
}

function trimEvents(events: DesktopBootstrapEvent[], limit: number): DesktopBootstrapEvent[] {
  if (limit <= 0) {
    return [];
  }
  return sortEvents(events).slice(0, limit);
}

function ensureEventTimestamp(
  timestamp: string,
  latestTimestamp?: string | null,
): string {
  const candidate = parseTimestamp(timestamp);
  const latest = latestTimestamp ? parseTimestamp(latestTimestamp) : 0;
  if (candidate > latest) {
    return timestamp;
  }
  return new Date(latest + 1).toISOString();
}

function eventIdentity(event: DesktopBootstrapEvent): string {
  const referenceId = event.reference?.recordId
    ?? event.reference?.artifactPath
    ?? event.reference?.route
    ?? '';
  return [
    event.layer,
    event.kind,
    event.timestamp,
    event.summary,
    referenceId,
  ].join('|');
}

function buildLayerSummary(
  events: DesktopBootstrapEvent[],
  fallback: {
    status: DesktopBootstrapEventStatus;
    summary: string;
  },
): DesktopBootstrapLayerSummary {
  const latest = sortEvents(events)[0];
  if (!latest) {
    return {
      status: fallback.status,
      summary: fallback.summary,
      latestTimestamp: null,
      latestReference: null,
    };
  }
  return {
    status: latest.status,
    summary: latest.summary,
    latestTimestamp: latest.timestamp,
    latestReference: latest.reference,
  };
}

function fairMergeChronology(
  runtimeEvents: DesktopBootstrapEvent[],
  productEvents: DesktopBootstrapEvent[],
  hostEvents: DesktopBootstrapEvent[],
): DesktopBootstrapEvent[] {
  const selected = new Map<string, DesktopBootstrapEvent>();
  const byLayer = [
    ...[sortEvents(runtimeEvents), sortEvents(productEvents), sortEvents(hostEvents)],
  ];

  for (const layerEvents of byLayer) {
    for (const event of layerEvents.slice(0, PER_LAYER_MINIMUM)) {
      selected.set(eventIdentity(event), event);
    }
  }

  const combined = sortEvents([
    ...runtimeEvents,
    ...productEvents,
    ...hostEvents,
  ]);
  for (const event of combined) {
    if (selected.size >= MERGED_EVENT_LIMIT) {
      break;
    }
    selected.set(eventIdentity(event), event);
  }

  return sortEvents(Array.from(selected.values())).slice(0, MERGED_EVENT_LIMIT);
}

export function createBootstrapAttemptId(now: Date = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:.TZ]/gu, '');
  return `desktop-bootstrap-${timestamp}-${randomUUID().slice(0, 8)}`;
}

export function toDesktopBootstrapStatus(
  value: DesktopHealthStatus | DesktopBootstrapEventStatus | null | undefined,
  fallback: DesktopBootstrapEventStatus = 'info',
): DesktopBootstrapEventStatus {
  return value === 'ok'
    || value === 'degraded'
    || value === 'unavailable'
    || value === 'info'
    ? value
    : fallback;
}

export function toDesktopBootstrapError(
  error: unknown,
): DesktopBootstrapEventError | null {
  if (!error) {
    return null;
  }
  if (typeof error === 'string') {
    return error.trim()
      ? { message: error }
      : null;
  }
  if (error instanceof Error) {
    return {
      message: error.message || error.name || 'Unknown error',
      cause: typeof error.cause === 'string' ? error.cause : undefined,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}

export function createDesktopBootstrapEvent(input: {
  layer: DesktopBootstrapEvent['layer'];
  kind: string;
  timestamp?: string;
  attemptId?: string | null;
  summary: string;
  status?: DesktopBootstrapEventStatus | null;
  context?: Record<string, unknown> | null;
  error?: DesktopBootstrapEventError | null;
  reference?: DesktopBootstrapEventReference | null;
}): DesktopBootstrapEvent {
  return {
    layer: input.layer,
    kind: input.kind,
    timestamp: input.timestamp ?? new Date().toISOString(),
    attemptId: input.attemptId ?? null,
    summary: input.summary,
    status: toDesktopBootstrapStatus(input.status, 'info'),
    context: input.context ?? null,
    error: input.error ?? null,
    reference: input.reference ?? null,
  };
}

export function appendHostEvent(
  state: DesktopHostDiagnosticsState,
  event: DesktopBootstrapEvent,
): DesktopHostDiagnosticsState {
  const normalizedEvent = {
    ...event,
    timestamp: ensureEventTimestamp(event.timestamp, state.hostEvents[0]?.timestamp ?? state.updatedAt),
  };
  return {
    ...state,
    hostEvents: trimEvents([normalizedEvent, ...state.hostEvents], HOST_EVENT_LIMIT),
    updatedAt: normalizedEvent.timestamp,
  };
}

export function appendRuntimeEvent(
  state: DesktopHostDiagnosticsState,
  event: DesktopBootstrapEvent,
): DesktopHostDiagnosticsState {
  const normalizedEvent = {
    ...event,
    timestamp: ensureEventTimestamp(
      event.timestamp,
      state.runtimeEvents[0]?.timestamp ?? state.updatedAt,
    ),
  };
  return {
    ...state,
    runtimeEvents: trimEvents([normalizedEvent, ...state.runtimeEvents], RUNTIME_EVENT_LIMIT),
    updatedAt: normalizedEvent.timestamp,
  };
}

export function updateServiceLogs(
  state: DesktopHostDiagnosticsState,
  logs: DesktopManagedServiceLog[],
  now: string,
): DesktopHostDiagnosticsState {
  return {
    ...state,
    serviceLogs: logs,
    updatedAt: now,
  };
}

export function buildDesktopAggregationBundle(input: {
  generatedAt: string;
  attemptId: string | null;
  runtimeEvents: DesktopBootstrapEvent[];
  product: DesktopProductBootstrapDiagnostics | null;
  hostEvents: DesktopBootstrapEvent[];
  runtimeFallback: {
    status: DesktopBootstrapEventStatus;
    summary: string;
  };
  productFallback?: {
    status: DesktopBootstrapEventStatus;
    summary: string;
  };
  hostFallback: {
    status: DesktopBootstrapEventStatus;
    summary: string;
  };
}): DesktopBootstrapAggregationBundle {
  const filterAttempt = (events: DesktopBootstrapEvent[]): DesktopBootstrapEvent[] => {
    if (!input.attemptId) {
      return events;
    }
    const matching = events.filter((event) => event.attemptId === input.attemptId);
    return matching.length > 0 ? matching : events.filter((event) => event.attemptId === null);
  };

  const runtimeEvents = filterAttempt(input.runtimeEvents);
  const productEvents = filterAttempt(input.product?.events ?? []);
  const hostEvents = filterAttempt(input.hostEvents);
  const chronology = fairMergeChronology(
    trimEvents(runtimeEvents, RUNTIME_EVENT_LIMIT),
    trimEvents(productEvents, HOST_EVENT_LIMIT),
    trimEvents(hostEvents, HOST_EVENT_LIMIT),
  );

  return {
    generatedAt: input.generatedAt,
    attemptId: input.attemptId,
    layers: {
      runtime: buildLayerSummary(runtimeEvents, input.runtimeFallback),
      product: input.product
        ? productEvents.length > 0
          ? buildLayerSummary(productEvents, {
            status: input.product.status,
            summary: input.product.summary,
          })
          : buildLayerSummary([], input.productFallback ?? {
            status: 'info',
            summary: 'No product-owned onboarding events were recorded for this bootstrap attempt yet.',
          })
        : buildLayerSummary([], input.productFallback ?? {
          status: 'info',
          summary: 'Product onboarding diagnostics are not available yet.',
        }),
      host: buildLayerSummary(hostEvents, input.hostFallback),
    },
    chronology,
  };
}

export function createEmptyDesktopDiagnosticsState(
  serviceNames: ManagedServiceName[],
): DesktopHostDiagnosticsState {
  return {
    activeAttemptId: null,
    hostEvents: [],
    runtimeEvents: [],
    product: null,
    aggregation: null,
    serviceLogs: serviceNames.map((service) => ({
      service,
      logPath: null,
      lastOutput: null,
      lastOutputAt: null,
    })),
    updatedAt: null,
  };
}
