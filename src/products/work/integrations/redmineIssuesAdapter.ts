import {
  type ExternalIssueImportDraft,
  toExternalIssueImportDraft,
} from './externalIssueImport.js';

export interface RedmineIssuesAdapter {
  fetchIssue(issueId: number | string): Promise<ExternalIssueImportDraft>;
}

export interface RedmineIssueFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
}

export interface RedmineIssueFetchInit {
  method: 'GET';
  headers: Record<string, string>;
}

export type RedmineIssueFetch = (
  url: string,
  init: RedmineIssueFetchInit,
) => Promise<RedmineIssueFetchResponse>;

export interface RedmineIssuesAdapterOptions {
  baseUrl: string;
  apiKey?: string | null;
  userAgent?: string;
  fetchImpl?: RedmineIssueFetch;
}

export type RedmineIssuesAdapterErrorCode =
  | 'fetch_unavailable'
  | 'redmine_issue_fetch_failed'
  | 'redmine_issue_invalid_config'
  | 'redmine_issue_invalid_id'
  | 'redmine_issue_invalid_response';

export class RedmineIssuesAdapterError extends Error {
  readonly code: RedmineIssuesAdapterErrorCode;
  readonly status: number | null;

  constructor(
    code: RedmineIssuesAdapterErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = 'RedmineIssuesAdapterError';
    this.code = code;
    this.status = status;
  }
}

export function createRedmineIssuesAdapter(
  options: RedmineIssuesAdapterOptions,
): RedmineIssuesAdapter {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? getGlobalFetch();
  if (!fetchImpl) {
    throw new RedmineIssuesAdapterError(
      'fetch_unavailable',
      'A fetch implementation is required for the Redmine Issues adapter.',
    );
  }

  return {
    async fetchIssue(issueId: number | string): Promise<ExternalIssueImportDraft> {
      const normalizedIssueId = normalizeIssueId(issueId);
      const url = `${baseUrl}/issues/${normalizedIssueId}.json`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': options.userAgent ?? 'cats-platform-work-redmine-issues-adapter',
      };
      const apiKey = options.apiKey?.trim();
      if (apiKey) {
        headers['X-Redmine-API-Key'] = apiKey;
      }

      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        throw new RedmineIssuesAdapterError(
          'redmine_issue_fetch_failed',
          `Redmine issue fetch failed with status ${response.status}.`,
          response.status,
        );
      }

      return parseRedmineIssueImportDraft(
        await response.json(),
        baseUrl,
      );
    },
  };
}

export function parseRedmineIssueImportDraft(
  raw: unknown,
  baseUrl: string,
): ExternalIssueImportDraft {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const root = isRecord(raw) ? raw.issue : null;
  if (!isRecord(root)) {
    throw invalidResponse('Redmine issue response must contain an issue object.');
  }

  const id = positiveIntegerField(root.id, 'issue.id');
  const project = isRecord(root.project) ? root.project : null;
  const assignedTo = isRecord(root.assigned_to) ? root.assigned_to : null;
  const closedAt = nullableTimestampField(root.closed_on, 'issue.closed_on');

  return toExternalIssueImportDraft({
    provider: 'redmine',
    externalType: 'ticket',
    externalId: String(id),
    externalUrl: `${normalizedBaseUrl}/issues/${id}`,
    sourceKey: project ? optionalString(project.name) ?? optionalString(project.id) : null,
    title: requiredStringField(root.subject, 'issue.subject'),
    summary: optionalString(root.description),
    state: closedAt ? 'closed' : 'open',
    labels: [],
    assignees: assignedTo ? normalizeStringList([assignedTo.name]) : [],
    updatedAt: timestampField(root.updated_on, 'issue.updated_on'),
    closedAt,
  });
}

function normalizeBaseUrl(value: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new RedmineIssuesAdapterError(
      'redmine_issue_invalid_config',
      'Redmine base URL must not be blank.',
    );
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
    return parsed.href.replace(/\/+$/u, '');
  } catch {
    throw new RedmineIssuesAdapterError(
      'redmine_issue_invalid_config',
      'Redmine base URL must be an http or https URL.',
    );
  }
}

function normalizeIssueId(value: number | string): string {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (/^[1-9]\d*$/u.test(normalized)) {
    return normalized;
  }
  throw new RedmineIssuesAdapterError(
    'redmine_issue_invalid_id',
    'Redmine issue id must be a positive integer.',
  );
}

function positiveIntegerField(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  throw invalidResponse(`Redmine response field ${field} must be a positive integer.`);
}

function requiredStringField(value: unknown, field: string): string {
  const normalized = optionalString(value);
  if (normalized) {
    return normalized;
  }
  throw invalidResponse(`Redmine response field ${field} must be a non-blank string.`);
}

function timestampField(value: unknown, field: string): string {
  const normalized = requiredStringField(value, field);
  if (!Number.isNaN(Date.parse(normalized))) {
    return normalized;
  }
  throw invalidResponse(`Redmine response field ${field} must be a timestamp string.`);
}

function nullableTimestampField(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return timestampField(value, field);
}

function normalizeStringList(values: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = optionalString(value);
    if (normalized && !seen.has(normalized)) {
      result.push(normalized);
      seen.add(normalized);
    }
  }
  return result;
}

function optionalString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function invalidResponse(message: string): RedmineIssuesAdapterError {
  return new RedmineIssuesAdapterError('redmine_issue_invalid_response', message);
}

function getGlobalFetch(): RedmineIssueFetch | undefined {
  return typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis) as unknown as RedmineIssueFetch
    : undefined;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
