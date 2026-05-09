import type { CanvasSurfaceKind, CanvasSurfaceRef } from '../../shared/artifactCanvas/contracts.js';
import type { LivePreviewError, LivePreviewLease } from './contracts.js';

export interface LivePreviewDiagnosticProjection {
  code: string;
  severity: 'error' | 'info' | 'warning';
  message: string;
}

export interface LivePreviewSummaryProjection {
  previewId: string;
  commandProfileId: string;
  surface: CanvasSurfaceRef;
  workspace: {
    id: string;
    rootPath: string;
  };
  origin: string;
  status: LivePreviewLease['status'];
  artifactId: string | null;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string;
  stoppedAt: string | null;
  stopReason: string | null;
  diagnostic: LivePreviewDiagnosticProjection | null;
}

export interface LivePreviewDetailProjection extends LivePreviewSummaryProjection {
  host: LivePreviewLease['host'];
  port: number;
  processId: number | null;
  logPath: string;
  logs: string | null;
}

export interface LivePreviewListProjection {
  previews: LivePreviewSummaryProjection[];
}

export interface LivePreviewFilter {
  surfaceKind?: CanvasSurfaceKind | null;
  surfaceId?: string | null;
}

export function buildLivePreviewListProjection(
  leases: readonly LivePreviewLease[],
  filter: LivePreviewFilter = {},
): LivePreviewListProjection {
  return {
    previews: leases
      .filter((lease) => matchesFilter(lease, filter))
      .map(buildLivePreviewSummaryProjection)
      .sort(comparePreviewSummaries),
  };
}

export function buildLivePreviewSummaryProjection(
  lease: LivePreviewLease,
): LivePreviewSummaryProjection {
  return {
    previewId: lease.previewId,
    commandProfileId: lease.commandProfileId,
    surface: lease.surface,
    workspace: {
      id: lease.workspaceRef.id,
      rootPath: lease.workspaceRef.rootPath,
    },
    origin: lease.origin,
    status: lease.status,
    artifactId: lease.artifactId,
    createdAt: lease.createdAt,
    readyAt: lease.readyAt,
    expiresAt: lease.expiresAt,
    stoppedAt: lease.stoppedAt,
    stopReason: lease.stopReason,
    diagnostic: buildLivePreviewDiagnostic(lease),
  };
}

export function buildLivePreviewDetailProjection(
  lease: LivePreviewLease,
  logs: string | null,
): LivePreviewDetailProjection {
  return {
    ...buildLivePreviewSummaryProjection(lease),
    host: lease.host,
    port: lease.port,
    processId: lease.processId,
    logPath: lease.logPath,
    logs,
  };
}

export function livePreviewErrorHttpStatus(error: LivePreviewError): number {
  switch (error.code) {
    case 'live_preview_not_found':
      return 404;
    case 'live_preview_command_profile_disabled':
    case 'live_preview_disabled':
      return 409;
    case 'live_preview_command_profile_invalid':
    case 'live_preview_command_profile_not_found':
    case 'live_preview_config_invalid':
    case 'live_preview_raw_command_not_allowed':
    case 'live_preview_request_invalid':
      return 400;
    case 'live_preview_concurrency_limit_exceeded':
    case 'live_preview_port_unavailable':
      return 429;
    case 'live_preview_process_exited':
    case 'live_preview_readiness_timeout':
    case 'live_preview_spawn_failed':
    case 'live_preview_stop_failed':
      return 422;
    default:
      return 500;
  }
}

function buildLivePreviewDiagnostic(
  lease: LivePreviewLease,
): LivePreviewDiagnosticProjection | null {
  if (lease.status === 'ready') {
    return null;
  }
  if (lease.status === 'starting') {
    return {
      code: 'live_preview_starting',
      severity: 'info',
      message: 'Live preview is starting.',
    };
  }
  if (lease.status === 'expired') {
    return {
      code: 'live_preview_expired',
      severity: 'warning',
      message: 'Live preview lease expired.',
    };
  }
  if (lease.status === 'stopped') {
    return {
      code: 'live_preview_stopped',
      severity: 'info',
      message: 'Live preview was stopped.',
    };
  }
  const reason = lease.stopReason ?? 'unknown';
  if (reason === 'readiness_timeout') {
    return {
      code: 'live_preview_readiness_timeout',
      severity: 'error',
      message: 'Live preview did not become ready before the timeout.',
    };
  }
  if (reason === 'spawn_failed') {
    return {
      code: 'live_preview_spawn_failed',
      severity: 'error',
      message: 'Live preview process failed to start.',
    };
  }
  if (reason === 'stop_failed') {
    return {
      code: 'live_preview_stop_failed',
      severity: 'error',
      message: 'Live preview cleanup failed.',
    };
  }
  if (reason.startsWith('process_exited:')) {
    return {
      code: 'live_preview_process_exited',
      severity: 'error',
      message: 'Live preview process exited before it was stopped.',
    };
  }
  return {
    code: 'live_preview_failed',
    severity: 'error',
    message: `Live preview failed: ${reason}.`,
  };
}

function matchesFilter(lease: LivePreviewLease, filter: LivePreviewFilter): boolean {
  if (filter.surfaceKind && lease.surface.kind !== filter.surfaceKind) {
    return false;
  }
  if (filter.surfaceId && lease.surface.surfaceId !== filter.surfaceId) {
    return false;
  }
  return true;
}

function comparePreviewSummaries(
  left: LivePreviewSummaryProjection,
  right: LivePreviewSummaryProjection,
): number {
  return right.createdAt.localeCompare(left.createdAt) || left.previewId.localeCompare(right.previewId);
}
