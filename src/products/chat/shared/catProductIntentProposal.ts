import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type SupervisedToolManifest,
} from '../../../platform/supervision/index.js';
import type { DirectSlashModeCapabilityProfileKind } from '../api/contracts.js';
import type {
  ChatNaturalProductIntentMode,
} from './naturalProductIntentMode.js';

export type CatProductIntentProposalTargetProduct = 'work' | 'code';
export type CatProductIntentProposalTransport = 'web' | 'telegram';
export type CatProductIntentProposalTransitionEvent =
  | 'confirmed'
  | 'declined'
  | 'expired';

export const CAT_PRODUCT_INTENT_PROPOSAL_METADATA_KEY =
  'catProductIntentProposal';
export const CAT_PRODUCT_INTENT_PROPOSAL_TRANSITION_METADATA_KEY =
  'catProductIntentProposalTransition';
export const CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN =
  '(cat-proposal-confirmation)';
export const CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME = 'proposeProductIntake';

const PROPOSAL_ID_PREFIX = 'cat-product-intent:v2';
const TRANSITION_ID_PREFIX = 'cat-product-intent-transition:v2';
const DEFAULT_PROPOSAL_TTL_MS = 15 * 60 * 1000;
const PROPOSAL_DECLINE_COOLDOWN_MS = 5 * 60 * 1000;

export interface CatProductIntentProposalToolInput {
  targetProduct: CatProductIntentProposalTargetProduct;
  sourceMessageId?: string;
  title?: string;
  summary: string;
  rationale: string;
  suggestedNextQuestion?: string;
}

export interface CatProductIntentProposalMetadata {
  version: 2;
  proposalId: string;
  event: 'proposed';
  source: {
    messageId: string;
    channelId: string;
    conversationId: string;
    transport: CatProductIntentProposalTransport;
  };
  proposedBy: {
    catId: string;
    actorId: string;
    capabilityProfileKind: 'strong_agent';
  };
  proposal: {
    targetProduct: CatProductIntentProposalTargetProduct;
    title?: string;
    summary: string;
    rationale: string;
    suggestedNextQuestion?: string;
  };
  createdAt: string;
  expiresAt: string;
}

export interface ConfirmedCatProductIntentCommandMetadata {
  sourceKind: 'cat_product_intent_proposal';
  command: CatProductIntentProposalTargetProduct;
  argumentText: string;
  rawCommandToken: typeof CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN;
  botSuffix: null;
  proposalConfirmed: true;
  originalProposalId: string;
  originalMessageId: string;
  proposedByCatId: string;
}

export interface CatProductIntentProposalTransitionMetadata {
  version: 2;
  proposalId: string;
  event: CatProductIntentProposalTransitionEvent;
  sourceMessageId: string;
  proposedByCatId: string;
  targetProduct: CatProductIntentProposalTargetProduct;
  idempotencyKey: string;
  confirmedCommand?: ConfirmedCatProductIntentCommandMetadata;
}

export interface BuildCatProductIntentProposalMetadataInput {
  messageId: string;
  channelId: string;
  conversationId: string;
  transport: CatProductIntentProposalTransport;
  catId: string;
  actorId: string;
  targetProduct: CatProductIntentProposalTargetProduct;
  title?: string | null;
  summary: string;
  rationale: string;
  suggestedNextQuestion?: string | null;
  now?: Date;
}

export interface BuildCatProductIntentProposalTransitionMetadataInput {
  proposal: CatProductIntentProposalMetadata;
  event: CatProductIntentProposalTransitionEvent;
  originalMessageBody?: string;
}

export interface CatProductIntentProposalMetadataCarrier {
  id?: string;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
}

export interface CatProductIntentProposalValidationInput {
  toolInput: unknown;
  effectiveMode: ChatNaturalProductIntentMode;
  directLane: boolean;
  capabilityProfileKind: DirectSlashModeCapabilityProfileKind | null;
  sourceMessage: {
    id: string;
    channelId: string;
    senderKind: string;
  } | null;
  channelId: string;
  cooldownActive: boolean;
}

export type CatProductIntentProposalValidationRejectionReason =
  | 'feature_disabled'
  | 'proposal_tool_not_enabled'
  | 'non_direct_lane'
  | 'direct_cat_not_strong'
  | 'cooldown_active'
  | 'invalid_tool_input'
  | 'missing_source_message'
  | 'source_message_not_owner'
  | 'source_message_wrong_lane';

