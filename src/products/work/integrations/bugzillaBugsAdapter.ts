import {
  type ExternalIssueImportDraft,
  toExternalIssueImportDraft,
} from './externalIssueImport.js';

export interface BugzillaBugsAdapter {
  fetchBug(bugId: number | string): Promise<ExternalIssueImportDraft>;
}

export interface BugzillaBugFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
}

export interface BugzillaBugFetchInit {
  method: 'GET';
  headers: Record<string, string>;
}

export type BugzillaBugFetch = (
  url: string,
  init: BugzillaBugFetchInit,
) => Promise<BugzillaBugFetchResponse>;

export interface BugzillaBugsAdapterOptions {
  baseUrl: string;
  apiKey?: string | null;
  userAgent?: string;
  fetchImpl?: BugzillaBugFetch;
}

export type BugzillaBugsAdapterErrorCode =
  | 'bugzilla_bug_fetch_failed'
  | 'bugzilla_bug_invalid_config'
  | 'bugzilla_bug_invalid_id'
  | 'bugzilla_bug_invalid_response'
  | 'fetch_unavailable';

export class BugzillaBugsAdapterError extends Error {
  readonly code: BugzillaBugsAdapterErrorCode;
  readonly status: number | null;

  constructor(
    code: BugzillaBugsAdapterErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = 'BugzillaBugsAdapterError';
    this.code = code;
    this.status = status;
  }
}

export function createBugzillaBugsAdapter(
  options: BugzillaBugsAdapterOptions,
): BugzillaBugsAdapter {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? getGlobalFetch();
  if (!fetchImpl) {
    throw new BugzillaBugsAdapterError(
      'fetch_unavailable',
      'A fetch implementation is required for the Bugzilla Bugs adapter.',
    );
  }

  return {
    async fetchBug(bugId: number | string): Promise<ExternalIssueImportDraft> {
      const normalizedBugId = normalizeBugId(bugId);
      const url = `${baseUrl}/rest/bug/${normalizedBugId}`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': options.userAgent ?? 'cats-platform-work-bugzilla-bugs-adapter',
      };
      const apiKey = options.apiKey?.trim();
      if (apiKey) {
        headers['X-BUGZILLA-API-KEY'] = apiKey;
      }

      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        throw new BugzillaBugsAdapterError(
          'bugzilla_bug_fetch_failed',
          `Bugzilla bug fetch failed with status ${response.status}.`,
          response.status,
        );
      }

      return parseBugzillaBugImportDraft(
        await response.json(),
        baseUrl,
      );
    },
  };
}

export function parseBugzillaBugImportDraft(
  raw: unknown,
  baseUrl: string,
): ExternalIssueImportDraft {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const bugs = isRecord(raw) && Array.isArray(raw.bugs) ? raw.bugs : null;
  const bug = bugs?.[0];
  if (!isRecord(bug)) {
    throw invalidResponse('Bugzilla bug response must contain a non-empty bugs array.');
  }

  const id = positiveIntegerField(bug.id, 'bug.id');
  const resolution = optionalString(bug.resolution);
  const isOpen = typeof bug.is_open === 'boolean' ? bug.is_open : resolution === null;

  return toExternalIssueImportDraft({
    provider: 'bugzilla',
    externalType: 'ticket',
    externalId: String(id),
    externalUrl: `${normalizedBaseUrl}/show_bug.cgi?id=${id}`,
    sourceKey: optionalString(bug.product),
    title: requiredStringField(bug.summary, 'bug.summary'),
    summary: optionalString(bug.description),
    state: isOpen ? 'open' : 'closed',
    labels: normalizeStringList([bug.component, bug.severity, bug.priority]),
    assignees: normalizeStringList([bug.assigned_to]),
    updatedAt: timestampField(bug.last_change_time, 'bug.last_change_time'),
    closedAt: isOpen ? null : timestampField(bug.last_change_time, 'bug.last_change_time'),
  });
}

function normalizeBaseUrl(value: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new BugzillaBugsAdapterError(
      'bugzilla_bug_invalid_config',
      'Bugzilla base URL must not be blank.',
    );
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
    return parsed.href.replace(/\/+$/u, '');
  } catch {
    throw new BugzillaBugsAdapterError(
      'bugzilla_bug_invalid_config',
      'Bugzilla base URL must be an http or https URL.',
    );
  }
}

function normalizeBugId(value: number | string): string {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (/^[1-9]\d*$/u.test(normalized)) {
    return normalized;
  }
  throw new BugzillaBugsAdapterError(
    'bugzilla_bug_invalid_id',
    'Bugzilla bug id must be a positive integer.',
  );
}

function positiveIntegerField(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  throw invalidResponse(`Bugzilla response field ${field} must be a positive integer.`);
}

function requiredStringField(value: unknown, field: string): string {
  const normalized = optionalString(value);
  if (normalized) {
    return normalized;
  }
  throw invalidResponse(`Bugzilla response field ${field} must be a non-blank string.`);
}

function timestampField(value: unknown, field: string): string {
  const normalized = requiredStringField(value, field);
  if (!Number.isNaN(Date.parse(normalized))) {
    return normalized;
  }
  throw invalidResponse(`Bugzilla response field ${field} must be a timestamp string.`);
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

function invalidResponse(message: string): BugzillaBugsAdapterError {
  return new BugzillaBugsAdapterError('bugzilla_bug_invalid_response', message);
}

function getGlobalFetch(): BugzillaBugFetch | undefined {
  return typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis) as unknown as BugzillaBugFetch
    : undefined;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
