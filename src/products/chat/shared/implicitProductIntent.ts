import { parseProductIntentCommand } from './productIntentCommands.js';

export type ImplicitProductIntentChannelKind = 'direct_message' | 'chat_channel';
export type ImplicitProductIntentTargetProduct = 'work' | 'code';
export type ImplicitProductIntentConfidence = 'low' | 'medium' | 'high';
export type ImplicitProductIntentTransport = 'web' | 'telegram';
export type ImplicitProductIntentTransitionEvent = 'confirmed' | 'declined' | 'expired';

export const IMPLICIT_PRODUCT_INTENT_CANDIDATE_METADATA_KEY =
  'implicitProductIntentCandidate';
export const IMPLICIT_PRODUCT_INTENT_TRANSITION_METADATA_KEY =
  'implicitProductIntentTransition';
export const IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN = '(implicit-confirmation)';

const CANDIDATE_ID_PREFIX = 'implicit-product-intent:v1';
const TRANSITION_ID_PREFIX = 'implicit-product-intent-transition:v1';
const DEFAULT_CANDIDATE_TTL_MS = 15 * 60 * 1000;

const COURTESY_ACTION_PATTERNS = [
  /\bplease\b/u,
  /\bcan you\b/u,
  /\bcould you\b/u,
  /請/u,
  /麻煩/u,
] as const;

const STRONG_ACTION_PATTERNS = [
  /\bhelp me\b/u,
  /\bfix(?:e[ds])?\b/u,
  /\bbuild(?:ing|s)?\b/u,
  /\bwrite\b/u,
  /\bimplement(?:ing|s|ed)?\b/u,
  /\bdebug(?:ging|s|ged)?\b/u,
  /\bplan(?:ning|s|ned)?\b/u,
  /\bdraft(?:ing|s|ed)?\b/u,
  /\bsummarize(?:s|d)?\b/u,
  /幫我/u,
  /修復/u,
  /修正/u,
  /規劃/u,
  /撰寫/u,
  /整理/u,
  /實作/u,
  /補/u,
] as const;

const CODE_CUE_PATTERNS = [
  /\bcode\b/u,
  /\btests?\b/u,
  /\bparser\b/u,
  /\bbug\b/u,
  /\brepo\b/u,
  /\bcommits?\b/u,
  /\bpr\b/u,
  /\bcomponents?\b/u,
  /\bapi\b/u,
  /\brefactor\b/u,
  /修\s*code/u,
  /測試/u,
  /程式/u,
  /除錯/u,
] as const;

const WORK_CUE_PATTERNS = [
  /\bwork item\b/u,
  /\btasks?\b/u,
  /\bplans?\b/u,
  /\bmilestones?\b/u,
  /\bscope\b/u,
  /\bschedule\b/u,
  /\brequirements?\b/u,
  /\bdeliverables?\b/u,
  /需求/u,
  /任務/u,
  /排程/u,
  /規劃/u,
] as const;

const CASUAL_FALSE_POSITIVE_PATTERNS = [
  /\bbug burger\b/u,
  /\bdebug burger\b/u,
] as const;

export interface ImplicitProductIntentDetectionInput {
  rawText: string | null | undefined;
  channelKind: ImplicitProductIntentChannelKind;
}

export interface ImplicitProductIntentNoneResult {
  kind: 'none';
  targetProduct: null;
  confidence: null;
  reasonCode: string;
  normalizedText: string;
}

export interface ImplicitProductIntentCandidateResult {
  kind: 'candidate';
  targetProduct: ImplicitProductIntentTargetProduct;
  confidence: Exclude<ImplicitProductIntentConfidence, 'low'>;
  reasonCode: string;
  normalizedText: string;
  matchedActionCues: string[];
  matchedProductCues: string[];
}

export type ImplicitProductIntentDetectionResult =
  | ImplicitProductIntentNoneResult
  | ImplicitProductIntentCandidateResult;