export type CatProductIntentProposalValidationResult =
  | {
      accepted: true;
      toolInput: CatProductIntentProposalToolInput;
    }
  | {
      accepted: false;
      reason: CatProductIntentProposalValidationRejectionReason;
      errors: string[];
    };

export interface CatProductIntentProposalAcceptedResponse {
  accepted: true;
  proposalId: string;
  idempotent?: false;
}

export interface CatProductIntentProposalIdempotentResponse {
  accepted: true;
  idempotent: true;
  proposalId: string;
}

export interface CatProductIntentProposalRejectedResponse {
  rejected: true;
  reason: 'cooldown_active';
}

export type CatProductIntentProposalToolResponse =
  | CatProductIntentProposalAcceptedResponse
  | CatProductIntentProposalIdempotentResponse
  | CatProductIntentProposalRejectedResponse;

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/gu, ' ').trim();
  return normalized ? normalized : undefined;
}

function normalizeRequiredText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readTargetProduct(value: unknown): CatProductIntentProposalTargetProduct | null {
  return value === 'work' || value === 'code' ? value : null;
}

export function createCatProductIntentProposalToolManifest(): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name: CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
    manifestVersion: '1.0',
    description: 'Ask the owner to confirm turning this direct-chat message into Work or Code intake.',
    sideEffect: 'local_state',
    preflight: 'available',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: 'never',
    evidence: 'summary',
    failureCodes: ['E_TOOL_SCOPE_DENIED', 'E_SCHEMA_INVALID'],
    inputSchema: {
      id: `${CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME}.input`,
      version: '1.0',
      format: 'json_schema',
    },
    outputSchema: {
      id: `${CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME}.output`,
      version: '1.0',
      format: 'json_schema',
    },
  };
}

export function buildCatProductIntentProposalId(input: {
  messageId: string;
  catId: string;
  targetProduct: CatProductIntentProposalTargetProduct;
}): string {
  return `${PROPOSAL_ID_PREFIX}:${input.messageId}:${input.catId}:${input.targetProduct}`;
}

export function buildCatProductIntentProposalTransitionIdempotencyKey(input: {
  proposalId: string;
  event: CatProductIntentProposalTransitionEvent;
}): string {
  return `${TRANSITION_ID_PREFIX}:${input.proposalId}:${input.event}`;
}

export function buildCatProductIntentProposalMetadata(
  input: BuildCatProductIntentProposalMetadataInput,
): CatProductIntentProposalMetadata {
  const summary = normalizeRequiredText(input.summary);
  const rationale = normalizeRequiredText(input.rationale);
  if (!summary) {
    throw new Error('Cat product-intent proposal summary is required.');
  }
  if (!rationale) {
    throw new Error('Cat product-intent proposal rationale is required.');
  }

  const now = input.now ?? new Date();
  const title = normalizeOptionalText(input.title);
  const suggestedNextQuestion = normalizeOptionalText(input.suggestedNextQuestion);
  return {
    version: 2,
    proposalId: buildCatProductIntentProposalId({
      messageId: input.messageId,
      catId: input.catId,
      targetProduct: input.targetProduct,
    }),
    event: 'proposed',
    source: {
      messageId: input.messageId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      transport: input.transport,
    },
    proposedBy: {
      catId: input.catId,
      actorId: input.actorId,
      capabilityProfileKind: 'strong_agent',
    },
    proposal: {
      targetProduct: input.targetProduct,
      ...(title ? { title } : {}),
      summary,
      rationale,
      ...(suggestedNextQuestion ? { suggestedNextQuestion } : {}),
    },
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEFAULT_PROPOSAL_TTL_MS).toISOString(),
  };
}

export function readCatProductIntentProposalMetadata(
  value: unknown,
): CatProductIntentProposalMetadata | null {
  const record = readRecord(value);
  const source = readRecord(record?.source);
  const proposedBy = readRecord(record?.proposedBy);
  const proposal = readRecord(record?.proposal);
  const targetProduct = readTargetProduct(proposal?.targetProduct);
  if (
    record?.version !== 2
    || record.event !== 'proposed'
    || typeof record.proposalId !== 'string'
    || !source
    || typeof source.messageId !== 'string'
    || typeof source.channelId !== 'string'
    || typeof source.conversationId !== 'string'
    || (source.transport !== 'web' && source.transport !== 'telegram')
    || !proposedBy
    || typeof proposedBy.catId !== 'string'
    || typeof proposedBy.actorId !== 'string'
    || proposedBy.capabilityProfileKind !== 'strong_agent'
    || !proposal
    || !targetProduct
    || typeof proposal.summary !== 'string'
    || typeof proposal.rationale !== 'string'
    || typeof record.createdAt !== 'string'
    || typeof record.expiresAt !== 'string'
  ) {
    return null;
  }

  return record as unknown as CatProductIntentProposalMetadata;
}

