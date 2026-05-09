import {
  ARTIFACT_CANVAS_SURFACE_KINDS,
  type CanvasSurfaceRef,
} from '../../shared/artifactCanvas/contracts.js';
import {
  DEFAULT_LIVE_PREVIEW_CONFIG,
  LIVE_PREVIEW_ALLOWED_PLACEHOLDERS,
  LIVE_PREVIEW_WORKING_DIRECTORIES,
  type LivePreviewCommandProfile,
  type LivePreviewConfig,
  type LivePreviewError,
  type LivePreviewPortRange,
  type LivePreviewStartRequest,
  type LivePreviewStartValidationResult,
  type LivePreviewWorkspaceRef,
} from './contracts.js';

const FORBIDDEN_SHELL_TOKENS = /[;&|<>`$]/u;
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/gu;
const RAW_COMMAND_KEYS = ['args', 'command', 'env', 'executable', 'shell'] as const;
const START_REQUEST_KEYS = [
  'artifactTitle',
  'commandProfileId',
  'readinessTimeoutMs',
  'surface',
  'workspace',
] as const;

export function validateLivePreviewConfig(
  config: LivePreviewConfig = DEFAULT_LIVE_PREVIEW_CONFIG,
): void {
  if (typeof config.enabled !== 'boolean') {
    throw new Error('livePreview.enabled must be a boolean.');
  }
  validatePortRange(config.portRange);
  validatePositiveInt(config.maxConcurrentGlobal, 'livePreview.maxConcurrentGlobal');
  validatePositiveInt(
    config.maxConcurrentPerWorkspace,
    'livePreview.maxConcurrentPerWorkspace',
  );
  validatePositiveInt(config.defaultLeaseTtlMs, 'livePreview.defaultLeaseTtlMs');
  validatePositiveInt(config.logMaxBytes, 'livePreview.logMaxBytes');
  if (typeof config.allowIpv6Loopback !== 'boolean') {
    throw new Error('livePreview.allowIpv6Loopback must be a boolean.');
  }
  if (
    config.useRealProcessAdapter !== undefined
    && typeof config.useRealProcessAdapter !== 'boolean'
  ) {
    throw new Error('livePreview.useRealProcessAdapter must be a boolean.');
  }
  if (!Array.isArray(config.commandProfiles)) {
    throw new Error('livePreview.commandProfiles must be an array.');
  }

  const seen = new Set<string>();
  for (const profile of config.commandProfiles) {
    validateLivePreviewCommandProfile(profile);
    if (seen.has(profile.id)) {
      throw new Error(`Duplicate live preview command profile id: ${profile.id}`);
    }
    seen.add(profile.id);
  }
}

export function validateLivePreviewCommandProfile(profile: LivePreviewCommandProfile): void {
  const id = normalizeNonEmptyString(profile.id);
  if (!id) {
    throw new Error('Live preview command profile id is required.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(id)) {
    throw new Error(`Invalid live preview command profile id: ${profile.id}`);
  }
  if (profile.enabled !== undefined && typeof profile.enabled !== 'boolean') {
    throw new Error(`Live preview command profile ${id} enabled must be a boolean.`);
  }
  if (!normalizeNonEmptyString(profile.label)) {
    throw new Error(`Live preview command profile ${id} label is required.`);
  }
  validateExecutable(profile.executable, id);
  if (!Array.isArray(profile.args)) {
    throw new Error(`Live preview command profile ${id} args must be an array.`);
  }
  for (const arg of profile.args) {
    validateShellSafeTemplate(arg, `Live preview command profile ${id} arg`);
  }
  if (!LIVE_PREVIEW_WORKING_DIRECTORIES.includes(profile.workingDirectory)) {
    throw new Error(`Invalid live preview command profile ${id} workingDirectory.`);
  }
  validateEnvironment(profile.env, id);
  validatePortStrategy(profile, id);
  validateReadiness(profile, id);
  validateStopPolicy(profile, id);
}

export function validateLivePreviewStartRequest(
  input: unknown,
  config: LivePreviewConfig = DEFAULT_LIVE_PREVIEW_CONFIG,
): LivePreviewStartValidationResult {
  if (!config.enabled) {
    return rejected('live_preview_disabled', 'Cats Code live previews are disabled.');
  }

  try {
    validateLivePreviewConfig(config);
  } catch (error) {
    return rejected(
      'live_preview_config_invalid',
      error instanceof Error ? error.message : 'Live preview config is invalid.',
    );
  }

  const record = asRecord(input);
  if (!record) {
    return rejected('live_preview_request_invalid', 'Live preview start request must be an object.');
  }
  for (const key of RAW_COMMAND_KEYS) {
    if (key in record) {
      return rejected(
        'live_preview_raw_command_not_allowed',
        `Live preview start request cannot include raw command field: ${key}.`,
      );
    }
  }
  for (const key of Object.keys(record)) {
    if (!START_REQUEST_KEYS.includes(key as (typeof START_REQUEST_KEYS)[number])) {
      return rejected(
        'live_preview_request_invalid',
        `Unsupported live preview start request field: ${key}.`,
      );
    }
  }

  const commandProfileId = readNonEmptyString(record.commandProfileId);
  if (!commandProfileId) {
    return rejected('live_preview_request_invalid', 'commandProfileId is required.');
  }
  const profile = config.commandProfiles.find((entry) => entry.id === commandProfileId);
  if (!profile) {
    return rejected(
      'live_preview_command_profile_not_found',
      `Live preview command profile was not found: ${commandProfileId}.`,
    );
  }
  if (profile.enabled === false) {
    return rejected(
      'live_preview_command_profile_disabled',
      `Live preview command profile is disabled: ${commandProfileId}.`,
    );
  }

  try {
    validateLivePreviewCommandProfile(profile);
  } catch (error) {
    return rejected(
      'live_preview_command_profile_invalid',
      error instanceof Error ? error.message : 'Live preview command profile is invalid.',
    );
  }

  const workspace = readWorkspaceRef(record.workspace);
  if (!workspace) {
    return rejected('live_preview_request_invalid', 'workspace is required.');
  }
  const surface = readCanvasSurfaceRef(record.surface);
  if (!surface) {
    return rejected('live_preview_request_invalid', 'surface is required.');
  }
  const artifactTitle = readOptionalString(record.artifactTitle);
  const readinessTimeoutMs = readOptionalPositiveInt(record.readinessTimeoutMs);
  if (record.readinessTimeoutMs !== undefined && readinessTimeoutMs === null) {
    return rejected('live_preview_request_invalid', 'readinessTimeoutMs must be positive.');
  }

  return {
    status: 'accepted',
    request: {
      commandProfileId,
      workspace,
      surface,
      artifactTitle,
      readinessTimeoutMs,
    },
    profile,
  };
}

function validatePortRange(range: LivePreviewPortRange): void {
  if (!range || typeof range !== 'object') {
    throw new Error('livePreview.portRange is required.');
  }
  validatePort(range.start, 'livePreview.portRange.start');
  validatePort(range.end, 'livePreview.portRange.end');
  if (range.start > range.end) {
    throw new Error('livePreview.portRange start must be <= end.');
  }
}

function validatePort(port: unknown, field: string): void {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${field} must be an integer port between 1 and 65535.`);
  }
}