export interface ImplicitProductIntentCandidateMetadata {
  version: 1;
  candidateId: string;
  event: 'suggested';
  source: {
    messageId: string;
    channelId: string;
    conversationId: string;
    transport: ImplicitProductIntentTransport;
  };
  candidate: {
    targetProduct: ImplicitProductIntentTargetProduct;
    confidence: ImplicitProductIntentConfidence;
    reasonCode: string;
  };
  expiresAt: string;
}

export interface ConfirmedImplicitProductIntentCommandMetadata {
  sourceKind: 'implicit_confirmation';
  command: ImplicitProductIntentTargetProduct;
  argumentText: string;
  rawCommandToken: typeof IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN;
  botSuffix: null;
  implicitConfirmed: true;
  originalCandidateId: string;
  originalMessageId: string;
}

export interface ImplicitProductIntentCandidateTransitionMetadata {
  version: 1;
  candidateId: string;
  event: ImplicitProductIntentTransitionEvent;
  sourceMessageId: string;
  targetProduct: ImplicitProductIntentTargetProduct;
  idempotencyKey: string;
  confirmedCommand?: ConfirmedImplicitProductIntentCommandMetadata;
}

export interface BuildImplicitProductIntentCandidateMetadataInput {
  messageId: string;
  channelId: string;
  conversationId: string;
  transport: ImplicitProductIntentTransport;
  targetProduct: ImplicitProductIntentTargetProduct;
  confidence: ImplicitProductIntentConfidence;
  reasonCode: string;
  now?: Date;
}

export interface BuildImplicitProductIntentTransitionMetadataInput {
  candidateId: string;
  event: ImplicitProductIntentTransitionEvent;
  sourceMessageId: string;
  targetProduct: ImplicitProductIntentTargetProduct;
  originalMessageBody?: string;
}

