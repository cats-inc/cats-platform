import type { CanvasSurfaceRef } from '../../shared/artifactCanvas/contracts.js';

export const LIVE_PREVIEW_ALLOWED_PLACEHOLDERS = [
  'artifactDirectory',
  'port',
  'workspaceRoot',
] as const;

export type LivePreviewPlaceholder = (typeof LIVE_PREVIEW_ALLOWED_PLACEHOLDERS)[number];

export const LIVE_PREVIEW_WORKING_DIRECTORIES = [
  'artifactDirectory',
  'workspaceRoot',
] as const;

export type LivePreviewWorkingDirectory =
  (typeof LIVE_PREVIEW_WORKING_DIRECTORIES)[number];

export interface LivePreviewCommandProfile {
  id: string;
  label: string;
  enabled?: boolean;
  executable: string;
  args: string[];
  workingDirectory: LivePreviewWorkingDirectory;
  env?: Record<string, string>;
  port: {
    mode: 'argument' | 'env';
    name: string;
  };
  readiness: {
    path: string;
    timeoutMs: number;
    intervalMs: number;
    expectedStatus?: number;
  };
  stop: {
    graceMs: number;
    killProcessTree: boolean;
  };
}

export interface LivePreviewPortRange {
  start: number;
  end: number;
}

export interface LivePreviewConfig {
  enabled: boolean;
  portRange: LivePreviewPortRange;
  maxConcurrentGlobal: number;
  maxConcurrentPerWorkspace: number;
  defaultLeaseTtlMs: number;
  logMaxBytes: number;
  allowIpv6Loopback: boolean;
  commandProfiles: LivePreviewCommandProfile[];
}

export interface LivePreviewWorkspaceRef {
  kind: 'code_workspace';
  id: string;
  rootPath: string;
}

export interface LivePreviewStartRequest {
  commandProfileId: string;
  workspace: LivePreviewWorkspaceRef;
  surface: CanvasSurfaceRef;
  artifactTitle?: string | null;
  readinessTimeoutMs?: number | null;
}

export type LivePreviewStatus =
  | 'expired'
  | 'failed'
  | 'ready'
  | 'starting'
  | 'stopped'
  | 'stopping';

export interface LivePreviewLease {
  previewId: string;
  commandProfileId: string;
  surface: CanvasSurfaceRef;
  workspaceRef: LivePreviewWorkspaceRef;
  origin: string;
  host: '127.0.0.1' | '[::1]';
  port: number;
  processId: number | null;
  status: LivePreviewStatus;
  logPath: string;
  artifactId: string | null;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string;
  stoppedAt: string | null;
  stopReason: string | null;
}

export type LivePreviewErrorCode =
  | 'live_preview_command_profile_disabled'
  | 'live_preview_command_profile_invalid'
  | 'live_preview_command_profile_not_found'
  | 'live_preview_config_invalid'
  | 'live_preview_disabled'
  | 'live_preview_raw_command_not_allowed'
  | 'live_preview_request_invalid';

export interface LivePreviewError {
  code: LivePreviewErrorCode;
  message: string;
  details?: unknown;
}

export type LivePreviewStartValidationResult =
  | {
      status: 'accepted';
      request: LivePreviewStartRequest;
      profile: LivePreviewCommandProfile;
    }
  | {
      status: 'rejected';
      error: LivePreviewError;
    };

export interface LivePreviewStartAcceptedResult {
  status: 'accepted';
  previewId: string;
  origin: string;
  artifactId: string | null;
}

export interface LivePreviewStopAcceptedResult {
  status: 'accepted';
  previewId: string;
  stopReason: string;
}

export type LivePreviewStartResult =
  | LivePreviewStartAcceptedResult
  | { status: 'rejected'; error: LivePreviewError };

export type LivePreviewStopResult =
  | LivePreviewStopAcceptedResult
  | { status: 'rejected'; error: LivePreviewError };

export const DEFAULT_LIVE_PREVIEW_CONFIG: LivePreviewConfig = {
  enabled: false,
  portRange: { start: 47_100, end: 47_199 },
  maxConcurrentGlobal: 3,
  maxConcurrentPerWorkspace: 1,
  defaultLeaseTtlMs: 30 * 60 * 1000,
  logMaxBytes: 1024 * 1024,
  allowIpv6Loopback: false,
  commandProfiles: [],
};
