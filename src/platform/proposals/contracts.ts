import type { CatsCoreState } from '../../core/types.js';

/**
 * SPEC-142 FR-15 to FR-21 (S1): a write an agent asks for. It changes nothing until the owner
 * confirms its card, and then the server performs it with the bound content. Kinds are
 * registered by the products that own the write (Work's in PLAN-135 Phase 4); the store and the
 * card belong to the conversation.
 */

/**
 * `confirming` holds while the server performs a confirmed write; a card left there by a crash is
 * closed and never performed twice.
 */
export type ConversationProposalStatus = 'open' | 'confirming' | 'confirmed' | 'declined' | 'expired' | 'stale' | 'failed';

export const CONVERSATION_PROPOSAL_TTL_MS = 24 * 60 * 60_000;
/**
 * SPEC-142 FR-13, FR-22: putting the conversation into a Project. Chat registers the kind, since
 * the write is the conversation's; Work's tool proposes it.
 */
export const CONVERSATION_WORK_PROJECT_PROPOSAL_KIND = 'conversation.work_project';
/**
 * SPEC-142 A1 (FR-29): ADR-105's decision path asks for a new Project with a folder through this
 * kind, which any conversation may post, whatever its level. Work registers it beside its own
 * `work.project.create`, which only Work conversations' tools propose.
 */
export const WORK_PROJECT_CREATE_DECISION_PROPOSAL_KIND = 'work.project.create.decision';
/** FR-20: at most this many open proposals per conversation. */
export const CONVERSATION_PROPOSAL_OPEN_LIMIT = 3;
/** FR-20: at most this many proposals per conversation in an hour. */
export const CONVERSATION_PROPOSAL_HOURLY_LIMIT = 10;
/** The largest content a proposal may carry, as JSON. */
export const CONVERSATION_PROPOSAL_CONTENT_LIMIT = 8 * 1024;

export interface ConversationProposalRecord {
  id: string;
  kind: string;
  channelId: string;
  /** Core conversation id (`conversation-channel-<channelId>`). */
  conversationId: string;
  /** The participant whose session proposed it, when its grant named one. */
  proposerParticipantId: string | null;
  /** Exactly what will be written, as the kind validated it. */
  content: Record<string, unknown>;
  /** FR-18: the content, the conversation and the records it touches, as they were. */
  digest: string;
  createdAt: string;
  expiresAt: string;
  status: ConversationProposalStatus;
  decidedAt: string | null;
  /** Why a confirmation was refused or failed, as a stable code. */
  refusal: string | null;
  /** FR-21: whether the proposer was told the outcome. */
  outcomeReported: boolean;
}

/** What a kind's checks and its write can read: the conversation and Core, as they are now. */
export interface ConversationProposalContext {
  channelId: string;
  conversationId: string;
  core: CatsCoreState;
  /** The conversation's level. */
  level: 'chat' | 'code' | 'work';
  /** Whether it is a member of an active parallel group, which cannot belong to a Project (FR-14, FR-22). */
  parallelMember: boolean;
  /** The Project the conversation belongs to (FR-22), or null. */
  workProjectId: string | null;
  /** How many times the owner changed it; a card that changes or relies on it binds this. */
  workProjectRevision: number;
  /** FR-16: how many other conversations belong to this Project. */
  otherConversationsInProject(projectId: string): number;
}

/** One line of the card: a field and the exact value that will be written. */
export interface ConversationProposalField {
  name: string;
  value: string | null;
}

/** A record the write touches. */
export interface ConversationProposalRecordRef {
  kind: 'work_item' | 'project' | 'conversation' | 'task' | 'other';
  id: string | null;
  title: string | null;
}

/** FR-16: the card for a write that changes where a supervised run starts. */
export interface ConversationProposalFolderWarning {
  folder: string;
  otherConversations: number;
  workItems: number;
}

export interface ConversationProposalView {
  /** A short summary of the write, such as "New Work Item". */
  title: string;
  fields: ConversationProposalField[];
  records: ConversationProposalRecordRef[];
  folderWarning: ConversationProposalFolderWarning | null;
}

export class ConversationProposalRefusal extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ConversationProposalRefusal';
  }
}

export interface ConversationProposalKind {
  kind: string;
  /** The narrowest level whose conversations may propose it. */
  level: 'chat' | 'code' | 'work';
  /** The content as it will be stored, or a refusal the agent can read. Throws `ConversationProposalRefusal`. */
  validate(content: unknown, context: ConversationProposalContext): Record<string, unknown>;
  /**
   * The current state of the records the write touches. It is part of the digest, so a change
   * to any of them makes the card out of date (FR-18).
   */
  binding(content: Record<string, unknown>, context: ConversationProposalContext): unknown;
  /** What the card shows, from the stored content and the current records (FR-15, FR-16). */
  describe(content: Record<string, unknown>, context: ConversationProposalContext): ConversationProposalView;
  /**
   * The write, on the owner's confirmation (FR-19). It records both actors. A refusal here
   * closes the card as `failed` with its code.
   */
  perform(
    content: Record<string, unknown>,
    context: ConversationProposalContext,
    actors: { proposerParticipantId: string | null; ownerActorId: string },
  ): Promise<{ summary: string }>;
}

export class ConversationProposalKindRegistry {
  private readonly kinds = new Map<string, ConversationProposalKind>();

  register(kind: ConversationProposalKind): void {
    if (this.kinds.has(kind.kind)) throw new Error(`Proposal kind already registered: ${kind.kind}`);
    this.kinds.set(kind.kind, kind);
  }

  get(kind: string): ConversationProposalKind | null {
    return this.kinds.get(kind) ?? null;
  }
}

/** The port a session tool uses to ask for a write (FR-14). */
export interface ConversationProposalPort {
  propose(input: {
    channelId: string;
    conversationId: string;
    kind: string;
    content: unknown;
    proposerParticipantId: string | null;
  }): Promise<{ proposalId: string; expiresAt: string } | { refusal: string; message: string }>;
}
