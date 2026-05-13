import type {
  ExternalWorkBindingExternalType,
  ExternalWorkBindingProvider,
  ExternalWorkBindingSyncDirection,
} from '../shared/externalWorkBinding.js';

export const EXTERNAL_ISSUE_IMPORT_METADATA_KEY = 'externalIssueImport' as const;

export type ExternalIssueImportProvider = Extract<
  ExternalWorkBindingProvider,
  'github' | 'gitlab' | 'gitea' | 'redmine' | 'bugzilla'
>;

export type ExternalIssueImportExternalType = Extract<
  ExternalWorkBindingExternalType,
  'issue' | 'ticket'
>;

export type ExternalIssueImportState = 'open' | 'closed';

export interface ExternalIssueImportSnapshot {
  provider: ExternalIssueImportProvider;
  externalType: ExternalIssueImportExternalType;
  externalId: string;
  externalUrl: string;
  sourceKey: string | null;
  title: string;
  summary: string | null;
  state: ExternalIssueImportState;
  labels: string[];
  assignees: string[];
  updatedAt: string;
  closedAt: string | null;
}

export interface ExternalIssueImportMetadata {
  provider: ExternalIssueImportProvider;
  externalType: ExternalIssueImportExternalType;
  externalId: string;
  externalUrl: string;
  sourceKey: string | null;
  state: ExternalIssueImportState;
  labels: string[];
  assignees: string[];
  sourceUpdatedAt: string;
  sourceClosedAt: string | null;
}

export interface ExternalIssueImportDraft {
  title: string;
  summary: string | null;
  status: 'planned';
  metadata: {
    [EXTERNAL_ISSUE_IMPORT_METADATA_KEY]: ExternalIssueImportMetadata;
  };
  bindingDefaults: {
    provider: ExternalIssueImportProvider;
    externalType: ExternalIssueImportExternalType;
    externalId: string;
    externalUrl: string;
    syncDirection: Extract<ExternalWorkBindingSyncDirection, 'pull'>;
    externalUpdatedAt: string;
  };
}

export function toExternalIssueImportDraft(
  issue: ExternalIssueImportSnapshot,
): ExternalIssueImportDraft {
  return {
    title: issue.title,
    summary: issue.summary,
    status: 'planned',
    metadata: {
      [EXTERNAL_ISSUE_IMPORT_METADATA_KEY]: {
        provider: issue.provider,
        externalType: issue.externalType,
        externalId: issue.externalId,
        externalUrl: issue.externalUrl,
        sourceKey: issue.sourceKey,
        state: issue.state,
        labels: [...issue.labels],
        assignees: [...issue.assignees],
        sourceUpdatedAt: issue.updatedAt,
        sourceClosedAt: issue.closedAt,
      },
    },
    bindingDefaults: {
      provider: issue.provider,
      externalType: issue.externalType,
      externalId: issue.externalId,
      externalUrl: issue.externalUrl,
      syncDirection: 'pull',
      externalUpdatedAt: issue.updatedAt,
    },
  };
}
