import type { WorkToolPhase } from './workToolSurface.js';

export type WorkExecutionPreparationConfidence = 'medium' | 'high';
export type WorkExecutionPreparationScope =
  | 'explicit_work_items'
  | 'visible_selection'
  | 'active_context';

export interface ResolveWorkExecutionPreparationPhaseInput {
  rawText: string | null | undefined;
  addressedBossCat?: boolean;
  activeWorkItemIds?: string[];
  visibleWorkItemIds?: string[];
}

export interface WorkExecutionPreparationPhaseMatch {
  kind: 'matched';
  phase: Extract<WorkToolPhase, 'execution_preparation'>;
  confidence: WorkExecutionPreparationConfidence;
  reasonCode: string;
  normalizedText: string;
  scope: WorkExecutionPreparationScope;
  workItemRefs: string[];
  matchedBossCues: string[];
  matchedActionCues: string[];
  matchedScopeCues: string[];
}

export interface WorkExecutionPreparationPhaseNone {
  kind: 'none';
  phase: null;
  reasonCode: string;
  normalizedText: string;
}

export type WorkExecutionPreparationPhaseResolution =
  | WorkExecutionPreparationPhaseMatch
  | WorkExecutionPreparationPhaseNone;

const BOSS_CAT_CUE_PATTERNS = [
  /\bboss\s*cat\b/u,
  /\bboss\b/u,
  /老闆貓/u,
] as const;

const EXECUTION_ACTION_CUE_PATTERNS = [
  /\bstart(?:ing)?\b/u,
  /\bbegin\b/u,
  /\bkick\s*off\b/u,
  /\bwork\s+through\b/u,
  /\bexecute\b/u,
  /\bdelegate\b/u,
  /\bpick\s+up\b/u,
  /開始/u,
  /開工/u,
  /執行/u,
  /處理/u,
  /著手/u,
  /做起來/u,
  /逐一/u,
] as const;

const WORK_SCOPE_CUE_PATTERNS = [
  /\bwork\s*items?\b/u,
  /\btodos?\b/u,
  /\btasks?\b/u,
  /\bbacklog\b/u,
  /\bthese\b/u,
  /\bthis\b/u,
  /待辦/u,
  /事項/u,
  /任務/u,
  /這些/u,
  /這個/u,
  /逐一/u,
] as const;

const WORK_ITEM_ID_PATTERN = /\bwork-item-[a-z0-9][a-z0-9_-]*\b/gu;

export function resolveWorkExecutionPreparationPhase(
  input: ResolveWorkExecutionPreparationPhaseInput,
): WorkExecutionPreparationPhaseResolution {
  const normalizedText = normalizeText(input.rawText);
  if (!normalizedText) {
    return none('empty_text', normalizedText);
  }
  if (normalizedText.startsWith('/')) {
    return none('slash_command', normalizedText);
  }

  const matchedBossCues = input.addressedBossCat === true
    ? ['addressed_boss_cat']
    : collectMatches(normalizedText, BOSS_CAT_CUE_PATTERNS);
  if (matchedBossCues.length === 0) {
    return none('missing_boss_cat_address', normalizedText);
  }

  const matchedActionCues = collectMatches(normalizedText, EXECUTION_ACTION_CUE_PATTERNS);
  if (matchedActionCues.length === 0) {
    return none('missing_execution_action_cue', normalizedText);
  }

  const explicitWorkItemRefs = collectWorkItemRefs(
    normalizedText,
    input.visibleWorkItemIds ?? [],
  );
  const activeWorkItemIds = uniqueNonEmpty(input.activeWorkItemIds ?? []);
  const visibleWorkItemIds = uniqueNonEmpty(input.visibleWorkItemIds ?? []);
  const matchedScopeCues = collectMatches(normalizedText, WORK_SCOPE_CUE_PATTERNS);
  const scope = resolveScope({
    explicitWorkItemRefs,
    activeWorkItemIds,
    visibleWorkItemIds,
    matchedScopeCues,
  });
  if (scope === null) {
    return none('missing_work_item_scope', normalizedText);
  }

  const workItemRefs = resolveWorkItemRefs({
    scope,
    explicitWorkItemRefs,
    activeWorkItemIds,
    visibleWorkItemIds,
  });

  return {
    kind: 'matched',
    phase: 'execution_preparation',
    confidence: workItemRefs.length > 0 ? 'high' : 'medium',
    reasonCode: `${scope}_execution_request`,
    normalizedText,
    scope,
    workItemRefs,
    matchedBossCues,
    matchedActionCues,
    matchedScopeCues,
  };
}

function resolveScope(input: {
  explicitWorkItemRefs: string[];
  activeWorkItemIds: string[];
  visibleWorkItemIds: string[];
  matchedScopeCues: string[];
}): WorkExecutionPreparationScope | null {
  if (input.explicitWorkItemRefs.length > 0) {
    return 'explicit_work_items';
  }
  if (input.matchedScopeCues.length > 0 && input.visibleWorkItemIds.length > 0) {
    return 'visible_selection';
  }
  if (input.matchedScopeCues.length > 0 && input.activeWorkItemIds.length > 0) {
    return 'active_context';
  }

  return null;
}

function resolveWorkItemRefs(input: {
  scope: WorkExecutionPreparationScope;
  explicitWorkItemRefs: string[];
  activeWorkItemIds: string[];
  visibleWorkItemIds: string[];
}): string[] {
  switch (input.scope) {
    case 'explicit_work_items':
      return input.explicitWorkItemRefs;
    case 'visible_selection':
      return input.visibleWorkItemIds;
    case 'active_context':
      return input.activeWorkItemIds;
    default: {
      const exhaustive: never = input.scope;
      return exhaustive;
    }
  }
}

function collectWorkItemRefs(text: string, visibleWorkItemIds: string[]): string[] {
  return uniqueNonEmpty([
    ...Array.from(text.matchAll(WORK_ITEM_ID_PATTERN)).map((match) => match[0]),
    ...visibleWorkItemIds.filter((id) => text.includes(id.toLowerCase())),
  ]);
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

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function none(
  reasonCode: string,
  normalizedText: string,
): WorkExecutionPreparationPhaseNone {
  return {
    kind: 'none',
    phase: null,
    reasonCode,
    normalizedText,
  };
}
