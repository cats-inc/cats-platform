export const EXTERNAL_WORK_BINDING_METADATA_KEY = 'externalWorkBindings' as const;
export const EXTERNAL_WORK_BINDING_SCHEMA_VERSION = 1 as const;

export const EXTERNAL_WORK_BINDING_LOCAL_KIND_VALUES = [
  'project',
  'work_item',
] as const;

export type ExternalWorkBindingLocalKind =
  (typeof EXTERNAL_WORK_BINDING_LOCAL_KIND_VALUES)[number];

export const EXTERNAL_WORK_BINDING_PROVIDER_VALUES = [
  'github',
  'gitlab',
  'gitea',
  'redmine',
  'bugzilla',
] as const;

export type ExternalWorkBindingProvider =
  (typeof EXTERNAL_WORK_BINDING_PROVIDER_VALUES)[number];

export const EXTERNAL_WORK_BINDING_EXTERNAL_TYPE_VALUES = [
  'issue',
  'project',
  'ticket',
] as const;

export type ExternalWorkBindingExternalType =
  (typeof EXTERNAL_WORK_BINDING_EXTERNAL_TYPE_VALUES)[number];

export const EXTERNAL_WORK_BINDING_SYNC_DIRECTION_VALUES = [
  'pull',
  'push',
  'bidirectional',
] as const;

export type ExternalWorkBindingSyncDirection =
  (typeof EXTERNAL_WORK_BINDING_SYNC_DIRECTION_VALUES)[number];

export interface ExternalWorkBindingInput {
  localKind: ExternalWorkBindingLocalKind;
  localId: string;
  provider: ExternalWorkBindingProvider;
  externalType: ExternalWorkBindingExternalType;
  externalId: string;
  externalUrl?: string | null;
  syncDirection?: ExternalWorkBindingSyncDirection;
  lastSyncedAt?: string | null;
  externalUpdatedAt?: string | null;
  linkedAt: string;
  linkedByActorRef?: string | null;
}

export interface ExternalWorkBinding {
  schemaVersion: typeof EXTERNAL_WORK_BINDING_SCHEMA_VERSION;
  localKind: ExternalWorkBindingLocalKind;
  localId: string;
  provider: ExternalWorkBindingProvider;
  externalType: ExternalWorkBindingExternalType;
  externalId: string;
  externalUrl: string | null;
  syncDirection: ExternalWorkBindingSyncDirection;
  lastSyncedAt: string | null;
  externalUpdatedAt: string | null;
  linkedAt: string;
  linkedByActorRef: string | null;
}

export interface ExternalWorkBindingsMetadata {
  schemaVersion: typeof EXTERNAL_WORK_BINDING_SCHEMA_VERSION;
  bindings: ExternalWorkBinding[];
}

export type ExternalWorkBindingValidationErrorCode =
  | 'required'
  | 'type'
  | 'blank'
  | 'too_long'
  | 'unsupported_value'
  | 'invalid_url'
  | 'invalid_timestamp';

export interface ExternalWorkBindingValidationError {
  code: ExternalWorkBindingValidationErrorCode;
  field: string;
  message: string;
}

export function validateExternalWorkBinding(input: unknown): ExternalWorkBindingValidationError[] {
  if (!isRecord(input)) {
    return [error('type', '$', 'External Work binding input must be an object.')];
  }

  return [
    ...validateRequiredEnum(input, 'localKind', EXTERNAL_WORK_BINDING_LOCAL_KIND_VALUES),
    ...validateRequiredString(input, 'localId', 160),
    ...validateRequiredEnum(input, 'provider', EXTERNAL_WORK_BINDING_PROVIDER_VALUES),
    ...validateRequiredEnum(input, 'externalType', EXTERNAL_WORK_BINDING_EXTERNAL_TYPE_VALUES),
    ...validateRequiredString(input, 'externalId', 200),
    ...validateOptionalUrl(input, 'externalUrl', 1000),
    ...validateOptionalEnum(input, 'syncDirection', EXTERNAL_WORK_BINDING_SYNC_DIRECTION_VALUES),
    ...validateOptionalTimestamp(input, 'lastSyncedAt'),
    ...validateOptionalTimestamp(input, 'externalUpdatedAt'),
    ...validateRequiredTimestamp(input, 'linkedAt'),
    ...validateOptionalString(input, 'linkedByActorRef', 160),
  ];
}

