import type {
  ExternalWorkBindingExternalType,
  ExternalWorkBindingProvider,
  ExternalWorkBindingSyncDirection,
} from '../shared/externalWorkBinding.js';

export const GITHUB_ISSUE_IMPORT_METADATA_KEY = 'githubIssueImport' as const;

export type GitHubIssueState = 'open' | 'closed';

export interface GitHubIssueSnapshot {
  provider: Extract<ExternalWorkBindingProvider, 'github'>;
  externalType: Extract<ExternalWorkBindingExternalType, 'issue'>;
  externalId: string;
  externalUrl: string;
  repository: string;
  number: number;
  title: string;
  body: string | null;
  state: GitHubIssueState;
  labels: string[];
  assignees: string[];
  updatedAt: string;
  closedAt: string | null;
}

export interface GitHubIssueImportDraft {
  title: string;
  summary: string | null;
  status: 'planned';
  metadata: {
    [GITHUB_ISSUE_IMPORT_METADATA_KEY]: {
      provider: Extract<ExternalWorkBindingProvider, 'github'>;
      repository: string;
      externalId: string;
      externalUrl: string;
      state: GitHubIssueState;
      labels: string[];
      assignees: string[];
      sourceUpdatedAt: string;
      sourceClosedAt: string | null;
    };
  };
  bindingDefaults: {
    provider: Extract<ExternalWorkBindingProvider, 'github'>;
    externalType: Extract<ExternalWorkBindingExternalType, 'issue'>;
    externalId: string;
    externalUrl: string;
    syncDirection: Extract<ExternalWorkBindingSyncDirection, 'pull'>;
    externalUpdatedAt: string;
  };
}

export interface GitHubIssueExportInput {
  title: string;
  summary?: string | null;
  labels?: string[];
  assignees?: string[];
}

export interface GitHubIssueExportPayload {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface GitHubIssuesAdapter {
  fetchIssue(issueNumber: number | string): Promise<GitHubIssueImportDraft>;
  buildCreateIssuePayload(input: GitHubIssueExportInput): GitHubIssueExportPayload;
}

export interface GitHubIssueFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
}

export interface GitHubIssueFetchInit {
  method: 'GET';
  headers: Record<string, string>;
}

export type GitHubIssueFetch = (
  url: string,
  init: GitHubIssueFetchInit,
) => Promise<GitHubIssueFetchResponse>;

export interface GitHubIssuesAdapterOptions {
  owner: string;
  repo: string;
  token?: string | null;
  apiBaseUrl?: string;
  userAgent?: string;
  fetchImpl?: GitHubIssueFetch;
}

export type GitHubIssuesAdapterErrorCode =
  | 'fetch_unavailable'
  | 'github_issue_fetch_failed'
  | 'github_issue_invalid_config'
  | 'github_issue_invalid_export_payload'
  | 'github_issue_invalid_number'
  | 'github_issue_invalid_response'
  | 'github_pull_request_not_supported';

export class GitHubIssuesAdapterError extends Error {
  readonly code: GitHubIssuesAdapterErrorCode;
  readonly status: number | null;

  constructor(
    code: GitHubIssuesAdapterErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = 'GitHubIssuesAdapterError';
    this.code = code;
    this.status = status;
  }
}

export function createGitHubIssuesAdapter(
  options: GitHubIssuesAdapterOptions,
): GitHubIssuesAdapter {
  const owner = normalizeRequiredSegment(options.owner, 'owner');
  const repo = normalizeRequiredSegment(options.repo, 'repo');
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl ?? 'https://api.github.com');
  const fetchImpl = options.fetchImpl ?? getGlobalFetch();
  if (!fetchImpl) {
    throw new GitHubIssuesAdapterError(
      'fetch_unavailable',
      'A fetch implementation is required for the GitHub Issues adapter.',
    );
  }

  return {
    async fetchIssue(issueNumber: number | string): Promise<GitHubIssueImportDraft> {
      const normalizedIssueNumber = normalizeIssueNumber(issueNumber);
      const url = [
        apiBaseUrl,
        'repos',
        encodeURIComponent(owner),
        encodeURIComponent(repo),
        'issues',
        normalizedIssueNumber,
      ].join('/');
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': options.userAgent ?? 'cats-platform-work-github-issues-adapter',
      };
      const token = options.token?.trim();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        throw new GitHubIssuesAdapterError(
          'github_issue_fetch_failed',
          `GitHub issue fetch failed with status ${response.status}.`,
          response.status,
        );
      }

      const snapshot = parseGitHubIssueSnapshot(
        await response.json(),
        `${owner}/${repo}`,
      );
      return toGitHubIssueImportDraft(snapshot);
    },

    buildCreateIssuePayload: buildGitHubIssueExportPayload,
  };
}

export function buildGitHubIssueExportPayload(
  input: GitHubIssueExportInput,
): GitHubIssueExportPayload {
  const title = normalizeString(input.title);
  if (!title) {
    throw new GitHubIssuesAdapterError(
      'github_issue_invalid_export_payload',
      'GitHub issue export title must not be blank.',
    );
  }

  const payload: GitHubIssueExportPayload = { title };
  const body = normalizeString(input.summary ?? null);
  if (body) {
    payload.body = body;
  }
  const labels = normalizeStringList(input.labels ?? []);
  if (labels.length > 0) {
    payload.labels = labels;
  }
  const assignees = normalizeStringList(input.assignees ?? []);
  if (assignees.length > 0) {
    payload.assignees = assignees;
  }

  return payload;
}

