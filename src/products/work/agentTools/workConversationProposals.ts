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

/**
 * SPEC-142 FR-12 to FR-14, FR-19: the Work writes a conversation's agents may propose without a
 * Project of their own (PLAN-135 Phase 4). Each is performed on the owner's confirmation through
 * Work's existing delegate, which records the proposer and the confirming owner.
 */

export const WORK_PROPOSAL_CAPTURE = 'work.item.capture';
export const WORK_PROPOSAL_UPDATE = 'work.item.update';
export const WORK_PROPOSAL_ASSIGN_PROJECT = 'work.item.assign_project';
export const WORK_PROPOSAL_CREATE_PROJECT = 'work.project.create';
export const WORK_PROPOSAL_MAX_ITEMS = 8;

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
  const line = value.replace(/\p{Cf}/gu, '').replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/gu, ' ').trim();
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

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ConversationProposalRefusal('invalid_arguments', `${name} must be text.`);
  return value.trim() || undefined;
}

export interface WorkProposalKindOptions {
  intake: Pick<WorkIntakeDelegate, 'capture'>;
  triage: Pick<WorkTriageDelegate, 'updateWorkItem' | 'assignWorkItemProject' | 'createProject'>;
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
    // New records touch nothing yet; Phase 5 adds the conversation's Project.
    binding: () => null,
    describe(content): ConversationProposalView {
      const items = content.items as Array<Record<string, string | null>>;
      return {
        title: items.length === 1 ? 'New Work Item' : `${items.length} new Work Items`,
        fields: items.flatMap((item, index) => [
          { name: `${index + 1}. title`, value: text(item.title) },
          ...(item.summary ? [{ name: `${index + 1}. summary`, value: text(item.summary) }] : []),
          ...(item.kind ? [{ name: `${index + 1}. kind`, value: cleanRecordValue(item.kind) }] : []),
          ...(item.priority ? [{ name: `${index + 1}. priority`, value: cleanRecordValue(item.priority) }] : []),
        ]),
        records: [{ kind: 'conversation', id: null, title: 'This conversation' }],
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
        }, { actorRef: proposerActor(actors.proposerParticipantId, context), confirmedByActorId: actors.ownerActorId }));
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
      const errors = validateWorkItemAssignProjectInput({ workItemId: workItem.id, projectId: project.id });
      if (errors.length > 0) refuseInvalid(errors, 'The assignment is not valid.');
      return { workItemId: workItem.id, projectId: project.id };
    },
    binding: (content, context) => ({
      workItem: workItemBinding(context.core.workItems.find((entry) => entry.id === content.workItemId)),
      project: projectBinding(context.core.projects.find((entry) => entry.id === content.projectId)),
    }),
    describe(content, context): ConversationProposalView {
      const workItem = context.core.workItems.find((entry) => entry.id === content.workItemId);
      const project = context.core.projects.find((entry) => entry.id === content.projectId);
      // FR-16: a Work Item with a Task, put into a Project with a folder, starts its supervised
      // runs there without asking.
      const folderWarning = project?.repoPath && workItem?.taskId ? {
        folder: cleanRecordValue(project.repoPath) ?? '',
        otherConversations: new Set(context.core.workItems
          .filter((entry) => entry.projectId === project.id && entry.conversationId && entry.conversationId !== context.conversationId)
          .map((entry) => entry.conversationId)).size,
        workItems: context.core.workItems.filter((entry) => entry.projectId === project.id).length,
      } : null;
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
      if (raw.repoPath !== undefined || raw.folder !== undefined) {
        // PLAN-135 Phase 5 adds a folder, with its warning.
        throw new ConversationProposalRefusal('folder_not_supported', 'A new Project with a folder is not offered yet.');
      }
      const title = proposalLine(raw.title, 'title', PROPOSAL_TITLE_LIMIT);
      if (!title) throw new ConversationProposalRefusal('invalid_arguments', 'title is required.');
      const summary = proposalLine(raw.summary, 'summary', PROPOSAL_SUMMARY_LIMIT);
      // Work's own checks, so a card the owner confirms is one Work accepts.
      const errors = validateWorkProjectCreateInput({ title, ...(summary ? { summary } : {}), status: 'planned' });
      if (errors.length > 0) refuseInvalid(errors, 'The Project is not valid.');
      return { title, ...(summary ? { summary } : {}) };
    },
    binding: () => null,
    describe(content): ConversationProposalView {
      return {
        title: 'New Project',
        fields: [
          { name: 'title', value: text(content.title) },
          ...(content.summary ? [{ name: 'summary', value: text(content.summary) }] : []),
          { name: 'folder', value: null },
        ],
        records: [{ kind: 'conversation', id: null, title: 'This conversation, as its primary conversation' }],
        folderWarning: null,
      };
    },
    async perform(content, context, actors) {
      const result = applied(await options.triage.createProject({
        title: String(content.title),
        ...(content.summary ? { summary: String(content.summary) } : {}),
        status: 'planned',
        // FR-28: confirming a new Project from a conversation makes it the primary conversation.
        primaryConversationId: context.conversationId,
      }, { actorRef: proposerActor(actors.proposerParticipantId, context), confirmedByActorId: actors.ownerActorId }));
      return { summary: `Created Project ${result.projectId}` };
    },
  };

  return [capture, update, assign, createProject];
}
