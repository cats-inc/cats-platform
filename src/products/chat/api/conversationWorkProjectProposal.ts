import {
  CONVERSATION_WORK_PROJECT_PROPOSAL_KIND,
  ConversationProposalRefusal,
  type ConversationProposalContext,
  type ConversationProposalKind,
  type ConversationProposalView,
} from '../../../platform/proposals/contracts.js';
import { cleanRecordValue, fenceRecordText } from '../../shared/conversationRecordTools.js';
import { hasActiveSupervisedRun } from '../state/model/workProject.js';
import { conversationMoveView } from '../../work/agentTools/workConversationProposals.js';
import { visibleWorkProjectFolder } from '../../work/state/workProjectFolder.js';
import type { ChatStore } from '../state/store.js';
import { applyChannelWorkProject } from './conversationWorkProject.js';

/**
 * SPEC-142 FR-13, FR-22, FR-23: putting the conversation into a Project, proposed by an admin
 * coordinator and performed on the owner's confirmation. It is a write to the conversation, not
 * to Work, through the same path as the owner's own control.
 */
export const CONVERSATION_WORK_PROJECT_PROPOSAL = CONVERSATION_WORK_PROJECT_PROPOSAL_KIND;

const REFUSAL_MESSAGES: Record<string, string> = {
  parallel_member: 'A conversation in a parallel group cannot belong to a Project.',
  direct_lane: 'A direct lane cannot belong to a Project.',
  not_work_level: 'Only a conversation at Work can belong to a Project.',
  conversation_archived: 'An archived conversation cannot change its Project.',
  project_not_found: 'No such Project.',
  project_archived: 'That Project is archived.',
  supervised_run_active: 'A supervised run of this conversation is queued, running or waiting for approval.',
  revision_stale: "The conversation's Project changed since the card was posted.",
};

function refuse(code: string): never {
  throw new ConversationProposalRefusal(code, REFUSAL_MESSAGES[code] ?? 'The conversation cannot change its Project now.');
}


function projectOf(context: ConversationProposalContext, projectId: unknown) {
  return typeof projectId === 'string' ? context.core.projects.find((entry) => entry.id === projectId) : undefined;
}

export function createConversationWorkProjectProposalKind(options: {
  chatStore: ChatStore;
  now: () => Date;
}): ConversationProposalKind {
  return {
    kind: CONVERSATION_WORK_PROJECT_PROPOSAL,
    level: 'work',
    validate(content, context) {
      const raw = content && typeof content === 'object' ? content as Record<string, unknown> : {};
      if (context.parallelMember) refuse('parallel_member');
      const projectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : '';
      if (!projectId) throw new ConversationProposalRefusal('invalid_arguments', 'projectId is required.');
      const project = projectOf(context, projectId);
      if (!project) refuse('project_not_found');
      if (project.status === 'archived') refuse('project_archived');
      if (context.workProjectId === project.id) {
        throw new ConversationProposalRefusal('unchanged', 'The conversation is already in that Project.');
      }
      // FR-23: not while a supervised run of the conversation's Tasks is under way.
      if (hasActiveSupervisedRun(context.core, context.conversationId)) refuse('supervised_run_active');
      return { projectId: project.id };
    },
    binding(content, context) {
      const project = projectOf(context, content.projectId);
      return {
        workProjectId: context.workProjectId,
        workProjectRevision: context.workProjectRevision,
        project: project ? { id: project.id, updatedAt: project.updatedAt, status: project.status, repoPath: project.repoPath } : null,
        children: conversationMoveView(context.core, context.channelId).binding,
      };
    },
    describe(content, context): ConversationProposalView {
      const project = projectOf(context, content.projectId);
      const previous = projectOf(context, context.workProjectId);
      const folder = visibleWorkProjectFolder(project?.repoPath);
      const moves = conversationMoveView(context.core, context.channelId);
      return {
        title: 'Put this conversation into a Project',
        fields: [
          { name: 'project', value: fenceRecordText(project?.title, 161) },
          ...(previous ? [{ name: 'previous project', value: fenceRecordText(previous.title, 161) }] : []),
          ...moves.fields,
        ],
        records: [
          { kind: 'conversation', id: null, title: 'This conversation' },
          { kind: 'project', id: cleanRecordValue(String(content.projectId)), title: fenceRecordText(project?.title, 161) },
          ...moves.records,
        ],
        // FR-16, FR-26: the conversation's supervised runs then start in the Project's folder.
        folderWarning: folder && project ? {
          folder,
          otherConversations: context.otherConversationsInProject(project.id),
          workItems: context.core.workItems.filter((entry) => entry.projectId === project.id).length,
        } : null,
      };
    },
    async perform(content, context, actors) {
      const outcome = await applyChannelWorkProject(options.chatStore, {
        channelId: context.channelId,
        projectId: String(content.projectId),
        // FR-18: the revision the card was bound to, so a change since then is refused.
        expectedRevision: context.workProjectRevision,
        now: options.now(),
        actorId: actors.proposerParticipantId ? `chat-participant:${actors.proposerParticipantId}` : actors.ownerActorId,
        confirmedByActorId: actors.ownerActorId,
      });
      if ('refusal' in outcome) refuse(outcome.refusal);
      return { summary: `The conversation joined Project ${String(content.projectId)}` };
    },
  };
}
