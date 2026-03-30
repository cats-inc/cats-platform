export const BOOTSTRAP_EVENT_LAYERS = [
  'runtime',
  'product',
  'host',
] as const;

export const BOOTSTRAP_EVENT_STATUSES = [
  'ok',
  'degraded',
  'unavailable',
  'info',
] as const;

export type BootstrapEventLayer = typeof BOOTSTRAP_EVENT_LAYERS[number];
export type BootstrapEventStatus = typeof BOOTSTRAP_EVENT_STATUSES[number];

export interface BootstrapEventReference {
  artifactId?: string;
  artifactPath?: string;
  recordId?: string;
  route?: string;
}

export interface BootstrapEventError {
  message: string;
  code?: string;
  cause?: string;
  stack?: string;
}

export interface BootstrapEvent {
  layer: BootstrapEventLayer;
  kind: string;
  timestamp: string;
  attemptId?: string | null;
  summary: string;
  status: BootstrapEventStatus;
  context?: Record<string, unknown>;
  error?: BootstrapEventError;
  reference?: BootstrapEventReference;
}

export interface BootstrapLayerSummary {
  status: BootstrapEventStatus;
  summary: string;
  latestTimestamp?: string | null;
  latestReference?: BootstrapEventReference;
}

export interface BootstrapAggregationBundle {
  generatedAt: string;
  attemptId?: string | null;
  layers: {
    runtime: BootstrapLayerSummary;
    product: BootstrapLayerSummary;
    host: BootstrapLayerSummary;
  };
  chronology: BootstrapEvent[];
}

export interface ProductBootstrapDiagnosticsReadModel {
  generatedAt: string;
  attemptId: string | null;
  status: BootstrapEventStatus;
  summary: string;
  historyPath: string;
  latestReference?: BootstrapEventReference;
  events: BootstrapEvent[];
}

export const DEFAULT_PRODUCT_BOOTSTRAP_HISTORY_LIMIT = 100;
export const DEFAULT_HOST_BOOTSTRAP_HISTORY_LIMIT = 100;
export const DEFAULT_MERGED_BOOTSTRAP_HISTORY_LIMIT = 150;
export const DEFAULT_PER_LAYER_BOOTSTRAP_HISTORY_MINIMUM = 20;

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ensureBootstrapEventTimestamp(
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

export function sortBootstrapEventsByTimestamp<T extends BootstrapEvent>(events: T[]): T[] {
  return [...events].sort((left, right) => {
    const timestampDelta = parseTimestamp(right.timestamp) - parseTimestamp(left.timestamp);
    if (timestampDelta !== 0) {
      return timestampDelta;
    }
    return left.kind.localeCompare(right.kind);
  });
}

export function trimBootstrapEvents<T extends BootstrapEvent>(events: T[], limit: number): T[] {
  if (limit <= 0) {
    return [];
  }
  const sorted = sortBootstrapEventsByTimestamp(events);
  return sorted.slice(0, limit);
}

export function normalizeBootstrapEventStatus(
  value: unknown,
  fallback: BootstrapEventStatus = 'info',
): BootstrapEventStatus {
  return value === 'ok'
    || value === 'degraded'
    || value === 'unavailable'
    || value === 'info'
    ? value
    : fallback;
}

export function toBootstrapEventError(error: unknown): BootstrapEventError | undefined {
  if (!error) {
    return undefined;
  }
  if (typeof error === 'string') {
    return error.trim() ? { message: error } : undefined;
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

export function summarizeBootstrapEvents(
  events: BootstrapEvent[],
  fallback: {
    status: BootstrapEventStatus;
    summary: string;
  },
): BootstrapLayerSummary {
  const latest = sortBootstrapEventsByTimestamp(events)[0];
  if (!latest) {
    return {
      status: fallback.status,
      summary: fallback.summary,
      latestTimestamp: null,
    };
  }
  return {
    status: latest.status,
    summary: latest.summary,
    latestTimestamp: latest.timestamp,
    latestReference: latest.reference,
  };
}