function validatePositiveInt(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
}

function validateExecutable(executable: unknown, id: string): void {
  const value = normalizeNonEmptyString(executable);
  if (!value) {
    throw new Error(`Live preview command profile ${id} executable is required.`);
  }
  if (/\s/u.test(value) || FORBIDDEN_SHELL_TOKENS.test(value)) {
    throw new Error(`Live preview command profile ${id} executable must be one command token.`);
  }
}

function validateEnvironment(env: Record<string, string> | undefined, id: string): void {
  if (env === undefined) {
    return;
  }
  if (!isRecord(env)) {
    throw new Error(`Live preview command profile ${id} env must be an object.`);
  }
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      throw new Error(`Invalid live preview env key for profile ${id}: ${key}`);
    }
    validateShellSafeTemplate(value, `Live preview command profile ${id} env ${key}`);
  }
}

function validatePortStrategy(profile: LivePreviewCommandProfile, id: string): void {
  if (!profile.port || typeof profile.port !== 'object') {
    throw new Error(`Live preview command profile ${id} port strategy is required.`);
  }
  if (profile.port.mode !== 'argument' && profile.port.mode !== 'env') {
    throw new Error(`Invalid live preview command profile ${id} port mode.`);
  }
  const name = normalizeNonEmptyString(profile.port.name);
  if (!name) {
    throw new Error(`Live preview command profile ${id} port name is required.`);
  }
  if (profile.port.mode === 'env') {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
      throw new Error(`Live preview command profile ${id} port env name is invalid.`);
    }
    return;
  }
  validateShellSafeTemplate(name, `Live preview command profile ${id} port argument name`);
  if (!profile.args.some((arg) => arg.includes('{port}'))) {
    throw new Error(
      `Live preview command profile ${id} argument port mode requires a {port} argument.`,
    );
  }
}

