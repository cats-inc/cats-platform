import { patchOwnerProfile } from '../model.js';
import {
  handleCoreError,
  readNullableString,
  readObjectBody,
  readOptionalString,
  readStringArray,
} from './shared.js';
import type { CoreApiRouteContext } from './types.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

function reportCoreMemorySyncFailure(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-memory-sync] owner-profile: ${message}\n`);
}

async function handleOwnerProfile(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { ownerProfile: core.ownerProfile });
}

async function handleOwnerProfileWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const body = await readObjectBody(context);
    const next = patchOwnerProfile(
      await context.dependencies.coreStore.readCore(),
      {
        displayName: readOptionalString(body.displayName, 'displayName'),
        avatarColor: readNullableString(body.avatarColor, 'avatarColor'),
        summary: readNullableString(body.summary, 'summary'),
        communicationPreferences: readStringArray(
          body.communicationPreferences,
          'communicationPreferences',
        ),
        decisionPreferences: readStringArray(
          body.decisionPreferences,
          'decisionPreferences',
        ),
        escalationPreferences: readStringArray(
          body.escalationPreferences,
          'escalationPreferences',
        ),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    if (context.dependencies.memoryService) {
      try {
        await context.dependencies.memoryService.flushOwnerProfile({
          reason: 'owner_profile_sync',
        });
      } catch (error) {
        reportCoreMemorySyncFailure(error);
      }
    }
    sendJson(context.response, 200, {
      ownerProfile: persisted.ownerProfile,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreOwnerProfileApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/core/owner-profile') {
    return false;
  }

  if (context.method === 'GET') {
    await handleOwnerProfile(context);
    return true;
  }
  if (context.method === 'PATCH') {
    await handleOwnerProfileWrite(context);
    return true;
  }
  sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
  return true;
}
