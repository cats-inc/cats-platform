import { randomUUID } from 'node:crypto';

import type { ChatMessage, ChatState } from '../api/contracts.js';
import { knowledgeDigest } from '../../../platform/knowledge/productKnowledge.js';
import {
  CONVERSATION_PROPOSAL_HOURLY_LIMIT,
  CONVERSATION_PROPOSAL_OPEN_LIMIT,
  CONVERSATION_PROPOSAL_TTL_MS,
  type ConversationProposalRecord,
  type ConversationProposalStatus,
} from '../../../platform/proposals/contracts.js';
import { createTranslator, messageKeys, parseMessageLocale } from '../../../shared/i18n/index.js';
import {
  CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY,
  resolveChatMessageLocalizedBodyMetadata,
  type ChatMessageLocalizedBodyMetadata,
} from '../../../shared/chatMessageLocalization.js';
import { appendMessage } from './model/index.js';

/**
 * SPEC-142 FR-15 to FR-21: a conversation's proposals. Each one is a card: a system message that
 * carries the proposal record and, as its body, one fixed line that points to Desktop for a
 * client that cannot render the card. The card never enters a model's context or a transport
 * mirror (see `isConversationProposalCard`). Stored with the conversation, so a restart keeps
 * it and a reset removes it with the rest of the state.
 */

export const CONVERSATION_PROPOSAL_EVENT = 'conversation_proposal';
export { CONVERSATION_PROPOSAL_CARD_METADATA_KEY as CONVERSATION_PROPOSAL_METADATA_KEY } from '../shared/ownerStarted.js';
import { CONVERSATION_PROPOSAL_CARD_METADATA_KEY as CONVERSATION_PROPOSAL_METADATA_KEY } from '../shared/ownerStarted.js';

/**
 * What a client sees of a card: its id and status. The record, with its content, is read through
 * the owner-only route.
 */
export function redactConversationProposalCards<T extends { senderKind: string; metadata?: Record<string, unknown> | null }>(
  messages: readonly T[],
): T[] {
  return messages.map((message) => {
    const record = message.metadata?.[CONVERSATION_PROPOSAL_METADATA_KEY] as { id?: unknown; status?: unknown } | undefined;
    if (!record) return message;
    return { ...message, metadata: { ...message.metadata,
      [CONVERSATION_PROPOSAL_METADATA_KEY]: { id: record.id, status: record.status } } };
  });
}

/** A card message, which prompts, continuity and transport mirrors leave out. */
export function isConversationProposalCard(message: Pick<ChatMessage, 'senderKind' | 'metadata'>): boolean {
  return message.senderKind === 'system' && message.metadata?.event === CONVERSATION_PROPOSAL_EVENT;
}

function readRecord(message: ChatMessage): ConversationProposalRecord | null {
  if (!isConversationProposalCard(message)) return null;
  const record = message.metadata?.[CONVERSATION_PROPOSAL_METADATA_KEY] as ConversationProposalRecord | undefined;
  return record && typeof record.id === 'string' ? record : null;
}

const PROGRESS: Record<ConversationProposalStatus, number> = {
  open: 0, confirming: 1, confirmed: 2, declined: 2, expired: 2, stale: 2, failed: 2,
};

/**
 * FR-18: a card's progress only moves forward. A whole-state writer that read the state before an
 * answer (a continuation replay writes its own copy back throughout a turn) cannot reopen a card
 * or undo its outcome, and cannot drop a card posted meanwhile. Pure; the store runs it on every
 * write.
 */
