import type { CatsCoreState, CoreProjectRecord, CoreWorkItemRecord } from '../../../core/types.js';
import {
  ConversationProposalRefusal,
  type ConversationProposalContext,
  type ConversationProposalKind,
  type ConversationProposalView,
} from '../../../platform/proposals/contracts.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import { cleanRecordValue, fenceRecordText } from '../../shared/conversationRecordTools.js';
import {
  validateWorkItemAssignProjectInput,
  validateWorkItemCaptureInput,
  validateWorkItemUpdateInput,
  validateWorkProjectCreateInput,
  type WorkItemKind,
  type WorkItemPriorityHint,
  type WorkItemTriageStatus,
} from '../shared/workToolSurface.js';
import type { WorkIntakeDelegate } from '../state/workIntakeDelegate.js';
import type { WorkTriageDelegate } from '../state/workTriageDelegate.js';
import type { CoreStore } from '../../../core/store.js';
import { normalizeWorkProjectFolder, setWorkProjectFolder } from '../state/workProjectFolder.js';
import { conversationMoveView, visibleWorkProjectFolder } from '../../shared/workProjectDisplay.js';

/**
 * SPEC-142 FR-12 to FR-14, FR-16, FR-19: the Work writes a conversation's agents may propose
 * (PLAN-135 Phases 4 and 5). Each is performed on the owner's confirmation through Work's
 * delegate, which records the proposer and the confirming owner. A write that changes where a
 * supervised run starts carries the folder warning on its card.
 */

export const WORK_PROPOSAL_CAPTURE = 'work.item.capture';
export const WORK_PROPOSAL_UPDATE = 'work.item.update';
export const WORK_PROPOSAL_ASSIGN_PROJECT = 'work.item.assign_project';
export const WORK_PROPOSAL_CREATE_PROJECT = 'work.project.create';
export const WORK_PROPOSAL_PROJECT_FOLDER = 'work.project.folder';
export const WORK_PROPOSAL_MAX_ITEMS = 8;
/** Marks an assignment proposed under FR-12's rule: the conversation's own Project only. */
export const CONVERSATION_PROJECT_SCOPE = 'conversation_project';

const DERIVED_SOURCES = new Set(['chat-channel', 'chat-room-workflow']);
const PROJECTED_ID_PREFIX = 'work-item-chat-channel-';

/** The Work Item the projection rebuilds from the conversation: readable, never changed by a tool. */
export function isProjectedWorkItem(workItem: CoreWorkItemRecord): boolean {
  return DERIVED_SOURCES.has(String(workItem.metadata?.source ?? '')) || workItem.id.startsWith(PROJECTED_ID_PREFIX);
}

/** Limits that a card shows in full, so what the owner reads is exactly what is written (FR-15). */
export const PROPOSAL_TITLE_LIMIT = 160;
export const PROPOSAL_SUMMARY_LIMIT = 1000;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * A proposed text as it will be stored: invisible format characters removed, controls and line
 * breaks made spaces, one line, within `limit` characters. Longer text is refused, never cut.
 */
export function proposalLine(value: unknown, name: string, limit: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ConversationProposalRefusal('invalid_arguments', `${name} must be text.`);
  // The card fences each value in «»; the text cannot carry its own fence marks.
  const line = value.replace(/\p{Cf}/gu, '').replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ').replace(/[«»]/gu, '"')
    .replace(/\s+/gu, ' ').trim();
  if (!line) return undefined;
  if (Array.from(GRAPHEMES.segment(line)).length > limit) {
    throw new ConversationProposalRefusal('too_long', `${name} is longer than ${limit} characters.`);
  }
  return line;
}

/** FR-14: one of the conversation's captured Work Items, or a refusal. */
export function requireCapturedWorkItem(core: CatsCoreState, conversationId: string, workItemId: unknown): CoreWorkItemRecord {
  if (typeof workItemId !== 'string' || !workItemId.trim()) {
    throw new ConversationProposalRefusal('work_item_required', 'workItemId is required.');
  }
  const workItem = core.workItems.find((entry) => entry.id === workItemId.trim());
  // Another conversation's Work Item reads as missing.
  if (!workItem || workItem.conversationId !== conversationId) {
    throw new ConversationProposalRefusal('work_item_not_found', "No such Work Item in this conversation's own records.");
  }
  if (isProjectedWorkItem(workItem)) {
    throw new ConversationProposalRefusal('projected_work_item',
      "This conversation's own Work Item follows the conversation and cannot be changed by a proposal.");
  }
  return workItem;
}

