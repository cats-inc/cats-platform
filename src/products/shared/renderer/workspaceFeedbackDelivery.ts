/**
 * Where a workspace `feedback` message goes. Chat, Work and Code report failed
 * actions (a send, a retry, a cat assignment, navigation) through one
 * `setFeedback`, and only the Add cat panel renders it inline. Everywhere else
 * it is one error toast, as Desktop reports other errors (ADR-093, SPEC-141
 * FR-30, and SPEC-073 for Settings).
 *
 * The toast mirrors the state rather than copying it: it stays while `feedback`
 * holds the message, goes when a caller clears `feedback` (a send or retry that
 * starts again or succeeds, navigation), and closing it clears `feedback`. A new
 * message replaces it, so failures never stack.
 *
 * While the Add cat panel is shown it keeps the message inline, and closing the
 * panel does not turn that message into a toast.
 */
export interface WorkspaceFeedbackDeliveryInput {
  feedback: string;
  /** The Add cat panel is on screen and renders `feedback` itself. */
  shownInline: boolean;
  /** The message the panel showed inline, from the previous delivery. */
  heldInline: string;
}

export interface WorkspaceFeedbackDelivery {
  /** The message the feedback toast shows; null removes it. */
  toast: string | null;
  heldInline: string;
}

export function resolveWorkspaceFeedbackDelivery(input: WorkspaceFeedbackDeliveryInput): WorkspaceFeedbackDelivery {
  if (!input.feedback) return { toast: null, heldInline: '' };
  if (input.shownInline) return { toast: null, heldInline: input.feedback };
  if (input.feedback === input.heldInline) return { toast: null, heldInline: input.heldInline };
  return { toast: input.feedback, heldInline: '' };
}
