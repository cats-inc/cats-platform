import {
  CoreApiError,
  CoreValidationError,
} from './errors.js';
import type { CoreRecordMetadata } from './types.js';
import {
  type RouteContext,
  readJsonBody,
  sendJson,
} from '../shared/http.js';

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CoreValidationError(`${fieldName} is required`);
  }

  return value;
}

export function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new CoreValidationError(`${fieldName} must be a string`);
  }

  return value;
}

export function readNullableString(
  value: unknown,
  fieldName: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new CoreValidationError(`${fieldName} must be a string or null`);
  }

  return value;
}

export function readNullableNumber(
  value: unknown,
  fieldName: string,
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CoreValidationError(`${fieldName} must be a number or null`);
  }
  if (value < 0) {
    throw new CoreValidationError(
      `${fieldName} must be a non-negative number or null`,
      'bad_request',
    );
  }

  return value;
}

export function readStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new CoreValidationError(`${fieldName} must be an array of strings`);
  }

  return value;
}

export function readMetadata(
  value: unknown,
  fieldName: string,
): CoreRecordMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }

  const metadata = asRecord(value);
  if (!metadata) {
    throw new CoreValidationError(`${fieldName} must be an object`);
  }

  return metadata;
}

export function readEnumValue<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new CoreValidationError(
      `${fieldName} must be one of: ${allowed.join(', ')}`,
    );
  }

  return value as T;
}

export async function readObjectBody<TDependencies>(
  context: Pick<RouteContext<TDependencies>, 'request'>,
): Promise<Record<string, unknown>> {
  const body = await readJsonBody<unknown>(context.request);
  const record = asRecord(body);
  if (!record) {
    throw new CoreValidationError('Request body must be a JSON object');
  }

  return record;
}

export async function readWrappedBody<TDependencies>(
  context: Pick<RouteContext<TDependencies>, 'request'>,
  key: string,
): Promise<Record<string, unknown>> {
  const body = await readObjectBody(context);
  const wrapped = asRecord(body[key]);
  if (!wrapped) {
    throw new CoreValidationError(`${key} payload is required`);
  }

  return wrapped;
}

export function sendCoreError<TDependencies>(
  context: Pick<RouteContext<TDependencies>, 'response'>,
  statusCode: number,
  code: string,
  message: string,
): void {
  sendJson(context.response, statusCode, {
    error: {
      code,
      message,
    },
  });
}

export function handleCoreError<TDependencies>(
  context: Pick<RouteContext<TDependencies>, 'response'>,
  error: unknown,
): void {
  if (error instanceof CoreApiError) {
    sendCoreError(context, error.statusCode, error.code, error.message);
    return;
  }

  if (error instanceof SyntaxError) {
    sendCoreError(context, 400, 'invalid_json', 'Request body must be valid JSON');
    return;
  }

  sendCoreError(context, 500, 'internal_error', 'Internal server error');
}