function validateReadiness(profile: LivePreviewCommandProfile, id: string): void {
  const readiness = profile.readiness;
  if (!readiness || typeof readiness !== 'object') {
    throw new Error(`Live preview command profile ${id} readiness probe is required.`);
  }
  const path = normalizeNonEmptyString(readiness.path);
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`Live preview command profile ${id} readiness.path must be a local path.`);
  }
  validateShellSafeTemplate(path, `Live preview command profile ${id} readiness.path`);
  validatePositiveInt(readiness.timeoutMs, `Live preview command profile ${id} readiness.timeoutMs`);
  validatePositiveInt(
    readiness.intervalMs,
    `Live preview command profile ${id} readiness.intervalMs`,
  );
  if (
    readiness.expectedStatus !== undefined
    && (!Number.isInteger(readiness.expectedStatus)
      || readiness.expectedStatus < 100
      || readiness.expectedStatus > 599)
  ) {
    throw new Error(`Live preview command profile ${id} readiness.expectedStatus is invalid.`);
  }
}

function validateStopPolicy(profile: LivePreviewCommandProfile, id: string): void {
  const stop = profile.stop;
  if (!stop || typeof stop !== 'object') {
    throw new Error(`Live preview command profile ${id} stop policy is required.`);
  }
  validatePositiveInt(stop.graceMs, `Live preview command profile ${id} stop.graceMs`);
  if (typeof stop.killProcessTree !== 'boolean') {
    throw new Error(`Live preview command profile ${id} stop.killProcessTree must be a boolean.`);
  }
}

function validateShellSafeTemplate(value: unknown, field: string): void {
  const text = normalizeNonEmptyString(value);
  if (!text) {
    throw new Error(`${field} is required.`);
  }
  const withoutPlaceholders = text.replace(
    PLACEHOLDER_PATTERN,
    (_match, placeholder: string) => {
      if (!LIVE_PREVIEW_ALLOWED_PLACEHOLDERS.includes(placeholder as never)) {
        throw new Error(`${field} uses unsupported placeholder: {${placeholder}}.`);
      }
      return '';
    },
  );
  if (FORBIDDEN_SHELL_TOKENS.test(withoutPlaceholders)) {
    throw new Error(`${field} contains shell metacharacters.`);
  }
}

function readWorkspaceRef(input: unknown): LivePreviewWorkspaceRef | null {
  const record = asRecord(input);
  if (!record || record.kind !== 'code_workspace') {
    return null;
  }
  const id = readNonEmptyString(record.id);
  const rootPath = readNonEmptyString(record.rootPath);
  return id && rootPath ? { kind: 'code_workspace', id, rootPath } : null;
}

function readCanvasSurfaceRef(input: unknown): CanvasSurfaceRef | null {
  const record = asRecord(input);
  if (!record || !ARTIFACT_CANVAS_SURFACE_KINDS.includes(record.kind as never)) {
    return null;
  }
  const surfaceId = readNonEmptyString(record.surfaceId);
  return surfaceId
    ? { kind: record.kind as CanvasSurfaceRef['kind'], surfaceId }
    : null;
}

function readOptionalString(input: unknown): string | null {
  if (input === undefined || input === null) {
    return null;
  }
  return readNonEmptyString(input);
}

function readOptionalPositiveInt(input: unknown): number | null {
  if (input === undefined || input === null) {
    return null;
  }
  return Number.isInteger(input) && Number(input) > 0 ? Number(input) : null;
}

function readNonEmptyString(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return isRecord(input) ? input : null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function normalizeNonEmptyString(input: unknown): string | null {
  return readNonEmptyString(input);
}

function rejected(
  code: LivePreviewError['code'],
  message: string,
  details?: unknown,
): LivePreviewStartValidationResult {
  return {
    status: 'rejected',
    error: { code, message, details },
  };
}
