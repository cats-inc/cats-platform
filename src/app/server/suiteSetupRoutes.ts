import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import type { SuiteSetupCompleteInput } from '../../shared/suite-contract.js';
import { readSuitePreferences, writeSuitePreferences } from '../../shared/suitePreferences.js';
import { createCat } from '../../products/chat/state/model/index.js';
import {
  buildAppShellPayload,
  type ChatApiDependencies,
} from '../../products/chat/api/routeSupport.js';
import type { RouteContext } from '../../shared/http.js';

export type SuiteSetupContext = RouteContext<ChatApiDependencies>;

function reportSyncFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-suite-setup] ${scope}: ${message}\n`);
}

async function handleSuiteSetupComplete(
  context: SuiteSetupContext,
): Promise<void> {
  try {
    const body = await readJsonBody<SuiteSetupCompleteInput>(context.request);
    const now = context.dependencies.now?.() ?? new Date();
    let core = await context.dependencies.chatStore.readCore();
    let chatState = await context.dependencies.chatStore.read();

    if (core.setupCompleteAt) {
      sendJson(context.response, 409, {
        error: {
          code: 'already_complete',
          message: 'Setup has already been completed',
        },
      });
      return;
    }

    const ownerDisplayName = body.ownerDisplayName?.trim() || 'Owner';

    if (body.createBossCat && body.selectedProduct === 'chat') {
      const previousCatIds = new Set(chatState.cats.map((cat) => cat.id));
      chatState = createCat(
        chatState,
        {
          name: body.bossCatName?.trim() || 'Boss Cat',
          provider: body.bossCatProvider || 'claude',
          instance: body.bossCatInstance,
          model: body.bossCatModel,
        },
        now,
      );

      const bossCat = chatState.cats.find((cat) => !previousCatIds.has(cat.id));
      if (!bossCat) {
        sendJson(context.response, 500, {
          error: { code: 'internal_error', message: 'Failed to create Boss Cat' },
        });
        return;
      }

      chatState = {
        ...chatState,
        bossCatId: bossCat.id,
        globalOrchestrator: {
          ...chatState.globalOrchestrator,
          executionTarget: {
            provider: body.bossCatProvider || 'claude',
            instance: body.bossCatInstance?.trim() || null,
            model: body.bossCatModel ?? null,
          },
        },
      };
    }

    core = {
      ...core,
      setupCompleteAt: now.toISOString(),
      ownerProfile: {
        ...core.ownerProfile,
        displayName: ownerDisplayName,
        avatarColor: core.ownerProfile.avatarColor ?? '#90A4AE',
        updatedAt: now.toISOString(),
      },
    };

    await context.dependencies.chatStore.write(chatState);
    await context.dependencies.chatStore.writeCore(core);

    await writeSuitePreferences(context.dependencies.config.chatStatePath, {
      lastProductSurface: body.selectedProduct,
    });

    try {
      await context.dependencies.memoryService.flushOwnerProfile({
        reason: 'owner_profile_sync',
        now,
      });
    } catch (error) {
      reportSyncFailure('setup_complete', error);
    }

    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message },
    });
  }
}

export async function routeSuiteSetupApi(
  context: SuiteSetupContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/suite/setup/complete') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleSuiteSetupComplete(context);
    return true;
  }

  return false;
}