export function buildCatProductIntentProposalTransitionMetadata(
  input: BuildCatProductIntentProposalTransitionMetadataInput,
): CatProductIntentProposalTransitionMetadata {
  const idempotencyKey = buildCatProductIntentProposalTransitionIdempotencyKey({
    proposalId: input.proposal.proposalId,
    event: input.event,
  });
  const base = {
    version: 2 as const,
    proposalId: input.proposal.proposalId,
    event: input.event,
    sourceMessageId: input.proposal.source.messageId,
    proposedByCatId: input.proposal.proposedBy.catId,
    targetProduct: input.proposal.proposal.targetProduct,
    idempotencyKey,
  };
  if (input.event !== 'confirmed') {
    return base;
  }

  const argumentText = input.proposal.proposal.summary.trim()
    || (input.originalMessageBody ?? '').trim();
  return {
    ...base,
    confirmedCommand: {
      sourceKind: 'cat_product_intent_proposal',
      command: input.proposal.proposal.targetProduct,
      argumentText,
      rawCommandToken: CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN,
      botSuffix: null,
      proposalConfirmed: true,
      originalProposalId: input.proposal.proposalId,
      originalMessageId: input.proposal.source.messageId,
      proposedByCatId: input.proposal.proposedBy.catId,
    },
  };
}

export function readCatProductIntentProposalTransitionMetadata(
  value: unknown,
): CatProductIntentProposalTransitionMetadata | null {
  const record = readRecord(value);
  const targetProduct = readTargetProduct(record?.targetProduct);
  if (
    record?.version !== 2
    || typeof record.proposalId !== 'string'
    || (
      record.event !== 'confirmed'
      && record.event !== 'declined'
      && record.event !== 'expired'
    )
    || typeof record.sourceMessageId !== 'string'
    || typeof record.proposedByCatId !== 'string'
    || !targetProduct
    || typeof record.idempotencyKey !== 'string'
  ) {
    return null;
  }

  return record as unknown as CatProductIntentProposalTransitionMetadata;
}

export function findCatProductIntentProposalTransition(input: {
  messages: Iterable<CatProductIntentProposalMetadataCarrier>;
  proposalId: string;
}): CatProductIntentProposalTransitionMetadata | null {
  for (const message of input.messages) {
    const transition = readCatProductIntentProposalTransitionMetadata(
      message.metadata?.[CAT_PRODUCT_INTENT_PROPOSAL_TRANSITION_METADATA_KEY],
    );
    if (transition?.proposalId === input.proposalId) {
      return transition;
    }
  }

  return null;
}

export function listOpenCatProductIntentProposals(
  messages: Iterable<CatProductIntentProposalMetadataCarrier>,
): CatProductIntentProposalMetadata[] {
  const messageList = Array.from(messages);
  return messageList.flatMap((message) => {
    const proposal = readCatProductIntentProposalMetadata(
      message.metadata?.[CAT_PRODUCT_INTENT_PROPOSAL_METADATA_KEY],
    );
    if (!proposal) {
      return [];
    }
    return findCatProductIntentProposalTransition({
      messages: messageList,
      proposalId: proposal.proposalId,
    })
      ? []
      : [proposal];
  });
}

export function shouldAppendCatProductIntentProposal(input: {
  messages: Iterable<CatProductIntentProposalMetadataCarrier>;
  proposalId: string;
}): boolean {
  for (const message of input.messages) {
    const proposal = readCatProductIntentProposalMetadata(
      message.metadata?.[CAT_PRODUCT_INTENT_PROPOSAL_METADATA_KEY],
    );
    if (proposal?.proposalId === input.proposalId) {
      return false;
    }
  }

  return true;
}

export function buildCatProductIntentProposalDuplicateResponse(
  proposalId: string,
): CatProductIntentProposalIdempotentResponse {
  return {
    accepted: true,
    idempotent: true,
    proposalId,
  };
}

export function buildCatProductIntentProposalCooldownResponse():
  CatProductIntentProposalRejectedResponse {
  return {
    rejected: true,
    reason: 'cooldown_active',
  };
}

