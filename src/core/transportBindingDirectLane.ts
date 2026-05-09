// Transport binding direct-lane resolution.
//
// SPEC-062 §FR15-18 / PLAN-054 Phase 3 §3.2-3.3 require that transport
// ingress (Telegram, LINE, future webhooks) map an external thread to
// one canonical Cats direct-lane conversation through a `Transport
// Binding`. The transport binding stays separate from runtime session
// identity, so resolving "what conversation does this binding feed?"
// must be explicit at the seam.
//
// `resolveTransportBindingDirectLane` returns one structured answer
// covering all the failure modes ingress adapters need to handle:
//
// - the binding does not exist
// - the binding exists but has no conversation linked yet
//   (an unbound ingress that still needs operator intent or registration)
// - the binding points at a conversation whose kind is not a direct lane
//   (likely a configuration error — flag, do not silently route)
// - the binding has been disabled or archived
// - the resolution succeeded; ingress can continue or create a turn
//
// A ResolveTurnContextHint is returned when status is 'resolved' so
// callers can bind subsequent canonical turn writes to the right
// conversation + transport binding without re-resolving.

import type {
  CatsCoreState,
  ConversationId,
  CoreConversationKind,
  CoreConversationRecord,
  TransportBindingId,
  TransportBindingRecord,
} from './types.js';

export type TransportDirectLaneStatus =
  | 'resolved'
  | 'binding_not_found'
  | 'no_conversation_linked'
  | 'conversation_not_direct_lane'
  | 'binding_disabled'
  | 'binding_archived';

export interface TransportDirectLaneResolution {
  status: TransportDirectLaneStatus;
  binding: TransportBindingRecord | null;
  conversation: CoreConversationRecord | null;
  conversationId: ConversationId | null;
  conversationKind: CoreConversationKind | null;
  reason: string | null;
}

const DIRECT_LANE_CONVERSATION_KINDS: ReadonlySet<CoreConversationKind> = new Set([
  'direct_message',
]);

export function isDirectLaneConversationKind(kind: CoreConversationKind): boolean {
  return DIRECT_LANE_CONVERSATION_KINDS.has(kind);
}

export function resolveTransportBindingDirectLane(
  core: CatsCoreState,
  transportBindingId: TransportBindingId,
): TransportDirectLaneResolution {
  const binding = core.transportBindings.find((candidate) =>
    candidate.id === transportBindingId) ?? null;
  if (binding === null) {
    return {
      status: 'binding_not_found',
      binding: null,
      conversation: null,
      conversationId: null,
      conversationKind: null,
      reason: `Transport binding ${transportBindingId} does not exist in core state`,
    };
  }
  if (binding.status === 'archived') {
    return {
      status: 'binding_archived',
      binding,
      conversation: null,
      conversationId: binding.conversationId,
      conversationKind: null,
      reason: 'Transport binding is archived; ingress should be rejected',
    };
  }
  if (binding.status === 'disabled') {
    return {
      status: 'binding_disabled',
      binding,
      conversation: null,
      conversationId: binding.conversationId,
      conversationKind: null,
      reason: 'Transport binding is disabled; ingress should be paused',
    };
  }
  if (binding.conversationId === null) {
    return {
      status: 'no_conversation_linked',
      binding,
      conversation: null,
      conversationId: null,
      conversationKind: null,
      reason: 'Transport binding has not been linked to a conversation yet',
    };
  }
  const conversation = core.conversations.find((candidate) =>
    candidate.id === binding.conversationId) ?? null;
  if (conversation === null) {
    return {
      status: 'no_conversation_linked',
      binding,
      conversation: null,
      conversationId: binding.conversationId,
      conversationKind: null,
      reason: `Conversation ${binding.conversationId} referenced by binding does not exist in core state`,
    };
  }
  if (!isDirectLaneConversationKind(conversation.kind)) {
    return {
      status: 'conversation_not_direct_lane',
      binding,
      conversation,
      conversationId: conversation.id,
      conversationKind: conversation.kind,
      reason: `Conversation kind "${conversation.kind}" is not a direct lane`,
    };
  }
  return {
    status: 'resolved',
    binding,
    conversation,
    conversationId: conversation.id,
    conversationKind: conversation.kind,
    reason: null,
  };
}

export interface TransportTurnContextHint {
  conversationId: ConversationId;
  transportBindingId: TransportBindingId;
  conversationKind: CoreConversationKind;
}

/** Returns a typed hint suitable for downstream canonical turn writes
 *  (TurnRecord, LaneRecord, SegmentRecord) when the binding has been
 *  resolved. Null when the binding cannot be used right now — ingress
 *  must short-circuit. */
export function resolveTransportTurnContextHint(
  core: CatsCoreState,
  transportBindingId: TransportBindingId,
): TransportTurnContextHint | null {
  const resolution = resolveTransportBindingDirectLane(core, transportBindingId);
  if (resolution.status !== 'resolved' || !resolution.binding || !resolution.conversation) {
    return null;
  }
  return {
    conversationId: resolution.conversation.id,
    transportBindingId: resolution.binding.id,
    conversationKind: resolution.conversation.kind,
  };
}
