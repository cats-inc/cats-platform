/**
 * Where a workspace `feedback` message goes. Chat, Work and Code report failed
 * actions (a send, a retry, a cat assignment, navigation) through one
 * `setFeedback`, and only the Add cat panel renders it inline. Everywhere else
 * nothing rendered it, so those failures were invisible; they are a toast now,
 * as Desktop reports other errors (ADR-093, SPEC-141 FR-30, and SPEC-073 for
 * Settings).
 *
 * - While the Add cat panel is shown it keeps the message inline, and closing
 *   the panel does not replay it as a toast.
 * - Otherwise the message is toasted once and cleared, so the same failure
 *   again is a new toast.
 */
export interface WorkspaceFeedbackDeliveryInput {
  feedback: string;
  /** The Add cat panel is on screen and renders `feedback` itself. */
  shownInline: boolean;
  /** The message the panel last showed inline, from the previous delivery. */
  heldInline: string;
}

export interface WorkspaceFeedbackDelivery {
  toast: string | null;
  clear: boolean;
  heldInline: string;
}

export function resolveWorkspaceFeedbackDelivery(input: WorkspaceFeedbackDeliveryInput): WorkspaceFeedbackDelivery {
  if (!input.feedback) return { toast: null, clear: false, heldInline: '' };
  if (input.shownInline) return { toast: null, clear: false, heldInline: input.feedback };
  return {
    toast: input.feedback === input.heldInline ? null : input.feedback,
    clear: true,
    heldInline: '',
  };
}
