import {
  inferExternalTrackerBindingFromUrl,
  type ExternalTrackerUrlInference,
} from './externalTrackerUrls.js';
import type {
  WorkExternalImportIssueProvider,
  WorkToolPhase,
} from './workToolSurface.js';

export interface ResolveWorkExternalIssueImportPhaseInput {
  rawText: string | null | undefined;
}

export interface WorkExternalIssueImportPhaseMatch {
  kind: 'matched';
  phase: Extract<WorkToolPhase, 'external_tracker_binding'>;
  confidence: 'high';
  reasonCode: 'import_external_issue';
  normalizedText: string;
  externalUrl: string;
  external: ExternalTrackerUrlInference & {
    provider: WorkExternalImportIssueProvider;
    externalId: string;
  };
  matchedActionCues: string[];
}

export interface WorkExternalIssueImportPhaseNone {
  kind: 'none';
  phase: null;
  reasonCode: string;
  normalizedText: string;
}

export type WorkExternalIssueImportPhaseResolution =
  | WorkExternalIssueImportPhaseMatch
  | WorkExternalIssueImportPhaseNone;

const IMPORT_ACTION_CUE_PATTERNS = [
  /\bimport\b/u,
  /\bingest\b/u,
  /\bpull\s+in\b/u,
  /\bbring\s+in\b/u,
  /\bfetch\b/u,
  /\bcopy\s+from\b/u,
  /匯入/u,
  /導入/u,
  /拉進/u,
  /[匯導拉加收撈][進入]/u,
  /掛上來/u,
] as const;

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'\])]+/iu;

export function resolveWorkExternalIssueImportPhase(
  input: ResolveWorkExternalIssueImportPhaseInput,
): WorkExternalIssueImportPhaseResolution {
  const normalizedText = normalizeText(input.rawText);
  if (!normalizedText) {
    return none('empty_text', normalizedText);
  }
  if (normalizedText.startsWith('/')) {
    return none('slash_command', normalizedText);
  }

  const matchedActionCues = collectMatches(normalizedText, IMPORT_ACTION_CUE_PATTERNS);
  if (matchedActionCues.length === 0) {
    return none('missing_external_issue_import_action_cue', normalizedText);
  }

  const externalUrl = extractHttpUrl(input.rawText ?? '');
  if (!externalUrl) {
    return none('missing_external_tracker_url', normalizedText);
  }

  const external = inferExternalTrackerBindingFromUrl(externalUrl);
  if (
    !external
    || !isImportProvider(external.provider)
    || !external.externalId
    || external.externalType === 'project'
  ) {
    return none('unsupported_external_issue_import_url', normalizedText);
  }

  return {
    kind: 'matched',
    phase: 'external_tracker_binding',
    confidence: 'high',
    reasonCode: 'import_external_issue',
    normalizedText,
    externalUrl,
    external: {
      ...external,
      provider: external.provider,
      externalId: external.externalId,
    },
    matchedActionCues,
  };
}

function isImportProvider(
  provider: ExternalTrackerUrlInference['provider'],
): provider is WorkExternalImportIssueProvider {
  return provider === 'github' || provider === 'redmine' || provider === 'bugzilla';
}

function extractHttpUrl(rawText: string): string | null {
  const match = HTTP_URL_PATTERN.exec(rawText);
  return match?.[0]?.replace(/[\]),.，。]+$/u, '') ?? null;
}

function normalizeText(rawText: string | null | undefined): string {
  return typeof rawText === 'string'
    ? rawText.trim().replace(/\s+/gu, ' ').toLowerCase()
    : '';
}

function collectMatches(text: string, patterns: readonly RegExp[]): string[] {
  return patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
}

function none(
  reasonCode: string,
  normalizedText: string,
): WorkExternalIssueImportPhaseNone {
  return {
    kind: 'none',
    phase: null,
    reasonCode,
    normalizedText,
  };
}