export function keepProposalProgress(stored: ChatState, incoming: ChatState): { state: ChatState; keptChannelIds: string[] } {
  const keptChannelIds: string[] = [];
  const storedById = new Map(stored.channels.map((channel) => [channel.id, channel]));
  let next = incoming;
  incoming.channels.forEach((channel, index) => {
    const previous = storedById.get(channel.id);
    if (!previous) return;
    const storedCards = previous.messages.filter((message) => readRecord(message) !== null);
    if (storedCards.length === 0) return;
    const storedById2 = new Map(storedCards.map((message) => [readRecord(message)!.id, message]));
    let changed = false;
    const seen = new Set<string>();
    const messages = channel.messages.map((message) => {
      const record = readRecord(message);
      if (!record) return message;
      seen.add(record.id);
      const kept = storedById2.get(record.id);
      const keptRecord = kept ? readRecord(kept)! : null;
      if (!keptRecord) return message;
      const ahead = PROGRESS[keptRecord.status] > PROGRESS[record.status]
        || (keptRecord.outcomeReported && !record.outcomeReported);
      if (!ahead) return message;
      changed = true;
      return { ...message, metadata: { ...message.metadata, [CONVERSATION_PROPOSAL_METADATA_KEY]: {
        ...record,
        ...(PROGRESS[keptRecord.status] > PROGRESS[record.status]
          ? { status: keptRecord.status, decidedAt: keptRecord.decidedAt, refusal: keptRecord.refusal } : {}),
        outcomeReported: record.outcomeReported || keptRecord.outcomeReported,
      } } };
    });
    const missing = storedCards.filter((message) => !seen.has(readRecord(message)!.id));
    if (missing.length > 0) {
      changed = true;
      messages.push(...missing);
      messages.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }
    if (!changed) return;
    if (next === incoming) next = { ...incoming, channels: [...incoming.channels] };
    next.channels[index] = { ...channel, messages };
    keptChannelIds.push(channel.id);
  });
  return { state: next, keptChannelIds };
}

/** FR-18: an open card past its time reads as expired; the stored status catches up on the next write. */
export function effectiveProposalStatus(record: ConversationProposalRecord, now: Date): ConversationProposalStatus {
  return record.status === 'open' && now.getTime() > Date.parse(record.expiresAt) ? 'expired' : record.status;
}

export function listConversationProposals(state: ChatState, channelId: string): ConversationProposalRecord[] {
  const channel = state.channels.find((entry) => entry.id === channelId);
  return (channel?.messages ?? []).map(readRecord).filter((record): record is ConversationProposalRecord => record !== null);
}

export function readConversationProposal(
  state: ChatState,
  channelId: string,
  proposalId: string,
): ConversationProposalRecord | null {
  return listConversationProposals(state, channelId).find((record) => record.id === proposalId) ?? null;
}

/** Open, unexpired proposals: the ones a card still waits on (FR-20, and the Boss Cat board). */
export function countOpenConversationProposals(state: ChatState, channelId: string, now: Date): number {
  return listConversationProposals(state, channelId)
    .filter((record) => effectiveProposalStatus(record, now) === 'open').length;
}

export function buildConversationProposalDigest(input: {
  kind: string;
  channelId: string;
  conversationId: string;
  content: Record<string, unknown>;
  binding: unknown;
}): string {
  return knowledgeDigest(JSON.stringify({
    kind: input.kind,
    channelId: input.channelId,
    conversationId: input.conversationId,
    content: input.content,
    binding: input.binding ?? null,
  }));
}

export type ConversationProposalPostRefusal =
  | 'conversation_not_found'
  | 'conversation_archived'
  | 'proposal_limit'
  | 'proposal_rate_limited';

/** FR-14, FR-15, FR-20: store a validated proposal as its card, within the limits. Pure. */
export function postConversationProposal(
  latest: ChatState,
  input: {
    channelId: string;
    conversationId: string;
    kind: string;
    content: Record<string, unknown>;
    digest: string;
    proposerParticipantId: string | null;
    at: Date;
  },
): { state: ChatState; record: ConversationProposalRecord } | { refusal: ConversationProposalPostRefusal } {
  const channel = latest.channels.find((entry) => entry.id === input.channelId);
  if (!channel) return { refusal: 'conversation_not_found' };
  if (channel.status === 'archived') return { refusal: 'conversation_archived' };
  const existing = listConversationProposals(latest, input.channelId);
  if (existing.filter((record) => effectiveProposalStatus(record, input.at) === 'open').length
    >= CONVERSATION_PROPOSAL_OPEN_LIMIT) {
    return { refusal: 'proposal_limit' };
  }
  const hourAgo = input.at.getTime() - 60 * 60_000;
  if (existing.filter((record) => Date.parse(record.createdAt) > hourAgo).length >= CONVERSATION_PROPOSAL_HOURLY_LIMIT) {
    return { refusal: 'proposal_rate_limited' };
  }
  const record: ConversationProposalRecord = {
    id: randomUUID(),
    kind: input.kind,
    channelId: input.channelId,
    conversationId: input.conversationId,
    proposerParticipantId: input.proposerParticipantId,
    content: input.content,
    digest: input.digest,
    createdAt: input.at.toISOString(),
    expiresAt: new Date(input.at.getTime() + CONVERSATION_PROPOSAL_TTL_MS).toISOString(),
    status: 'open',
    decidedAt: null,
    refusal: null,
    outcomeReported: false,
  };
  const locale = parseMessageLocale(channel.language) ?? parseMessageLocale(channel.responseLanguage) ?? 'en';
  const localizedBody: ChatMessageLocalizedBodyMetadata = { key: messageKeys.chatConversationProposalFallback, values: {} };
  const appended = appendMessage(latest, input.channelId, {
    senderKind: 'system',
    senderName: 'Chat',
    body: resolveChatMessageLocalizedBodyMetadata(localizedBody, createTranslator(locale)),
  }, input.at, {
    metadata: {
      event: CONVERSATION_PROPOSAL_EVENT,
      // Server notices never go out through a transport.
      origin: 'system',
      [CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY]: localizedBody,
      [CONVERSATION_PROPOSAL_METADATA_KEY]: record,
    },
    incrementUnread: false,
    origin: 'system',
  });
  return { state: appended.state, record };
}

