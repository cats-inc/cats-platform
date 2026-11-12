import { updateCatalogConversation } from './scopedConversationState.js';
import type { ChatStore } from '../state/store.js';
import { proposalContext, readProposalRecord } from './proposalState.js';
import type { AsyncKeyedGate } from '../shared/asyncControl.js';
import {
  CONVERSATION_PROPOSAL_CONTENT_LIMIT,
  ConversationProposalKindRegistry,
  ConversationProposalRefusal,
  type ConversationProposalContext,
  type ConversationProposalPort,
  type ConversationProposalRecord,
  type ConversationProposalStatus,
  type ConversationProposalView,
  type ConversationProposalKind,
} from '../../../platform/proposals/contracts.js';
import { productScopeIncludes } from '../../../shared/productScope.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { createAsyncKeyedGate } from '../shared/asyncControl.js';
import {
  buildConversationProposalDigest,
  effectiveProposalStatus,
  postConversationProposal,
  readConversationProposal,
  updateConversationProposal,
} from '../state/conversationProposals.js';

/**
 * SPEC-142 FR-14 to FR-20: proposing, and the owner's answer. A proposal is validated and bound
 * by its kind, stored as its card, and performed by the server only when the owner confirms the
 * card on its own route. Both run under the conversation's mutation gate.
 */

export interface ConversationProposalServiceOptions {
  chatStore: ChatStore;
  mutationGate: AsyncKeyedGate;
  kinds: ConversationProposalKindRegistry;
  now?: () => Date;
  /** The card changed: its conversation's update events. */
  onChanged?(channelId: string): void;
}

export interface ConversationProposalDetails {
  record: ConversationProposalRecord;
  status: ConversationProposalStatus;
  /** Null when the kind is not available in this build, or the card can no longer be described. */
  view: ConversationProposalView | null;
  /** The content or a record it touches changed since the card was posted. */
  outOfDate: boolean;
}

export type ConversationProposalDecision =
  | { status: ConversationProposalStatus; refusal: string | null; summary?: string }
  | { status: 'not_found' };

