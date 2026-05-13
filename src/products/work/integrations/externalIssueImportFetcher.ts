import type {
  ExternalIssueImportDraft,
  ExternalIssueImportProvider,
} from './externalIssueImport.js';
import {
  type ExternalIssueImportSource,
  inferExternalIssueImportSourceFromUrl,
} from './externalIssueImportSources.js';
import {
  type BugzillaBugsAdapterOptions,
  createBugzillaBugsAdapter,
} from './bugzillaBugsAdapter.js';
import {
  type GitHubIssuesAdapterOptions,
  createGitHubIssuesAdapter,
} from './githubIssuesAdapter.js';
import {
  type RedmineIssuesAdapterOptions,
  createRedmineIssuesAdapter,
} from './redmineIssuesAdapter.js';

export interface ExternalIssueImportFetchResult {
  source: ExternalIssueImportSource;
  draft: ExternalIssueImportDraft;
}

export interface ExternalIssueImportFetchOptions {
  selectedProvider?: ExternalIssueImportProvider;
  github?: Omit<GitHubIssuesAdapterOptions, 'owner' | 'repo'>;
  redmine?: Omit<RedmineIssuesAdapterOptions, 'baseUrl'>;
  bugzilla?: Omit<BugzillaBugsAdapterOptions, 'baseUrl'>;
}

export type ExternalIssueImportFetcherErrorCode =
  | 'external_issue_import_source_unsupported';

export class ExternalIssueImportFetcherError extends Error {
  readonly code: ExternalIssueImportFetcherErrorCode;

  constructor(code: ExternalIssueImportFetcherErrorCode, message: string) {
    super(message);
    this.name = 'ExternalIssueImportFetcherError';
    this.code = code;
  }
}

export async function fetchExternalIssueImportDraftFromUrl(
  url: string,
  options: ExternalIssueImportFetchOptions = {},
): Promise<ExternalIssueImportFetchResult> {
  const source = inferExternalIssueImportSourceFromUrl(url, options.selectedProvider);
  if (!source) {
    throw new ExternalIssueImportFetcherError(
      'external_issue_import_source_unsupported',
      'External issue import source URL is unsupported.',
    );
  }

  if (source.provider === 'github') {
    const adapter = createGitHubIssuesAdapter({
      ...options.github,
      owner: source.owner,
      repo: source.repo,
    });
    return {
      source,
      draft: await adapter.fetchIssue(source.externalId),
    };
  }

  if (source.provider === 'redmine') {
    const adapter = createRedmineIssuesAdapter({
      ...options.redmine,
      baseUrl: source.baseUrl,
    });
    return {
      source,
      draft: await adapter.fetchIssue(source.externalId),
    };
  }

  const adapter = createBugzillaBugsAdapter({
    ...options.bugzilla,
    baseUrl: source.baseUrl,
  });
  return {
    source,
    draft: await adapter.fetchBug(source.externalId),
  };
}