export function hasRecentCatProductIntentProposalDecline(input: {
  messages: Iterable<CatProductIntentProposalMetadataCarrier>;
  now: Date;
}): boolean {
  for (const message of input.messages) {
    const transition = readCatProductIntentProposalTransitionMetadata(
      message.metadata?.[CAT_PRODUCT_INTENT_PROPOSAL_TRANSITION_METADATA_KEY],
    );
    if (transition?.event !== 'declined') {
      continue;
    }
    const declinedAt = Date.parse(message.createdAt ?? '');
    if (
      Number.isFinite(declinedAt)
      && input.now.getTime() - declinedAt < PROPOSAL_DECLINE_COOLDOWN_MS
    ) {
      return true;
    }
  }

  return false;
}

export function listExpiredCatProductIntentProposals(input: {
  messages: Iterable<CatProductIntentProposalMetadataCarrier>;
  now: Date;
  expireAll?: boolean;
}): CatProductIntentProposalMetadata[] {
  return listOpenCatProductIntentProposals(input.messages).filter((proposal) => {
    if (input.expireAll) {
      return true;
    }
    const expiresAt = Date.parse(proposal.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt <= input.now.getTime();
  });
}

export function validateCatProductIntentProposalToolCall(
  input: CatProductIntentProposalValidationInput,
): CatProductIntentProposalValidationResult {
  if (input.effectiveMode === 'off') {
    return rejectProposalToolCall('feature_disabled');
  }
  if (input.effectiveMode !== 'cat_tool') {
    return rejectProposalToolCall('proposal_tool_not_enabled');
  }
  if (!input.directLane) {
    return rejectProposalToolCall('non_direct_lane');
  }
  if (input.capabilityProfileKind !== 'strong_agent') {
    return rejectProposalToolCall('direct_cat_not_strong');
  }
  if (input.cooldownActive) {
    return rejectProposalToolCall('cooldown_active');
  }

  const normalized = normalizeCatProductIntentProposalToolInput(input.toolInput);
  if (!normalized.accepted) {
    return normalized;
  }
  if (!input.sourceMessage) {
    return rejectProposalToolCall('missing_source_message');
  }
  if (input.sourceMessage.senderKind !== 'user') {
    return rejectProposalToolCall('source_message_not_owner');
  }
  if (input.sourceMessage.channelId !== input.channelId) {
    return rejectProposalToolCall('source_message_wrong_lane');
  }

  return normalized;
}

function normalizeCatProductIntentProposalToolInput(
  value: unknown,
): CatProductIntentProposalValidationResult {
  const record = readRecord(value);
  const errors: string[] = [];
  const targetProduct = readTargetProduct(record?.targetProduct);
  const summary = readString(record?.summary);
  const rationale = readString(record?.rationale);
  if (!record) {
    return rejectProposalToolCall('invalid_tool_input', ['tool input must be an object']);
  }
  if (!targetProduct) {
    errors.push('targetProduct must be work or code');
  }
  if (!summary || normalizeRequiredText(summary).length === 0) {
    errors.push('summary is required');
  }
  if (!rationale || normalizeRequiredText(rationale).length === 0) {
    errors.push('rationale is required');
  }
  if (record.sourceMessageId !== undefined && typeof record.sourceMessageId !== 'string') {
    errors.push('sourceMessageId must be a string when provided');
  }
  if (record.title !== undefined && typeof record.title !== 'string') {
    errors.push('title must be a string when provided');
  }
  if (
    record.suggestedNextQuestion !== undefined
    && typeof record.suggestedNextQuestion !== 'string'
  ) {
    errors.push('suggestedNextQuestion must be a string when provided');
  }
  if (errors.length > 0 || !targetProduct || !summary || !rationale) {
    return rejectProposalToolCall('invalid_tool_input', errors);
  }

  const sourceMessageId = normalizeOptionalText(record.sourceMessageId as string | undefined);
  const title = normalizeOptionalText(record.title as string | undefined);
  const suggestedNextQuestion = normalizeOptionalText(
    record.suggestedNextQuestion as string | undefined,
  );

  return {
    accepted: true,
    toolInput: {
      targetProduct,
      ...(sourceMessageId ? { sourceMessageId } : {}),
      ...(title ? { title } : {}),
      summary: normalizeRequiredText(summary),
      rationale: normalizeRequiredText(rationale),
      ...(suggestedNextQuestion ? { suggestedNextQuestion } : {}),
    },
  };
}

function rejectProposalToolCall(
  reason: CatProductIntentProposalValidationRejectionReason,
  errors: string[] = [reason],
): Extract<CatProductIntentProposalValidationResult, { accepted: false }> {
  return {
    accepted: false,
    reason,
    errors,
  };
}