export function createConversationProposalService(options: ConversationProposalServiceOptions): ConversationProposalPort & {
  read(channelId: string, proposalId: string): Promise<ConversationProposalDetails | null>;
  decide(channelId: string, proposalId: string, decision: 'confirm' | 'decline', ownerActorId: string): Promise<ConversationProposalDecision>;
} {
  const now = options.now ?? (() => new Date());
  // Proposals and answers are serialized per conversation on their own gate. The conversation's
  // mutation gate is held for a whole turn, and a tool proposing during that turn would wait on it.
  const gate = createAsyncKeyedGate();
  const gateKey = (channelId: string) => `proposals:${channelId}`;

  async function contextFor(channelId: string, conversationId: string): Promise<ConversationProposalContext | null> {
    const catalog = await options.chatStore.readCatalog?.();
    if (catalog) return proposalContext(channelId, conversationId, catalog.headers.find(channel => channel.id === channelId),
      catalog.metadata.parallelChatGroups, catalog.core, catalog.headers);
    const state = await options.chatStore.read();
    return proposalContext(channelId, conversationId, state.channels.find(channel => channel.id === channelId),
      state.parallelChatGroups, await options.chatStore.readCore(), state.channels);
  }

  function digestOf(record: Pick<ConversationProposalRecord, 'kind' | 'channelId' | 'conversationId' | 'content'>,
    context: ConversationProposalContext): string | null {
    const kind = options.kinds.get(record.kind);
    if (!kind) return null;
    return buildConversationProposalDigest({ ...record, binding: kind.binding(record.content, context) });
  }

  return {
    async propose(input) {
      const kind = options.kinds.get(input.kind);
      if (!kind) return { refusal: 'unknown_proposal_kind', message: `No such proposal kind: ${input.kind}` };
      // The conversation is the grant's channel; its id is derived, never taken from the caller.
      const conversationId = buildChatConversationId(input.channelId);
      return gate.run(gateKey(input.channelId), async () => {
        try {
          return await updateCatalogConversation<{ proposalId: string; expiresAt: string } | { refusal: string; message: string }>(
            options.chatStore, input.channelId, (state, core, headers) => {
              const context = proposalContext(input.channelId, conversationId, state.channels.find(channel => channel.id === input.channelId),
                state.parallelChatGroups, core, headers)!;
              if (!productScopeIncludes(context.level, kind.level)) return { state,
                result: { refusal: 'level_too_narrow', message: `This conversation's level does not offer ${input.kind}.` } };
              const content = kind.validate(input.content, context);
              if (JSON.stringify(content).length > CONVERSATION_PROPOSAL_CONTENT_LIMIT) return { state,
                result: { refusal: 'proposal_too_large', message: 'The proposal is too large.' } };
              const digest = buildConversationProposalDigest({ kind: input.kind, channelId: input.channelId, conversationId,
                content, binding: kind.binding(content, context) });
              const stored = postConversationProposal(state, { channelId: input.channelId, conversationId,
                kind: input.kind, content, digest, proposerParticipantId: input.proposerParticipantId, at: now() });
              if ('refusal' in stored) return { state, result: { refusal: stored.refusal,
                message: stored.refusal === 'proposal_limit' ? 'This conversation already has 3 proposals waiting for the owner.'
                  : stored.refusal === 'proposal_rate_limited' ? 'This conversation reached 10 proposals in the last hour.'
                    : 'The proposal could not be stored.' } };
              return { state: stored.state, result: { proposalId: stored.record.id, expiresAt: stored.record.expiresAt } };
            }) ?? { refusal: 'conversation_not_found', message: 'The conversation is gone.' };
        } catch (error) {
          if (error instanceof ConversationProposalRefusal) return { refusal: error.code, message: error.message };
          if ((error as { code?: string })?.code === 'conversation_archived') return {
            refusal: 'conversation_archived', message: 'Restore this conversation before posting a proposal.' };
          throw error;
        } finally { options.onChanged?.(input.channelId); }
      });
    },

    async read(channelId, proposalId) {
      const record = await readProposalRecord(options.chatStore, channelId, proposalId);
      if (!record) return null;
      const status = effectiveProposalStatus(record, now());
      const context = await contextFor(channelId, record.conversationId);
      const kind = options.kinds.get(record.kind);
      let view: ConversationProposalView | null = null;
      let outOfDate = false;
      if (context && kind) {
        try { view = kind.describe(record.content, context); } catch { view = null; }
        outOfDate = status === 'open' && digestOf(record, context) !== record.digest;
      }
      return { record, status, view, outOfDate };
    },

    async decide(channelId, proposalId, decision, ownerActorId) {
      return gate.run(gateKey(channelId), async () => {
        const release = decision === 'confirm' ? await options.chatStore.reserveConversationOperation?.(channelId) : undefined;
        if (release === null) return { status: 'not_found' } as const;
        try {
          type Claim = { decision: ConversationProposalDecision }
            | { record: ConversationProposalRecord; context: ConversationProposalContext; kind: ConversationProposalKind };
          const claim = await updateCatalogConversation<Claim>(options.chatStore, channelId, (state, core, headers) => {
            const record = readConversationProposal(state, channelId, proposalId), at = now();
            if (!record) return { state, result: { decision: { status: 'not_found' } } };
            const close = (status: ConversationProposalStatus, refusal: string | null) => ({
              state: updateConversationProposal(state, channelId, proposalId, { status, decidedAt: at.toISOString(), refusal }),
              result: { decision: { status, refusal } } as Claim,
            });
            const status = effectiveProposalStatus(record, at);
            if (status !== 'open') return status !== record.status ? close(status, 'card_expired')
              : { state, result: { decision: { status, refusal: status === 'expired' ? 'card_expired' : 'card_closed' } } };
            if (decision === 'decline') return close('declined', null);
            const kind = options.kinds.get(record.kind);
            if (!kind) return close('failed', 'kind_unavailable');
            const context = proposalContext(channelId, record.conversationId, state.channels.find(channel => channel.id === channelId),
              state.parallelChatGroups, core, headers)!;
            if (digestOf(record, context) !== record.digest) return close('stale', 'card_stale');
            // Latest status, expiry and binding are admitted atomically with this claim.
            return { state: updateConversationProposal(state, channelId, proposalId, { status: 'confirming', decidedAt: at.toISOString() }),
              result: { record, context, kind } };
          });
          if (!claim) return { status: 'not_found' } as const;
          if ('decision' in claim) return claim.decision;
          options.onChanged?.(channelId);
          const close = async (status: ConversationProposalStatus, refusal: string | null) => {
            await updateCatalogConversation(options.chatStore, channelId, state => {
              const current = readConversationProposal(state, channelId, proposalId);
              return { state: current?.status === 'confirming' && current.digest === claim.record.digest
                ? updateConversationProposal(state, channelId, proposalId, { status, decidedAt: now().toISOString(), refusal }) : state,
              result: undefined };
            }, false);
          };
          let result: { summary: string };
          try {
            result = await claim.kind.perform(claim.record.content, claim.context, {
              proposerParticipantId: claim.record.proposerParticipantId, ownerActorId,
            });
          } catch (error) {
            const code = error instanceof ConversationProposalRefusal ? error.code : 'write_failed';
            await close('failed', code); return { status: 'failed', refusal: code };
          }
          await close('confirmed', null);
          return { status: 'confirmed', refusal: null, summary: result.summary };
        } finally {
          try { if (release) await release(); }
          finally { options.onChanged?.(channelId); }
        }
      });
    },
  };
}

export type ConversationProposalService = ReturnType<typeof createConversationProposalService>;
