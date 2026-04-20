import { readJsonBody, sendJson } from '../../../../shared/http.js';
import { createParallelChatGroup } from '../../state/model/index.js';
import type { CreateParallelChatGroupInput } from '../contracts.js';
import {
  buildAppShellPayload,
  handleRestError,
  nowFrom,
  persistDeletedParallelChatGroup,
  persistRenamedParallelChatGroup,
  persistUngroupedParallelChatGroup,
  resolveCreateOriginSurface,
  sendRestError,
  type ChatApiRouteContext,
} from '../routeSupport.js';
import type { UpdateParallelChatGroupInput } from '../contracts.js';

export async function handleCreateParallelChatGroup(
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateParallelChatGroupInput>(context.request);
    if (!Array.isArray(body.targets) || body.targets.length < 2) {
      sendRestError(
        context,
        400,
        'compare_targets_required',
        'Parallel chats require at least two model targets.',
      );
      return;
    }
    const title = body.title?.trim();
    if (!title) {
      sendRestError(context, 400, 'title_required', 'Parallel chat title must not be empty.');
      return;
    }
    const originSurface = resolveCreateOriginSurface(body.originSurface, {
      targetNoun: 'Parallel chat create request',
    });

    const nextState = createParallelChatGroup(
      await context.dependencies.chatStore.read(),
      {
        title,
        originSurface,
        repoPath: body.repoPath,
        responseLanguage: body.responseLanguage,
        targets: body.targets,
        participantCatIds: body.participantCatIds,
        temporaryParticipants: body.temporaryParticipants,
      },
      nowFrom(context.dependencies),
    );
    const groupId = nextState.parallelChatGroups[0]?.id ?? '';
    const persisted = await context.dependencies.chatStore.write(nextState);
    const appShell = await buildAppShellPayload(context.dependencies, persisted);
    const group = appShell.chat.parallelChatGroups.find((candidate) => candidate.id === groupId);
    if (!group) {
      throw new Error('Parallel chat group was created but not returned in the app shell.');
    }

    sendJson(context.response, 201, {
      appShell,
      group,
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function handlePatchParallelChatGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<UpdateParallelChatGroupInput>(context.request);
    const title = body.title?.trim();
    if (!title) {
      sendRestError(context, 400, 'title_required', 'Parallel chat title must not be empty.');
      return;
    }

    await persistRenamedParallelChatGroup(context, groupId, title);
    sendJson(context.response, 200, { updated: true, groupId });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function handleUngroupParallelChatGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    await persistUngroupedParallelChatGroup(context, groupId);
    sendJson(context.response, 200, { ungrouped: true, groupId });
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function handleDeleteParallelChatGroup(
  context: ChatApiRouteContext,
  groupId: string,
): Promise<void> {
  try {
    await persistDeletedParallelChatGroup(context, groupId);
    sendJson(context.response, 200, { deleted: true, groupId });
  } catch (error) {
    handleRestError(context, error);
  }
}
