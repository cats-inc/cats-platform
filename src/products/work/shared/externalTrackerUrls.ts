import type {
  ExternalWorkBindingExternalType,
  ExternalWorkBindingProvider,
} from './externalWorkBinding.js';

export interface ExternalTrackerUrlInference {
  externalId?: string;
  externalType?: ExternalWorkBindingExternalType;
  provider?: ExternalWorkBindingProvider;
}

export function inferExternalTrackerBindingFromUrl(
  value: string,
  selectedProvider?: ExternalWorkBindingProvider,
): ExternalTrackerUrlInference | null {
  const url = parseUrl(value);
  if (!url) {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const pathParts = url.pathname.split('/').filter(Boolean);
  const hostProvider = inferProviderFromHost(host);

  if (hostProvider === 'github') {
    return inferIssuePath(pathParts, 'github', ['issues']);
  }

  if (hostProvider === 'gitlab') {
    return inferGitlabIssue(pathParts);
  }

  const bugzillaId = inferBugzillaId(url);
  if (bugzillaId) {
    return {
      externalId: bugzillaId,
      externalType: 'ticket',
      provider: 'bugzilla',
    };
  }

  const provider = hostProvider ?? selectedProvider;
  if (provider === 'redmine') {
    return inferRedminePath(pathParts);
  }
  if (provider === 'gitea') {
    return inferIssuePath(pathParts, 'gitea', ['issues']);
  }
  if (provider === 'gitlab') {
    return inferGitlabIssue(pathParts);
  }
  if (provider === 'github') {
    return inferIssuePath(pathParts, 'github', ['issues']);
  }

  return null;
}

function inferProviderFromHost(
  host: string,
): ExternalWorkBindingProvider | null {
  if (host === 'github.com' || host.endsWith('.github.com')) {
    return 'github';
  }
  if (host === 'gitlab.com' || host.endsWith('.gitlab.com')) {
    return 'gitlab';
  }
  if (host.includes('bugzilla')) {
    return 'bugzilla';
  }
  if (host.includes('redmine')) {
    return 'redmine';
  }
  if (host.includes('gitea')) {
    return 'gitea';
  }
  return null;
}

function inferGitlabIssue(
  pathParts: readonly string[],
): ExternalTrackerUrlInference | null {
  const dashIndex = pathParts.indexOf('-');
  if (dashIndex >= 0 && pathParts[dashIndex + 1] === 'issues') {
    const externalId = pathParts[dashIndex + 2];
    return externalId
      ? { externalId, externalType: 'issue', provider: 'gitlab' }
      : null;
  }

  return inferIssuePath(pathParts, 'gitlab', ['issues']);
}

function inferRedminePath(
  pathParts: readonly string[],
): ExternalTrackerUrlInference | null {
  const issue = inferIssuePath(pathParts, 'redmine', ['issues']);
  if (issue) {
    return {
      ...issue,
      externalType: 'ticket',
    };
  }

  const projectIndex = pathParts.indexOf('projects');
  const externalId = projectIndex >= 0 ? pathParts[projectIndex + 1] : null;
  return externalId
    ? { externalId, externalType: 'project', provider: 'redmine' }
    : null;
}

function inferIssuePath(
  pathParts: readonly string[],
  provider: ExternalWorkBindingProvider,
  issueMarkers: readonly string[],
): ExternalTrackerUrlInference | null {
  const issueIndex = pathParts.findIndex((part) => issueMarkers.includes(part));
  const externalId = issueIndex >= 0 ? pathParts[issueIndex + 1] : null;
  return externalId
    ? { externalId, externalType: 'issue', provider }
    : null;
}

function inferBugzillaId(url: URL): string | null {
  if (!url.pathname.endsWith('/show_bug.cgi') && url.pathname !== '/show_bug.cgi') {
    return null;
  }
  return url.searchParams.get('id')?.trim() || null;
}

function parseUrl(value: string): URL | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url
      : null;
  } catch {
    return null;
  }
}
