import type { ChatState } from './contracts.js';
import type { ChatStore } from '../state/store.js';
import { updateChatState } from '../state/store.js';
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
} from '../../../platform/proposals/contracts.js';
import { productScopeIncludes } from '../../../shared/productScope.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { createAsyncKeyedGate } from '../shared/asyncControl.js';
import { resolveChannelProductScope } from '../shared/channelTopology.js';
import { channelWorkProjectRevision, readChannelWorkProjectId } from '../state/model/workProject.js';
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

function channelOf(state: ChatState, channelId: string) {
  return state.channels.find((entry) => entry.id === channelId) ?? null;
}

export function createConversationProposalService(options: ConversationProposalServiceOptions): ConversationProposalPort & {
  read(channelId: string, proposalId: string): Promise<ConversationProposalDetails | null>;
  decide(channelId: string, proposalId: string, decision: 'confirm' | 'decline', ownerActorId: string): Promise<ConversationProposalDecision>;
} {
  const now = options.now ?? (() => new Date());
  // Proposals and answers are serialized per conversation on their own gate. The conversation's
  // mutation gate is held for a whole turn, and a tool proposing during that turn would wait on it.
  const gate = createAsyncKeyedGate();
  const gateKey = (channelId: string) => `proposals:${channelId}`;

  async function contextFor(state: ChatState, channelId: string, conversationId: string): Promise<ConversationProposalContext | null> {
    const channel = channelOf(state, channelId);
    if (!channel) return null;
    return {
      channelId,
      conversationId,
      core: await options.chatStore.readCore(),
      level: resolveChannelProductScope(channel),
      parallelMember: state.parallelChatGroups.some((group) => group.status === 'active' && group.memberChannelIds.includes(channelId)),
      workProjectId: readChannelWorkProjectId(channel),
      workProjectRevision: channelWorkProjectRevision(channel),
      otherConversationsInProject: (projectId) => state.channels
        .filter((entry) => entry.id !== channelId && readChannelWorkProjectId(entry) === projectId).length,
    };
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
        const state = await options.chatStore.read();
        const context = await contextFor(state, input.channelId, conversationId);
        if (!context) return { refusal: 'conversation_not_found', message: 'The conversation is gone.' };
        if (!productScopeIncludes(context.level, kind.level)) {
          return { refusal: 'level_too_narrow', message: `This conversation's level does not offer ${input.kind}.` };
        }
        let content: Record<string, unknown>;
        try {
          content = kind.validate(input.content, context);
        } catch (error) {
          if (error instanceof ConversationProposalRefusal) return { refusal: error.code, message: error.message };
          throw error;
        }
        if (JSON.stringify(content).length > CONVERSATION_PROPOSAL_CONTENT_LIMIT) {
          return { refusal: 'proposal_too_large', message: 'The proposal is too large.' };
        }
        const digest = buildConversationProposalDigest({
          kind: input.kind, channelId: input.channelId, conversationId,
          content, binding: kind.binding(content, context),
        });
        const stored: { record: ConversationProposalRecord | null; refusal: string | null } = { record: null, refusal: null };
        await updateChatState(options.chatStore, (latest) => {
          const result = postConversationProposal(latest, {
            channelId: input.channelId, conversationId, kind: input.kind, content, digest,
            proposerParticipantId: input.proposerParticipantId, at: now(),
          });
          if ('refusal' in result) { stored.refusal = result.refusal; return latest; }
          stored.record = result.record;
          return result.state;
        });
        if (!stored.record) {
          const code = stored.refusal ?? 'proposal_refused';
          return { refusal: code, message: code === 'proposal_limit'
            ? 'This conversation already has 3 proposals waiting for the owner.'
            : code === 'proposal_rate_limited'
              ? 'This conversation reached 10 proposals in the last hour.'
              : 'The proposal could not be stored.' };
        }
        options.onChanged?.(input.channelId);
        return { proposalId: stored.record.id, expiresAt: stored.record.expiresAt };
      });
    },

    async read(channelId, proposalId) {
      const state = await options.chatStore.read();
      const record = readConversationProposal(state, channelId, proposalId);
      if (!record) return null;
      const status = effectiveProposalStatus(record, now());
      const context = await contextFor(state, channelId, record.conversationId);
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
        const state = await options.chatStore.read();
        const record = readConversationProposal(state, channelId, proposalId);
        if (!record) return { status: 'not_found' } as const;
        const at = now();
        const close = async (status: ConversationProposalStatus, refusal: string | null) => {
          await updateChatState(options.chatStore, (latest) =>
            updateConversationProposal(latest, channelId, proposalId, { status, decidedAt: at.toISOString(), refusal }));
          options.onChanged?.(channelId);
        };
        const status = effectiveProposalStatus(record, at);
        // FR-18: closed once. An expiry that was only effective is stored now.
        if (status !== 'open') {
          if (status !== record.status) await close(status, 'card_expired');
          return { status, refusal: status === 'expired' ? 'card_expired' : 'card_closed' };
        }
        if (decision === 'decline') {
          await close('declined', null);
          return { status: 'declined', refusal: null };
        }
        const kind = options.kinds.get(record.kind);
        // A fresh read, just before the write, for the recheck the write is bound to.
        const fresh = await options.chatStore.read();
        const channel = channelOf(fresh, channelId);
        const context = await contextFor(fresh, channelId, record.conversationId);
        if (!channel || channel.status === 'archived' || !context) {
          await close('stale', 'conversation_unavailable');
          return { status: 'stale', refusal: 'conversation_unavailable' };
        }
        if (!kind) {
          await close('failed', 'kind_unavailable');
          return { status: 'failed', refusal: 'kind_unavailable' };
        }
        if (digestOf(record, context) !== record.digest) {
          await close('stale', 'card_stale');
          return { status: 'stale', refusal: 'card_stale' };
        }
        // Marked before the write, so a crash between the write and its outcome never writes twice.
        await updateChatState(options.chatStore, (latest) =>
          updateConversationProposal(latest, channelId, proposalId, { status: 'confirming', decidedAt: at.toISOString() }));
        let result: { summary: string };
        try {
          // FR-19: the server writes the bound content; the model supplies nothing now.
          result = await kind.perform(record.content, context, {
            proposerParticipantId: record.proposerParticipantId, ownerActorId,
          });
        } catch (error) {
          const code = error instanceof ConversationProposalRefusal ? error.code : 'write_failed';
          await close('failed', code);
          return { status: 'failed', refusal: code };
        }
        // The write happened: what follows cannot turn it into a failure.
        await close('confirmed', null);
        return { status: 'confirmed', refusal: null, summary: result.summary };
      });
    },
  };
}

export type ConversationProposalService = ReturnType<typeof createConversationProposalService>;