export interface ImplicitProductIntentMetadataCarrier {
  metadata?: Record<string, unknown> | null;
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

function buildNoneResult(reasonCode: string, normalizedText: string): ImplicitProductIntentNoneResult {
  return {
    kind: 'none',
    targetProduct: null,
    confidence: null,
    reasonCode,
    normalizedText,
  };
}

function hasCasualFalsePositive(text: string): boolean {
  return CASUAL_FALSE_POSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

export function buildImplicitProductIntentCandidateId(input: {
  messageId: string;
  targetProduct: ImplicitProductIntentTargetProduct;
}): string {
  return `${CANDIDATE_ID_PREFIX}:${input.messageId}:${input.targetProduct}`;
}

export function buildImplicitProductIntentTransitionIdempotencyKey(input: {
  candidateId: string;
  event: ImplicitProductIntentTransitionEvent;
}): string {
  return `${TRANSITION_ID_PREFIX}:${input.candidateId}:${input.event}`;
}

export function readImplicitProductIntentCandidateMetadata(
  value: unknown,
): ImplicitProductIntentCandidateMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Partial<ImplicitProductIntentCandidateMetadata>;
  const source = record.source;
  const candidate = record.candidate;
  if (
    record.version !== 1
    || record.event !== 'suggested'
    || !source
    || typeof source !== 'object'
    || typeof source.messageId !== 'string'
    || typeof source.channelId !== 'string'
    || typeof source.conversationId !== 'string'
    || (source.transport !== 'web' && source.transport !== 'telegram')
    || !candidate
    || typeof candidate !== 'object'
    || (candidate.targetProduct !== 'work' && candidate.targetProduct !== 'code')
    || (
      candidate.confidence !== 'low'
      && candidate.confidence !== 'medium'
      && candidate.confidence !== 'high'
    )
    || typeof candidate.reasonCode !== 'string'
    || typeof record.candidateId !== 'string'
    || typeof record.expiresAt !== 'string'
  ) {
    return null;
  }

  return record as ImplicitProductIntentCandidateMetadata;
}

export function shouldAppendImplicitProductIntentCandidateSegment(input: {
  messages: Iterable<ImplicitProductIntentMetadataCarrier>;
  candidateId: string;
}): boolean {
  for (const message of input.messages) {
    const candidate = readImplicitProductIntentCandidateMetadata(
      message.metadata?.[IMPLICIT_PRODUCT_INTENT_CANDIDATE_METADATA_KEY],
    );
    if (candidate?.candidateId === input.candidateId) {
      return false;
    }
  }

  return true;
}

export function detectImplicitProductIntent(
  input: ImplicitProductIntentDetectionInput,
): ImplicitProductIntentDetectionResult {
  const normalizedText = normalizeText(input.rawText);
  if (!normalizedText) {
    return buildNoneResult('empty_text', normalizedText);
  }

  if (input.channelKind !== 'direct_message') {
    return buildNoneResult('non_direct_channel', normalizedText);
  }

  if (parseProductIntentCommand(normalizedText)) {
    return buildNoneResult('slash_command', normalizedText);
  }

  if (hasCasualFalsePositive(normalizedText)) {
    return buildNoneResult('casual_false_positive', normalizedText);
  }

  const strongActionCues = collectMatches(normalizedText, STRONG_ACTION_PATTERNS);
  const courtesyActionCues = collectMatches(normalizedText, COURTESY_ACTION_PATTERNS);
  const actionCues = [...strongActionCues, ...courtesyActionCues];
  if (actionCues.length === 0) {
    return buildNoneResult('missing_action_cue', normalizedText);
  }

  const codeCues = collectMatches(normalizedText, CODE_CUE_PATTERNS);
  const workCues = collectMatches(normalizedText, WORK_CUE_PATTERNS);
  if (codeCues.length === 0 && workCues.length === 0) {
    return buildNoneResult('missing_product_cue', normalizedText);
  }

  if (strongActionCues.length === 0 && countWords(normalizedText) < 6) {
    return buildNoneResult('low_confidence_courtesy_only', normalizedText);
  }

  const targetProduct = codeCues.length > 0 ? 'code' : 'work';
  const matchedProductCues = targetProduct === 'code' ? codeCues : workCues;
  const confidence: Exclude<ImplicitProductIntentConfidence, 'low'> =
    strongActionCues.length > 0 && matchedProductCues.length >= 1
      ? 'high'
      : matchedProductCues.length >= 2
        ? 'high'
        : 'medium';

  return {
    kind: 'candidate',
    targetProduct,
    confidence,
    reasonCode: `${targetProduct}_${confidence}_action_product_cue`,
    normalizedText,
    matchedActionCues: actionCues,
    matchedProductCues,
  };
}

export function buildImplicitProductIntentCandidateMetadata(
  input: BuildImplicitProductIntentCandidateMetadataInput,
): ImplicitProductIntentCandidateMetadata {
  const now = input.now ?? new Date();
  return {
    version: 1,
    candidateId: buildImplicitProductIntentCandidateId({
      messageId: input.messageId,
      targetProduct: input.targetProduct,
    }),
    event: 'suggested',
    source: {
      messageId: input.messageId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      transport: input.transport,
    },
    candidate: {
      targetProduct: input.targetProduct,
      confidence: input.confidence,
      reasonCode: input.reasonCode,
    },
    expiresAt: new Date(now.getTime() + DEFAULT_CANDIDATE_TTL_MS).toISOString(),
  };
}

export function buildImplicitProductIntentTransitionMetadata(
  input: BuildImplicitProductIntentTransitionMetadataInput,
): ImplicitProductIntentCandidateTransitionMetadata {
  const idempotencyKey = buildImplicitProductIntentTransitionIdempotencyKey({
    candidateId: input.candidateId,
    event: input.event,
  });
  const base = {
    version: 1 as const,
    candidateId: input.candidateId,
    event: input.event,
    sourceMessageId: input.sourceMessageId,
    targetProduct: input.targetProduct,
    idempotencyKey,
  };

  if (input.event !== 'confirmed') {
    return base;
  }

  return {
    ...base,
    confirmedCommand: {
      sourceKind: 'implicit_confirmation',
      command: input.targetProduct,
      argumentText: (input.originalMessageBody ?? '').trim(),
      rawCommandToken: IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN,
      botSuffix: null,
      implicitConfirmed: true,
      originalCandidateId: input.candidateId,
      originalMessageId: input.sourceMessageId,
    },
  };
}
