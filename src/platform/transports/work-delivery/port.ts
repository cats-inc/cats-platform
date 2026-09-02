/**
 * The seam between a transport and the golden path (ADR-112 section 4).
 *
 * The transport hands over raw external facts and learns only whether the
 * update was consumed. Everything the product owns — readiness, scope,
 * authorization, policy, outbound copy — stays behind this interface, which is
 * why `platform/` can define it without importing any product.
 *
 * Outbound messages are *not* returned from these calls. The product enqueues
 * them on its own durable outbox, so a transport that crashes between "command
 * handled" and "reply sent" recovers by flushing the outbox rather than by
 * replaying the command.
 */

export interface TransportWorkCommandInput {
  bindingId: string;
  conversationId: string;
  /** Opaque reference to the external user that sent the request. */
  externalUserRef: string;
  /** Opaque reference to the external chat. Also the delivery destination. */
  externalConversationRef: string;
  externalUpdateRef: string;
  externalMessageRef: string | null;
  goal: string;
  locale: string | null;
}

export interface TransportWorkCallbackInput {
  callbackData: string;
  bindingId: string;
  conversationId: string;
  externalUserRef: string;
  externalConversationRef: string;
  /** The external callback id. Distinguishes owner events, never scopes. */
  ownerEventRef: string;
  locale: string | null;
}

export interface TransportWorkRefusalInput {
  bindingId: string;
  conversationId: string;
  externalConversationRef: string;
  externalUpdateRef: string;
  reasonKey: string;
  locale: string | null;
}

export type TransportWorkHandledOutcome =
  | 'accepted'
  | 'not_ready'
  | 'admitted'
  | 'already_admitted'
  | 'cancelled'
  | 'published'
  | 'publish_denied'
  | 'publish_blocked'
  | 'retried'
  | 'resumed'
  | 'rejected'
  | 'refused';

export interface TransportWorkHandledResult {
  handled: boolean;
  outcome: TransportWorkHandledOutcome;
  workItemId: string | null;
  /** Rejection reason code when `outcome` is `rejected`; for diagnostics. */
  rejection: string | null;
}

export interface TransportWorkGoldenPathPort {
  /** True when this callback belongs to the golden path and nothing else. */
  ownsCallback(callbackData: string): boolean;
  handleWorkCommand(input: TransportWorkCommandInput): Promise<TransportWorkHandledResult>;
  handleActionCallback(input: TransportWorkCallbackInput): Promise<TransportWorkHandledResult>;
  /** Explains an input the first slice cannot ingest, e.g. a bare attachment. */
  refuse(input: TransportWorkRefusalInput): Promise<TransportWorkHandledResult>;
}
