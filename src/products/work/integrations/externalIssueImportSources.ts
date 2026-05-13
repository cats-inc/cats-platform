import type {
  ExternalIssueImportExternalType,
  ExternalIssueImportProvider,
} from './externalIssueImport.js';

export type ExternalIssueImportSource =
  | GitHubIssueImportSource
  | RedmineIssueImportSource
  | BugzillaBugImportSource;

export interface ExternalIssueImportSourceBase {
  provider: ExternalIssueImportProvider;
  externalType: ExternalIssueImportExternalType;
  externalId: string;
  externalUrl: string;
}

export interface GitHubIssueImportSource extends ExternalIssueImportSourceBase {
  provider: 'github';
  externalType: 'issue';
  owner: string;
  repo: string;
  repository: string;
}

export interface RedmineIssueImportSource extends ExternalIssueImportSourceBase {
  provider: 'redmine';
  externalType: 'ticket';
  baseUrl: string;
}

export interface BugzillaBugImportSource extends ExternalIssueImportSourceBase {
  provider: 'bugzilla';
  externalType: 'ticket';
  baseUrl: string;
}

export function inferExternalIssueImportSourceFromUrl(
  value: string,
  selectedProvider?: ExternalIssueImportProvider,
): ExternalIssueImportSource | null {
  const url = parseImportUrl(value);
  if (!url) {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (isGitHubHost(host)) {
    return inferGitHubIssueSource(url);
  }

  if (isBugzillaHost(host) || selectedProvider === 'bugzilla') {
    return inferBugzillaBugSource(url);
  }

  if (isRedmineHost(host) || selectedProvider === 'redmine') {
    return inferRedmineIssueSource(url);
  }

  return null;
}

function inferGitHubIssueSource(url: URL): GitHubIssueImportSource | null {
  const [owner, repo, marker, issueId] = pathParts(url);
  if (!owner || !repo || marker !== 'issues' || !isPositiveInteger(issueId)) {
    return null;
  }

  const externalUrl = `${url.origin}/${owner}/${repo}/issues/${issueId}`;
  return {
    provider: 'github',
    externalType: 'issue',
    externalId: issueId,
    externalUrl,
    owner,
    repo,
    repository: `${owner}/${repo}`,
  };
}

function inferRedmineIssueSource(url: URL): RedmineIssueImportSource | null {
  const parts = pathParts(url);
  const markerIndex = parts.indexOf('issues');
  const issueId = markerIndex >= 0 ? parts[markerIndex + 1] : null;
  if (!isPositiveInteger(issueId)) {
    return null;
  }

  const baseUrl = baseUrlBeforePathMarker(url, 'issues');
  if (!baseUrl) {
    return null;
  }

  return {
    provider: 'redmine',
    externalType: 'ticket',
    externalId: issueId,
    externalUrl: `${baseUrl}/issues/${issueId}`,
    baseUrl,
  };
}

function inferBugzillaBugSource(url: URL): BugzillaBugImportSource | null {
  if (!url.pathname.endsWith('/show_bug.cgi') && url.pathname !== '/show_bug.cgi') {
    return null;
  }

  const bugId = url.searchParams.get('id')?.trim() ?? null;
  if (!isPositiveInteger(bugId)) {
    return null;
  }

  const baseUrl = baseUrlBeforePathMarker(url, 'show_bug.cgi');
  if (!baseUrl) {
    return null;
  }

  return {
    provider: 'bugzilla',
    externalType: 'ticket',
    externalId: bugId,
    externalUrl: `${baseUrl}/show_bug.cgi?id=${bugId}`,
    baseUrl,
  };
}

function baseUrlBeforePathMarker(url: URL, marker: string): string | null {
  const markerWithSlash = `/${marker}`;
  const markerIndex = url.pathname.indexOf(markerWithSlash);
  if (markerIndex < 0) {
    return null;
  }

  const basePath = url.pathname.slice(0, markerIndex);
  const normalizedPath = basePath === '' ? '/' : basePath;
  return new URL(normalizedPath, url.origin).href.replace(/\/+$/u, '');
}

function pathParts(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function isGitHubHost(host: string): boolean {
  return host === 'github.com' || host.endsWith('.github.com');
}

function isRedmineHost(host: string): boolean {
  return host.includes('redmine');
}

function isBugzillaHost(host: string): boolean {
  return host.includes('bugzilla');
}

function isPositiveInteger(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/u.test(value);
}

function parseImportUrl(value: string): URL | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const url = new URL(trimmed);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.username === ''
      && url.password === ''
      ? url
      : null;
  } catch {
    return null;
  }
}