export function updateConversationProposal(
  state: ChatState,
  channelId: string,
  proposalId: string,
  patch: Partial<Pick<ConversationProposalRecord, 'status' | 'decidedAt' | 'refusal' | 'outcomeReported'>>,
): ChatState {
  return {
    ...state,
    channels: state.channels.map((channel) => channel.id !== channelId ? channel : {
      ...channel,
      messages: channel.messages.map((message) => {
        const record = readRecord(message);
        return record?.id === proposalId
          ? { ...message, metadata: { ...message.metadata, [CONVERSATION_PROPOSAL_METADATA_KEY]: { ...record, ...patch } } }
          : message;
      }),
    }),
  };
}

const OUTCOME_LINE: Record<Exclude<ConversationProposalStatus, 'open' | 'confirming'>, string> = {
  confirmed: 'confirmed by the owner, and the server made the change',
  declined: 'declined by the owner; nothing was changed',
  expired: 'expired unanswered after 24 hours; nothing was changed',
  stale: 'out of date because a record it touched changed; nothing was changed',
  failed: 'confirmed, but the change could not be made; nothing was changed',
};

/**
 * FR-21: one line per closed proposal of this participant that it was not told about yet, for
 * its next turn's instructions. Ids and kinds only: no content, which the card already holds.
 */
export function pendingProposalOutcomes(
  state: ChatState,
  channelId: string,
  participantId: string | null,
  now: Date,
): { lines: string[]; proposalIds: string[] } {
  if (!participantId) return { lines: [], proposalIds: [] };
  const closed = listConversationProposals(state, channelId).filter((record) =>
    record.proposerParticipantId === participantId && !record.outcomeReported
    && !['open', 'confirming'].includes(effectiveProposalStatus(record, now)));
  return {
    lines: closed.map((record) => {
      const status = effectiveProposalStatus(record, now) as Exclude<ConversationProposalStatus, 'open' | 'confirming'>;
      return `Your proposal ${record.id} (${record.kind}) was ${OUTCOME_LINE[status]}.`;
    }),
    proposalIds: closed.map((record) => record.id),
  };
}

/** Marks the outcomes as told, and stores an expiry that was only effective. Pure. */
export function markProposalOutcomesReported(
  state: ChatState,
  channelId: string,
  proposalIds: readonly string[],
  now: Date,
): ChatState {
  let next = state;
  for (const id of proposalIds) {
    const record = readConversationProposal(next, channelId, id);
    if (!record) continue;
    const status = effectiveProposalStatus(record, now);
    next = updateConversationProposal(next, channelId, id, {
      outcomeReported: true,
      ...(status !== record.status ? { status, decidedAt: now.toISOString() } : {}),
    });
  }
  return next;
}

export function formatProposalOutcomeInstructions(lines: readonly string[]): string | null {
  if (lines.length === 0) return null;
  return ['Outcomes of your earlier proposals in this conversation (the owner answered them on their cards):',
    ...lines.map((line) => `- ${line}`)].join('\n');
}