export function buildExternalWorkBinding(input: ExternalWorkBindingInput): ExternalWorkBinding {
  const validationErrors = validateExternalWorkBinding(input);
  if (validationErrors.length > 0) {
    throw new Error(
      `Invalid external Work binding: ${validationErrors
        .map((entry) => `${entry.field}:${entry.code}`)
        .join(', ')}`,
    );
  }

  return {
    schemaVersion: EXTERNAL_WORK_BINDING_SCHEMA_VERSION,
    localKind: input.localKind,
    localId: input.localId.trim(),
    provider: input.provider,
    externalType: input.externalType,
    externalId: input.externalId.trim(),
    externalUrl: normalizeNullableString(input.externalUrl),
    syncDirection: input.syncDirection ?? 'pull',
    lastSyncedAt: normalizeNullableString(input.lastSyncedAt),
    externalUpdatedAt: normalizeNullableString(input.externalUpdatedAt),
    linkedAt: input.linkedAt.trim(),
    linkedByActorRef: normalizeNullableString(input.linkedByActorRef),
  };
}

export function createExternalWorkBindingsMetadata(
  bindings: ExternalWorkBinding[],
): ExternalWorkBindingsMetadata {
  return {
    schemaVersion: EXTERNAL_WORK_BINDING_SCHEMA_VERSION,
    bindings: bindings.map((binding) => structuredClone(binding)),
  };
}

function validateRequiredString(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
): ExternalWorkBindingValidationError[] {
  const value = input[key];
  if (value === undefined || value === null) {
    return [error('required', key, `${key} is required.`)];
  }

  return validateStringValue(value, key, maxLength, true);
}

function validateOptionalString(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
): ExternalWorkBindingValidationError[] {
  const value = input[key];
  if (value === undefined || value === null) {
    return [];
  }

  return validateStringValue(value, key, maxLength, false);
}

function validateStringValue(
  value: unknown,
  field: string,
  maxLength: number,
  rejectBlank: boolean,
): ExternalWorkBindingValidationError[] {
  if (typeof value !== 'string') {
    return [error('type', field, `${field} must be a string.`)];
  }
  if (rejectBlank && value.trim() === '') {
    return [error('blank', field, `${field} must not be blank.`)];
  }
  if (value.length > maxLength) {
    return [error('too_long', field, `${field} must be ${maxLength} characters or fewer.`)];
  }

  return [];
}

function validateRequiredEnum<T extends readonly string[]>(
  input: Record<string, unknown>,
  key: string,
  values: T,
): ExternalWorkBindingValidationError[] {
  const value = input[key];
  if (value === undefined || value === null) {
    return [error('required', key, `${key} is required.`)];
  }
  if (typeof value !== 'string' || !values.includes(value)) {
    return [error('unsupported_value', key, `${key} must be one of: ${values.join(', ')}.`)];
  }

  return [];
}

function validateOptionalEnum<T extends readonly string[]>(
  input: Record<string, unknown>,
  key: string,
  values: T,
): ExternalWorkBindingValidationError[] {
  const value = input[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value !== 'string' || !values.includes(value)) {
    return [error('unsupported_value', key, `${key} must be one of: ${values.join(', ')}.`)];
  }

  return [];
}

function validateOptionalUrl(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
): ExternalWorkBindingValidationError[] {
  const value = input[key];
  if (value === undefined || value === null || value === '') {
    return [];
  }
  const stringErrors = validateStringValue(value, key, maxLength, false);
  if (stringErrors.length > 0) {
    return stringErrors;
  }

  return isHttpUrl(value)
    ? []
    : [error('invalid_url', key, `${key} must be an http or https URL.`)];
}

function validateRequiredTimestamp(
  input: Record<string, unknown>,
  key: string,
): ExternalWorkBindingValidationError[] {
  const value = input[key];
  if (value === undefined || value === null) {
    return [error('required', key, `${key} is required.`)];
  }

  return validateTimestampValue(value, key);
}

function validateOptionalTimestamp(
  input: Record<string, unknown>,
  key: string,
): ExternalWorkBindingValidationError[] {
  const value = input[key];
  if (value === undefined || value === null || value === '') {
    return [];
  }

  return validateTimestampValue(value, key);
}

function validateTimestampValue(
  value: unknown,
  field: string,
): ExternalWorkBindingValidationError[] {
  if (typeof value !== 'string') {
    return [error('type', field, `${field} must be a timestamp string.`)];
  }
  if (value.trim() === '') {
    return [error('blank', field, `${field} must not be blank.`)];
  }
  if (Number.isNaN(Date.parse(value))) {
    return [error('invalid_timestamp', field, `${field} must be a valid timestamp.`)];
  }

  return [];
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeNullableString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function error(
  code: ExternalWorkBindingValidationErrorCode,
  field: string,
  message: string,
): ExternalWorkBindingValidationError {
  return {
    code,
    field,
    message,
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