export function parseGitHubIssueSnapshot(
  raw: unknown,
  repository: string,
): GitHubIssueSnapshot {
  if (!isRecord(raw)) {
    throw invalidResponse('GitHub issue response must be an object.');
  }
  if (isRecord(raw.pull_request)) {
    throw new GitHubIssuesAdapterError(
      'github_pull_request_not_supported',
      'GitHub pull request issue rows are not supported by this Work adapter spike.',
    );
  }

  const number = numberField(raw.number, 'number');
  const title = requiredStringField(raw.title, 'title');
  const state = stateField(raw.state);
  const externalUrl = urlField(raw.html_url, 'html_url');
  const updatedAt = timestampField(raw.updated_at, 'updated_at');
  const closedAt = nullableTimestampField(raw.closed_at, 'closed_at');

  return {
    provider: 'github',
    externalType: 'issue',
    externalId: String(number),
    externalUrl,
    repository,
    number,
    title,
    body: nullableString(raw.body),
    state,
    labels: labelNames(raw.labels),
    assignees: assigneeLogins(raw.assignees),
    updatedAt,
    closedAt,
  };
}

export function toGitHubIssueImportDraft(
  issue: GitHubIssueSnapshot,
): GitHubIssueImportDraft {
  return {
    title: issue.title,
    summary: issue.body,
    status: 'planned',
    metadata: {
      [GITHUB_ISSUE_IMPORT_METADATA_KEY]: {
        provider: 'github',
        repository: issue.repository,
        externalId: issue.externalId,
        externalUrl: issue.externalUrl,
        state: issue.state,
        labels: issue.labels,
        assignees: issue.assignees,
        sourceUpdatedAt: issue.updatedAt,
        sourceClosedAt: issue.closedAt,
      },
    },
    bindingDefaults: {
      provider: 'github',
      externalType: 'issue',
      externalId: issue.externalId,
      externalUrl: issue.externalUrl,
      syncDirection: 'pull',
      externalUpdatedAt: issue.updatedAt,
    },
  };
}

function normalizeRequiredSegment(value: string, field: string): string {
  const normalized = normalizeString(value);
  if (!normalized || normalized.includes('/')) {
    throw new GitHubIssuesAdapterError(
      'github_issue_invalid_config',
      `GitHub ${field} must be a non-blank single path segment.`,
    );
  }
  return normalized;
}

function normalizeApiBaseUrl(value: string): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new GitHubIssuesAdapterError(
      'github_issue_invalid_config',
      'GitHub API base URL must not be blank.',
    );
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
    return parsed.href.replace(/\/+$/u, '');
  } catch {
    throw new GitHubIssuesAdapterError(
      'github_issue_invalid_config',
      'GitHub API base URL must be an http or https URL.',
    );
  }
}

function normalizeIssueNumber(value: number | string): string {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (/^[1-9]\d*$/u.test(normalized)) {
    return normalized;
  }
  throw new GitHubIssuesAdapterError(
    'github_issue_invalid_number',
    'GitHub issue number must be a positive integer.',
  );
}

function numberField(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  throw invalidResponse(`GitHub issue response field ${field} must be a positive integer.`);
}

function requiredStringField(value: unknown, field: string): string {
  const normalized = normalizeString(value);
  if (normalized) {
    return normalized;
  }
  throw invalidResponse(`GitHub issue response field ${field} must be a non-blank string.`);
}

function stateField(value: unknown): GitHubIssueState {
  if (value === 'open' || value === 'closed') {
    return value;
  }
  throw invalidResponse('GitHub issue response field state must be open or closed.');
}

function urlField(value: unknown, field: string): string {
  const normalized = requiredStringField(value, field);
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Report through the shared invalid-response path below.
  }
  throw invalidResponse(`GitHub issue response field ${field} must be an http or https URL.`);
}

function timestampField(value: unknown, field: string): string {
  const normalized = requiredStringField(value, field);
  if (!Number.isNaN(Date.parse(normalized))) {
    return normalized;
  }
  throw invalidResponse(`GitHub issue response field ${field} must be a timestamp string.`);
}

function nullableTimestampField(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return timestampField(value, field);
}

function labelNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return normalizeStringList(value.map((entry) => {
    if (typeof entry === 'string') {
      return entry;
    }
    return isRecord(entry) ? entry.name : null;
  }));
}

function assigneeLogins(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return normalizeStringList(value.map((entry) => (
    isRecord(entry) ? entry.login : null
  )));
}

function normalizeStringList(values: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized && !seen.has(normalized)) {
      result.push(normalized);
      seen.add(normalized);
    }
  }
  return result;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nullableString(value: unknown): string | null {
  return normalizeString(value);
}

function invalidResponse(message: string): GitHubIssuesAdapterError {
  return new GitHubIssuesAdapterError('github_issue_invalid_response', message);
}

function getGlobalFetch(): GitHubIssueFetch | undefined {
  return typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis) as unknown as GitHubIssueFetch
    : undefined;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
