import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { applyChannelWorkProject, workProjectReach } from '../conversationWorkProject.js';
import { channelWorkProjectRevision, readChannelWorkProjectId, workProjectRefusal } from '../../state/model/workProject.js';
import { ChatApiError, handleRestError } from '../routeErrors.js';
import { nowFrom, type ChatApiRouteContext } from '../routeSupport.js';
import { publishChannelMutation } from '../transportEventPublisher.js';
import { isOwnerPrincipal } from './productScopeRoutes.js';
import { visibleWorkProjectFolder } from '../../../shared/workProjectDisplay.js';

/**
 * SPEC-142 FR-23: the owner sets, changes or clears a conversation's Project here, or by
 * confirming a proposal. Only an owner principal may read or call it.
 */
const WORK_PROJECT = /^\/api\/channels\/([^/]+)\/work-project$/u;

const REFUSAL_STATUS: Record<string, number> = {
  channel_not_found: 404,
  project_not_found: 404,
  revision_stale: 409,
  revision_required: 400,
  invalid_project: 400,
};

const REFUSAL_MESSAGES: Record<string, string> = {
  channel_not_found: 'Conversation not found.',
  not_work_level: 'Only a conversation at Work can belong to a Project.',
  direct_lane: 'A direct lane cannot belong to a Project.',
  parallel_member: 'A conversation in a parallel group cannot belong to a Project.',
  conversation_archived: 'An archived conversation cannot change its Project.',
  project_not_found: 'Project not found.',
  project_archived: 'That Project is archived.',
  supervised_run_active: 'A supervised run of this conversation is queued, running, blocked or waiting for approval.',
  revision_stale: "The conversation's Project changed since it was shown.",
};

export async function routeWorkProjectResourceApi(context: ChatApiRouteContext): Promise<boolean> {
  const match = matchRoute(context.url.pathname, WORK_PROJECT);
  if (!match) return false;
  const channelId = match[0]!;
  try {
    if (!isOwnerPrincipal(context.auth)) {
      throw new ChatApiError(403, 'owner_required', "Only the owner can change a conversation's Project.");
    }
    if (context.method === 'GET') {
      const state = await context.dependencies.chatStore.read();
      const core = await context.dependencies.chatStore.readCore();
      const channel = state.channels.find((entry) => entry.id === channelId);
      if (!channel) throw new ChatApiError(404, 'channel_not_found', 'Conversation not found.');
      const projectId = readChannelWorkProjectId(channel);
      const project = projectId ? core.projects.find((entry) => entry.id === projectId) ?? null : null;
      // A refusal that holds whatever is chosen: the level, a lane, a parallel member, a run.
      const standing = workProjectRefusal(state, core, channelId, null);
      sendJson(context.response, 200, {
        channelId,
        projectId,
        project: project ? { id: project.id, title: project.title, status: project.status, folder: visibleWorkProjectFolder(project.repoPath) } : null,
        revision: channelWorkProjectRevision(channel),
        canChange: standing === null,
        refusal: standing,
        // FR-16: the folder where the conversation's supervised runs would start, per Project.
        projects: core.projects.filter((entry) => entry.status !== 'archived').map((entry) => ({
          id: entry.id, title: entry.title, status: entry.status, folder: visibleWorkProjectFolder(entry.repoPath),
          ...workProjectReach(state, core, entry.id, channelId),
        })),
      }, { 'cache-control': 'no-store' });
      return true;
    }
    if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['GET', 'POST']); return true; }
    const parsed = await readJsonBody<{ projectId?: unknown; revision?: unknown } | null>(context.request);
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    if (typeof body.revision !== 'number' || !Number.isInteger(body.revision)) {
      throw new ChatApiError(400, 'revision_required', 'revision is the Project revision the owner saw.');
    }
    if (body.projectId !== null && (typeof body.projectId !== 'string' || !body.projectId)) {
      throw new ChatApiError(400, 'invalid_project', 'projectId is a Project id, or null to clear it.');
    }
    const projectId = body.projectId as string | null;
    const revision = body.revision;
    // One atomic snapshot write, checked against the revision the owner saw. It does not wait for
    // the conversation's gate, which a turn holds for its whole length; a turn's later write
    // cannot undo it (`keepOwnerWorkProjects`).
    const outcome = await applyChannelWorkProject(
      context.dependencies.chatStore, { channelId, projectId, expectedRevision: revision, now: nowFrom(context.dependencies) });
    if ('refusal' in outcome) {
      throw new ChatApiError(REFUSAL_STATUS[outcome.refusal] ?? 409, outcome.refusal,
        REFUSAL_MESSAGES[outcome.refusal] ?? 'The conversation cannot change its Project now.');
    }
    publishChannelMutation(context.dependencies.eventHub, channelId, 'updated');
    sendJson(context.response, 200, outcome);
    return true;
  } catch (error) {
    handleRestError(context, error);
    return true;
  }
}
