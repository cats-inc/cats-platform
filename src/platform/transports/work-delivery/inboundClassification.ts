/**
 * Inbound request classification (SPEC-114 FR-48).
 *
 * Attachment ingestion is out of scope for the first slice. The failure mode
 * this guards against is subtle and worse than an outright error: handing the
 * agent a *filename* as though it were the file's content, which produces
 * confident work about a document nobody read.
 */

export type TransportWorkInboundKind =
  | 'work_command'
  | 'attachment_unsupported'
  | 'empty'
  | 'not_work_request';

export interface TransportWorkInboundClassification {
  kind: TransportWorkInboundKind;
  /** Present only for `work_command`: the goal text after `/work`. */
  goal: string | null;
  /** Stable message key for the owner-facing explanation, when refused. */
  refusalKey: string | null;
}

const WORK_COMMAND = '/work';

/**
 * True when the owner is addressing the golden path at all.
 *
 * The bridge gates on this before acting on a classification, so an ordinary
 * chat message that happens to carry a photo keeps its existing behaviour
 * instead of being refused by a feature it never invoked.
 */
export function isTransportWorkRequestText(text: string | null): boolean {
  return (text ?? '').trim().toLowerCase().startsWith(WORK_COMMAND);
}

export interface ClassifyTransportWorkInboundInput {
  text: string | null;
  /** Attachment kinds present on the update, if any. */
  attachmentKinds: readonly string[];
}

export function classifyTransportWorkInbound(
  input: ClassifyTransportWorkInboundInput,
): TransportWorkInboundClassification {
  const text = (input.text ?? '').trim();
  const hasAttachment = input.attachmentKinds.length > 0;

  if (hasAttachment && text === '') {
    return {
      kind: 'attachment_unsupported',
      goal: null,
      refusalKey: 'workDelivery.inbound.attachmentNotIngested',
    };
  }

  if (!text.toLowerCase().startsWith(WORK_COMMAND)) {
    return {
      kind: text === '' ? 'empty' : 'not_work_request',
      goal: null,
      refusalKey: null,
    };
  }

  const goal = text.slice(WORK_COMMAND.length).trim();
  if (goal === '') {
    return { kind: 'empty', goal: null, refusalKey: 'workDelivery.inbound.goalRequired' };
  }

  // A `/work` caption on an attachment is still a text request; the caption is
  // the goal and the attachment is explicitly not ingested.
  if (hasAttachment) {
    return {
      kind: 'attachment_unsupported',
      goal: null,
      refusalKey: 'workDelivery.inbound.attachmentNotIngested',
    };
  }

  return { kind: 'work_command', goal, refusalKey: null };
}