function requireProject(core: CatsCoreState, projectId: unknown): CoreProjectRecord {
  const project = typeof projectId === 'string' ? core.projects.find((entry) => entry.id === projectId.trim()) : undefined;
  if (!project) throw new ConversationProposalRefusal('project_not_found', 'No such Project.');
  if (project.status === 'archived') throw new ConversationProposalRefusal('project_archived', 'That Project is archived.');
  return project;
}

function refuseInvalid(errors: Array<{ path?: string; message?: string }>, fallback: string): never {
  const detail = errors.map((error) => [error.path, error.message].filter(Boolean).join(': ')).join('; ');
  throw new ConversationProposalRefusal('invalid_arguments', detail || fallback);
}

function applied<T>(result: ToolResult<T>): T {
  if (result.status === 'applied') return result.result;
  const reason = 'error' in result && result.error ? result.error : null;
  throw new ConversationProposalRefusal(
    (reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string') ? reason.code : 'work_write_refused',
    (reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') ? reason.message : 'Work refused the write.',
  );
}

function workItemBinding(workItem: CoreWorkItemRecord | undefined) {
  return workItem
    ? { id: workItem.id, updatedAt: workItem.updatedAt, status: workItem.status, projectId: workItem.projectId }
    : null;
}

function projectBinding(project: CoreProjectRecord | undefined) {
  return project
    ? { id: project.id, updatedAt: project.updatedAt, status: project.status, repoPath: project.repoPath }
    : null;
}

/** The proposer as an actor: the participant, or the conversation when the grant named none. */
function proposerActor(participantId: string | null, context: ConversationProposalContext): string {
  return participantId ? `chat-participant:${participantId}` : `chat-conversation:${context.channelId}`;
}

function text(value: unknown): string | null {
  return fenceRecordText(typeof value === 'string' ? value : null, PROPOSAL_SUMMARY_LIMIT + 1);
}

/** A folder as the card shows it: whole, with any hidden character written out. */
function folderText(value: unknown): string | null {
  return typeof value === 'string' ? visibleWorkProjectFolder(value) : null;
}


/** FR-16: the card for a write that changes where supervised runs start. */
function projectFolderWarning(context: ConversationProposalContext, projectId: string | null, folder: unknown) {
  const shown = folderText(folder);
  if (!shown) return null;
  return {
    folder: shown,
    otherConversations: projectId ? context.otherConversationsInProject(projectId) : 0,
    workItems: projectId ? context.core.workItems.filter((entry) => entry.projectId === projectId).length : 0,
  };
}

function projectRecord(context: ConversationProposalContext, projectId: string | null) {
  if (!projectId) return [];
  const project = context.core.projects.find((entry) => entry.id === projectId);
  return [{ kind: 'project' as const, id: cleanRecordValue(projectId), title: text(project?.title) }];
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ConversationProposalRefusal('invalid_arguments', `${name} must be text.`);
  return value.trim() || undefined;
}

export interface WorkProposalKindOptions {
  intake: Pick<WorkIntakeDelegate, 'capture'>;
  triage: Pick<WorkTriageDelegate, 'updateWorkItem' | 'assignWorkItemProject' | 'createProject'>;
  /** For the new Work write, a folder for an existing Project (FR-19). */
  coreStore: CoreStore;
  /** The OS whose paths a folder must be; this computer's unless a test names one. */
  platform?: NodeJS.Platform;
  /**
   * FR-13: a confirmed new Project takes in its conversation when that has no Project. The
   * conversation is Chat's to write, so the server supplies this, bound to the revision the
   * card was confirmed against and recording both actors (FR-19). It returns a refusal code
   * (FR-23, or `revision_stale`) or null when the conversation joined.
   */
  joinConversationProject(channelId: string, projectId: string, options: {
    expectedRevision: number;
    actorId: string;
    confirmedByActorId: string;
  }): Promise<string | null>;
}

export function createWorkProposalKinds(options: WorkProposalKindOptions): ConversationProposalKind[] {
  const capture: ConversationProposalKind = {
    kind: WORK_PROPOSAL_CAPTURE,
    level: 'work',
    validate(content, context) {
      const items = (content as { items?: unknown })?.items;
      if (!Array.isArray(items) || items.length === 0 || items.length > WORK_PROPOSAL_MAX_ITEMS) {
        throw new ConversationProposalRefusal('invalid_arguments', `items must hold 1 to ${WORK_PROPOSAL_MAX_ITEMS} Work Items.`);
      }
      return {
        items: items.map((entry) => {
          const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
          const input = {
            title: proposalLine(item.title, 'title', PROPOSAL_TITLE_LIMIT) ?? '',
            summary: proposalLine(item.summary, 'summary', PROPOSAL_SUMMARY_LIMIT),
            kind: optionalString(item.kind, 'kind') as WorkItemKind | undefined,
            priority: optionalString(item.priority, 'priority') as WorkItemPriorityHint | undefined,
            status: 'draft' as const,
            source: { surface: 'chat' as const, conversationId: context.conversationId, channelId: context.channelId },
          };
          const errors = validateWorkItemCaptureInput(input);
          if (errors.length > 0) refuseInvalid(errors, 'A Work Item is not valid.');
          return { title: input.title, summary: input.summary ?? null, kind: input.kind ?? null, priority: input.priority ?? null };
        }).map((item, index, all) => {
          // Capture is keyed by title and summary: two alike would write one Work Item.
          const key = `${item.title.toLowerCase()}\n${(item.summary ?? '').toLowerCase()}`;
          if (all.findIndex((other) => `${other.title.toLowerCase()}\n${(other.summary ?? '').toLowerCase()}` === key) !== index) {
            throw new ConversationProposalRefusal('duplicate_items', 'Two proposed Work Items have the same title and summary.');
          }
          return item;
        }),
      };
    },
    // The Project the new Work Items join: a change to it makes the card out of date.
    binding: (_content, context) => ({
      workProjectId: context.workProjectId,
      workProjectRevision: context.workProjectRevision,
      project: context.workProjectId ? projectBinding(context.core.projects.find((entry) => entry.id === context.workProjectId)) : null,
    }),
    describe(content, context): ConversationProposalView {
      const items = content.items as Array<Record<string, string | null>>;
      return {
        title: items.length === 1 ? 'New Work Item' : `${items.length} new Work Items`,
        fields: items.flatMap((item, index) => [
          { name: `${index + 1}. title`, value: text(item.title) },
          ...(item.summary ? [{ name: `${index + 1}. summary`, value: text(item.summary) }] : []),
          ...(item.kind ? [{ name: `${index + 1}. kind`, value: cleanRecordValue(item.kind) }] : []),
          ...(item.priority ? [{ name: `${index + 1}. priority`, value: cleanRecordValue(item.priority) }] : []),
        ]),
        records: [{ kind: 'conversation', id: null, title: 'This conversation' }, ...projectRecord(context, context.workProjectId)],
        // A new Work Item has no Task, so no supervised run starts from it yet (FR-16).
        folderWarning: null,
      };
    },
    async perform(content, context, actors) {
      const items = content.items as Array<Record<string, string | null>>;
      const ids: string[] = [];
      for (const item of items) {
        const result = applied(await options.intake.capture({
          title: item.title!,
          ...(item.summary ? { summary: item.summary } : {}),
          ...(item.kind ? { kind: item.kind as WorkItemKind } : {}),
          ...(item.priority ? { priority: item.priority as WorkItemPriorityHint } : {}),
          status: 'draft',
          source: { surface: 'chat', conversationId: context.conversationId, channelId: context.channelId },
        }, {
          actorRef: proposerActor(actors.proposerParticipantId, context),
          confirmedByActorId: actors.ownerActorId,
          // FR-12, FR-19: the new Work write, capture into the conversation's Project.
          ...(context.workProjectId ? { intoProjectId: context.workProjectId } : {}),
        }));
        ids.push(result.workItemId);
      }
      return { summary: `Captured ${ids.length} Work Item${ids.length === 1 ? '' : 's'}: ${ids.join(', ')}` };
    },
  };

  const update: ConversationProposalKind = {
    kind: WORK_PROPOSAL_UPDATE,
    level: 'work',
    validate(content, context) {
      const raw = content && typeof content === 'object' ? content as Record<string, unknown> : {};
      const workItem = requireCapturedWorkItem(context.core, context.conversationId, raw.workItemId);
      const input = {
        workItemId: workItem.id,
        title: proposalLine(raw.title, 'title', PROPOSAL_TITLE_LIMIT),
        summary: proposalLine(raw.summary, 'summary', PROPOSAL_SUMMARY_LIMIT),
        status: optionalString(raw.status, 'status') as WorkItemTriageStatus | undefined,
        kind: optionalString(raw.kind, 'kind') as WorkItemKind | undefined,
        priority: optionalString(raw.priority, 'priority') as WorkItemPriorityHint | undefined,
      };
      if (!input.title && !input.summary && !input.status && !input.kind && !input.priority) {
        throw new ConversationProposalRefusal('invalid_arguments', 'Name at least one field to change.');
      }
      const errors = validateWorkItemUpdateInput(input);
      if (errors.length > 0) refuseInvalid(errors, 'The change is not valid.');
      return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    },
    binding: (content, context) => workItemBinding(context.core.workItems.find((entry) => entry.id === content.workItemId)),
    describe(content, context): ConversationProposalView {
      const workItem = context.core.workItems.find((entry) => entry.id === content.workItemId);
      return {
        title: 'Change to a Work Item',
        fields: (['title', 'summary', 'status', 'kind', 'priority'] as const)
          .filter((field) => typeof content[field] === 'string')
          .map((field) => ({ name: field, value: field === 'title' || field === 'summary'
            ? text(content[field]) : cleanRecordValue(content[field] as string) })),
        records: [{ kind: 'work_item', id: cleanRecordValue(String(content.workItemId)), title: text(workItem?.title) }],
        folderWarning: null,
      };
    },
    async perform(content, context, actors) {
      requireCapturedWorkItem(context.core, context.conversationId, content.workItemId);
      applied(await options.triage.updateWorkItem(content as never, {
        actorRef: proposerActor(actors.proposerParticipantId, context), confirmedByActorId: actors.ownerActorId,
      }));
      return { summary: `Updated Work Item ${String(content.workItemId)}` };
    },
  };

  const assign: ConversationProposalKind = {
    kind: WORK_PROPOSAL_ASSIGN_PROJECT,
    level: 'work',
    validate(content, context) {
      const raw = content && typeof content === 'object' ? content as Record<string, unknown> : {};
      const workItem = requireCapturedWorkItem(context.core, context.conversationId, raw.workItemId);
      const project = requireProject(context.core, raw.projectId);
      // FR-12: a participant who is not the admin coordinator may name only the conversation's
      // own Project; the tool marks such a card, and it stays bound to that Project.
      const conversationScope = raw.scope === CONVERSATION_PROJECT_SCOPE;
      if (conversationScope && project.id !== context.workProjectId) {
        throw new ConversationProposalRefusal('not_conversation_project', "That is not this conversation's Project.");
      }
      const errors = validateWorkItemAssignProjectInput({ workItemId: workItem.id, projectId: project.id });
      if (errors.length > 0) refuseInvalid(errors, 'The assignment is not valid.');
      return { workItemId: workItem.id, projectId: project.id, ...(conversationScope ? { scope: CONVERSATION_PROJECT_SCOPE } : {}) };
    },
    binding: (content, context) => ({
      workItem: workItemBinding(context.core.workItems.find((entry) => entry.id === content.workItemId)),
      project: projectBinding(context.core.projects.find((entry) => entry.id === content.projectId)),
      ...(content.scope === CONVERSATION_PROJECT_SCOPE
        ? { workProjectId: context.workProjectId, workProjectRevision: context.workProjectRevision } : {}),
    }),
    describe(content, context): ConversationProposalView {
      const workItem = context.core.workItems.find((entry) => entry.id === content.workItemId);
      const project = context.core.projects.find((entry) => entry.id === content.projectId);
      // FR-16: a Work Item with a Task, put into a Project with a folder, starts its supervised
      // runs there without asking.
      const folderWarning = project?.repoPath && workItem?.taskId
        ? projectFolderWarning(context, project.id, project.repoPath)
        : null;
      return {
        title: 'Put a Work Item into a Project',
        fields: [{ name: 'project', value: text(project?.title) }],
        records: [
          { kind: 'work_item', id: cleanRecordValue(String(content.workItemId)), title: text(workItem?.title) },
          { kind: 'project', id: cleanRecordValue(String(content.projectId)), title: text(project?.title) },
        ],
        folderWarning,
      };
    },
    async perform(content, context, actors) {
      requireCapturedWorkItem(context.core, context.conversationId, content.workItemId);
      requireProject(context.core, content.projectId);
      if (content.scope === CONVERSATION_PROJECT_SCOPE && content.projectId !== context.workProjectId) {
        throw new ConversationProposalRefusal('not_conversation_project', "The conversation's Project changed.");
      }
      applied(await options.triage.assignWorkItemProject({
        workItemId: String(content.workItemId), projectId: String(content.projectId),
      }, { actorRef: proposerActor(actors.proposerParticipantId, context), confirmedByActorId: actors.ownerActorId }));
      return { summary: `Put Work Item ${String(content.workItemId)} into Project ${String(content.projectId)}` };
    },
  };

  const createProject: ConversationProposalKind = {
    kind: WORK_PROPOSAL_CREATE_PROJECT,
    level: 'work',
    validate(content) {
      const raw = content && typeof content === 'object' ? content as Record<string, unknown> : {};
      const title = proposalLine(raw.title, 'title', PROPOSAL_TITLE_LIMIT);
      if (!title) throw new ConversationProposalRefusal('invalid_arguments', 'title is required.');
      const summary = proposalLine(raw.summary, 'summary', PROPOSAL_SUMMARY_LIMIT);
      const requested = raw.folder ?? raw.repoPath;
      const folder = requested === undefined || requested === null ? null : normalizeWorkProjectFolder(requested, options.platform);
      if (requested !== undefined && requested !== null && !folder) {
        throw new ConversationProposalRefusal('invalid_folder', 'The folder must be an absolute path on one line.');
      }
      // ADR-105's path may name a status; the tool does not.
      const status = optionalString(raw.status, 'status') ?? 'planned';
      // Work's own checks, so a card the owner confirms is one Work accepts.
      const errors = validateWorkProjectCreateInput({ title, ...(summary ? { summary } : {}), status,
        ...(folder ? { repoPath: folder } : {}) });
      if (errors.length > 0) refuseInvalid(errors, 'The Project is not valid.');
      return { title, ...(summary ? { summary } : {}), status, ...(folder ? { folder } : {}) };
    },
    // Whether the conversation joins the new Project, and what moves with it, as they are now.
    binding: (_content, context) => ({
      workProjectId: context.workProjectId,
      workProjectRevision: context.workProjectRevision,
      parallelMember: context.parallelMember,
      children: joinsNewProject(context) ? conversationMoveView(context.core, context.channelId).binding : [],
    }),
    describe(content, context): ConversationProposalView {
      const joins = joinsNewProject(context);
      const moves = joins ? conversationMoveView(context.core, context.channelId) : null;
      return {
        title: 'New Project',
        fields: [
          { name: 'title', value: text(content.title) },
          ...(content.summary ? [{ name: 'summary', value: text(content.summary) }] : []),
          { name: 'status', value: cleanRecordValue(String(content.status ?? 'planned')) },
          { name: 'folder', value: folderText(content.folder) },
          ...(moves?.fields ?? []),
        ],
        records: [{ kind: 'conversation', id: null, title: joins
          ? 'This conversation, as its primary conversation, which joins the new Project'
          : 'This conversation, as its primary conversation' }, ...(moves?.records ?? [])],
        // FR-16: a new Project with a folder starts its supervised runs there without asking,
        // including those of the conversation's Task and the Work Items that move with it.
        folderWarning: typeof content.folder === 'string' ? {
          folder: folderText(content.folder) ?? '',
          otherConversations: 0,
          workItems: moves?.children.length ?? 0,
        } : null,
      };
    },
    async perform(content, context, actors) {
      const result = applied(await options.triage.createProject({
        title: String(content.title),
        ...(content.summary ? { summary: String(content.summary) } : {}),
        status: (content.status ?? 'planned') as never,
        ...(typeof content.folder === 'string' ? { repoPath: content.folder } : {}),
        // FR-28: confirming a new Project from a conversation makes it the primary conversation.
        primaryConversationId: context.conversationId,
      }, { actorRef: proposerActor(actors.proposerParticipantId, context), confirmedByActorId: actors.ownerActorId }));
      // Create is keyed by title and folder: a match returns an existing Project, which this card
      // did not describe. Nothing joins it.
      if (!result.created) {
        throw new ConversationProposalRefusal('project_exists',
          'A Project with this title and folder already exists; nothing was created or joined.');
      }
      // FR-13: the conversation joins it when it has no Project and can belong to one.
      if (!joinsNewProject(context)) return { summary: `Created Project ${result.projectId}` };
      const refusal = await options.joinConversationProject(context.channelId, result.projectId, {
        expectedRevision: context.workProjectRevision,
        actorId: proposerActor(actors.proposerParticipantId, context),
        confirmedByActorId: actors.ownerActorId,
      });
      return { summary: refusal
        ? `Created Project ${result.projectId}; the conversation did not join it (${refusal})`
        : `Created Project ${result.projectId}, and the conversation joined it` };
    },
  };

  // FR-13: the folder of the conversation's Project, for an admin coordinator. Other conversations'
  // supervised runs may start there, so the card counts them (FR-16).
  const projectFolder: ConversationProposalKind = {
    kind: WORK_PROPOSAL_PROJECT_FOLDER,
    level: 'work',
    validate(content, context) {
      if (!context.workProjectId) {
        throw new ConversationProposalRefusal('no_conversation_project', 'This conversation belongs to no Project.');
      }
      const project = requireProject(context.core, context.workProjectId);
      const folder = normalizeWorkProjectFolder((content as { folder?: unknown } | null)?.folder, options.platform);
      if (!folder) throw new ConversationProposalRefusal('invalid_folder', 'The folder must be an absolute path on one line.');
      if (folder === project.repoPath) throw new ConversationProposalRefusal('unchanged', 'That is already the Project\'s folder.');
      return { projectId: project.id, folder };
    },
    binding: (content, context) => ({
      workProjectId: context.workProjectId,
      workProjectRevision: context.workProjectRevision,
      project: projectBinding(context.core.projects.find((entry) => entry.id === content.projectId)),
    }),
    describe(content, context): ConversationProposalView {
      const project = context.core.projects.find((entry) => entry.id === content.projectId);
      return {
        title: "Set the folder of this conversation's Project",
        fields: [
          { name: 'folder', value: folderText(content.folder) },
          { name: 'previous folder', value: folderText(project?.repoPath) },
        ],
        records: projectRecord(context, String(content.projectId)),
        folderWarning: projectFolderWarning(context, String(content.projectId), content.folder),
      };
    },
    async perform(content, context, actors) {
      // FR-14: only the Project the conversation is in.
      if (context.workProjectId !== content.projectId) {
        throw new ConversationProposalRefusal('not_conversation_project', "The conversation's Project changed.");
      }
      applied(await setWorkProjectFolder(options.coreStore, {
        projectId: String(content.projectId), folder: String(content.folder),
      }, { actorRef: proposerActor(actors.proposerParticipantId, context), confirmedByActorId: actors.ownerActorId },
      { platform: options.platform }));
      return { summary: `Set the folder of Project ${String(content.projectId)}` };
    },
  };

  return [capture, update, assign, createProject, projectFolder];
}

/** FR-13, FR-22: a new Project takes in its conversation when that has no Project and may have one. */
function joinsNewProject(context: ConversationProposalContext): boolean {
  return !context.workProjectId && !context.parallelMember && context.level === 'work';
}
