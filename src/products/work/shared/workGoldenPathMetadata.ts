/**
 * Additive golden-path metadata on existing Cats Core records.
 *
 * ADR-112 section 1 forbids a new Core record family for this slice, so source
 * provenance and the versioned proposal ride along in `metadata` on the Work
 * Item that already owns them. Reading is defensive: metadata is untyped by
 * construction, and a partially-written envelope must degrade to "no proposal"
 * rather than throw somewhere deep in a transport handler.
 */

import type { CoreDeliveryGate, CoreDeliveryMode, CoreRecordMetadata } from '../../../core/types.js';
import type {
  TransportWorkOriginV1,
  TransportWorkProposalV1,
} from '../../../platform/transports/work-delivery/contracts.js';

export const WORK_GOLDEN_PATH_METADATA_KEY = 'workGoldenPath';

export const WORK_GOLDEN_PATH_METADATA_VERSION = 1;

export interface WorkGoldenPathMetadata {
  schemaVersion: number;
  origin: TransportWorkOriginV1 | null;
  proposal: TransportWorkProposalV1 | null;
  /**
   * The locale the owner was speaking at intake.
   *
   * Kept beside the origin rather than inside it so `TransportWorkOriginV1`
   * stays the shape SPEC-114 specifies, while later messages (progress, result)
   * can still be rendered in the language the request arrived in.
   */
  locale: string | null;
  /**
   * The external user that authorized this work.
   *
   * Kept so a later action token (publish, deny) can be bound to the same
   * person without guessing that a chat reference identifies a user.
   */
  externalUserRef: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function readOrigin(value: unknown): TransportWorkOriginV1 | null {
  if (!isRecord(value)) {
    return null;
  }
  const bindingId = readString(value.bindingId);
  const conversationId = readString(value.conversationId);
  const workItemId = readString(value.workItemId);
  const externalConversationRef = readString(value.externalConversationRef);
  const externalUpdateRef = readString(value.externalUpdateRef);
  const proposalDigest = readString(value.proposalDigest);
  if (
    bindingId === null
    || conversationId === null
    || workItemId === null
    || externalConversationRef === null
    || externalUpdateRef === null
    || proposalDigest === null
    || typeof value.proposalRevision !== 'number'
  ) {
    return null;
  }
  return {
    version: 1,
    transport: 'telegram',
    bindingId,
    externalConversationRef,
    externalUpdateRef,
    externalMessageRef: readString(value.externalMessageRef),
    conversationId,
    workItemId,
    proposalRevision: value.proposalRevision,
    proposalDigest,
  };
}

function readProposal(value: unknown): TransportWorkProposalV1 | null {
  if (!isRecord(value)) {
    return null;
  }
  const goal = readString(value.goal);
  const digest = readString(value.digest);
  const targetLabel = readString(value.targetLabel);
  const deliveryMode = readString(value.deliveryMode);
  const createdAt = readString(value.createdAt);
  if (
    goal === null
    || digest === null
    || targetLabel === null
    || deliveryMode === null
    || createdAt === null
    || typeof value.revision !== 'number'
  ) {
    return null;
  }
  return {
    version: 1,
    revision: value.revision,
    digest,
    goal,
    targetLabel,
    projectId: readString(value.projectId),
    workspacePath: readString(value.workspacePath),
    acceptanceCriteria: readStringArray(value.acceptanceCriteria),
    deliveryMode: deliveryMode as CoreDeliveryMode,
    deliveryGates: readStringArray(value.deliveryGates) as CoreDeliveryGate[],
    sideEffects: readStringArray(value.sideEffects),
    openQuestion: readString(value.openQuestion),
    createdAt,
  };
}

export function readWorkGoldenPathMetadata(
  metadata: CoreRecordMetadata | unknown,
): WorkGoldenPathMetadata | null {
  if (!isRecord(metadata)) {
    return null;
  }
  const envelope = metadata[WORK_GOLDEN_PATH_METADATA_KEY];
  if (!isRecord(envelope)) {
    return null;
  }
  return {
    schemaVersion: typeof envelope.schemaVersion === 'number'
      ? envelope.schemaVersion
      : WORK_GOLDEN_PATH_METADATA_VERSION,
    origin: readOrigin(envelope.origin),
    proposal: readProposal(envelope.proposal),
    locale: readString(envelope.locale),
    externalUserRef: readString(envelope.externalUserRef),
  };
}

/**
 * Merges golden-path provenance into an existing metadata bag without
 * disturbing sibling envelopes such as `workIntake`.
 */
export function writeWorkGoldenPathMetadata(
  metadata: CoreRecordMetadata | undefined,
  input: {
    origin: TransportWorkOriginV1;
    proposal: TransportWorkProposalV1;
    locale: string | null;
    externalUserRef: string;
  },
): CoreRecordMetadata {
  return {
    ...(isRecord(metadata) ? metadata : {}),
    [WORK_GOLDEN_PATH_METADATA_KEY]: {
      schemaVersion: WORK_GOLDEN_PATH_METADATA_VERSION,
      origin: { ...input.origin },
      proposal: { ...input.proposal },
      locale: input.locale,
      externalUserRef: input.externalUserRef,
    },
  };
}
