import type { WorkToolPhase } from './workToolSurface.js';
import {
  inferExternalTrackerBindingFromUrl,
  type ExternalTrackerUrlInference,
} from './externalTrackerUrls.js';

export type WorkExternalBindingOperation = 'link' | 'unlink';
export type WorkExternalBindingLocalKind = 'project' | 'work_item';

export interface ResolveWorkExternalBindingPhaseInput {
  rawText: string | null | undefined;
}

export interface WorkExternalBindingPhaseMatch {
  kind: 'matched';
  phase: Extract<WorkToolPhase, 'external_tracker_binding'>;
  confidence: 'high';
  reasonCode: string;
  normalizedText: string;
  operation: WorkExternalBindingOperation;
  localKind: WorkExternalBindingLocalKind;
  localId: string;
  externalUrl: string;
  external: ExternalTrackerUrlInference;
  matchedActionCues: string[];
}

export interface WorkExternalBindingPhaseNone {
  kind: 'none';
  phase: null;
  reasonCode: string;
  normalizedText: string;
}

export type WorkExternalBindingPhaseResolution =
  | WorkExternalBindingPhaseMatch
  | WorkExternalBindingPhaseNone;

const LINK_ACTION_CUE_PATTERNS = [
  /\blink\b/u,
  /\bconnect\b/u,
  /\battach\b/u,
  /\bbind\b/u,
  /連結/u,
  /掛上/u,
] as const;

const UNLINK_ACTION_CUE_PATTERNS = [
  /\bunlink\b/u,
  /\bdisconnect\b/u,
  /\bremove\s+link\b/u,
  /\bunbind\b/u,
  /解除連結/u,
  /取消連結/u,
] as const;

const WORK_ITEM_ID_PATTERN = /\bwork-item-[a-z0-9][a-z0-9_-]*\b/u;
const PROJECT_ID_PATTERN = /\bproject-[a-z0-9][a-z0-9_-]*\b/u;
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/iu;

export function resolveWorkExternalBindingPhase(
  input: ResolveWorkExternalBindingPhaseInput,
): WorkExternalBindingPhaseResolution {
  const normalizedText = normalizeText(input.rawText);
  if (!normalizedText) {
    return none('empty_text', normalizedText);
  }
  if (normalizedText.startsWith('/')) {
    return none('slash_command', normalizedText);
  }

  const operation = resolveOperation(normalizedText);
  if (!operation) {
    return none('missing_external_binding_action_cue', normalizedText);
  }

  const local = resolveLocalRef(normalizedText);
  if (!local) {
    return none('missing_local_work_ref', normalizedText);
  }

  const externalUrl = extractHttpUrl(input.rawText ?? '');
  if (!externalUrl) {
    return none('missing_external_tracker_url', normalizedText);
  }

  const external = inferExternalTrackerBindingFromUrl(externalUrl);
  if (!external?.provider || !external.externalId) {
    return none('unsupported_external_tracker_url', normalizedText);
  }

  return {
    kind: 'matched',
    phase: 'external_tracker_binding',
    confidence: 'high',
    reasonCode: `${operation}_${local.localKind}_external_tracker`,
    normalizedText,
    operation,
    localKind: local.localKind,
    localId: local.localId,
    externalUrl,
    external,
    matchedActionCues: collectMatches(
      normalizedText,
      operation === 'link' ? LINK_ACTION_CUE_PATTERNS : UNLINK_ACTION_CUE_PATTERNS,
    ),
  };
}

function resolveOperation(text: string): WorkExternalBindingOperation | null {
  if (collectMatches(text, UNLINK_ACTION_CUE_PATTERNS).length > 0) {
    return 'unlink';
  }
  if (collectMatches(text, LINK_ACTION_CUE_PATTERNS).length > 0) {
    return 'link';
  }
  return null;
}

function resolveLocalRef(
  text: string,
): { localKind: WorkExternalBindingLocalKind; localId: string } | null {
  const workItemMatch = WORK_ITEM_ID_PATTERN.exec(text);
  if (workItemMatch?.[0]) {
    return { localKind: 'work_item', localId: workItemMatch[0] };
  }

  const projectMatch = PROJECT_ID_PATTERN.exec(text);
  if (projectMatch?.[0]) {
    return { localKind: 'project', localId: projectMatch[0] };
  }

  return null;
}

function extractHttpUrl(rawText: string): string | null {
  const match = HTTP_URL_PATTERN.exec(rawText);
  return match?.[0]?.replace(/[),.，。]+$/u, '') ?? null;
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
): WorkExternalBindingPhaseNone {
  return {
    kind: 'none',
    phase: null,
    reasonCode,
    normalizedText,
  };
}
