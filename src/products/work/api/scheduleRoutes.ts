import { OWNER_ACTOR_ID } from '../../../core/actors.js';
import { CoreConflictError, CoreNotFoundError } from '../../../core/errors.js';
import { handleCoreError } from '../../../core/api/shared.js';
import {
  createSchedulerService,
  type ScheduleAdmissionResult,
  type ScheduleRuleCreateInput,
  type ScheduleRuleUpdateInput,
} from '../../../platform/scheduler/index.js';
import {
  cancelScheduledRunThroughSupervision,
  launchScheduledRunThroughSupervision,
} from '../../../platform/supervision/scheduledRunExecution.js';
import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../shared/http.js';
import {
  WORK_API_SCHEDULES_PATH,
  WORK_API_SCHEDULE_DETAIL_PATTERN,
  WORK_API_SCHEDULE_TEST_FIRE_PATTERN,
} from '../shared/apiPaths.js';
import type { WorkApiRouteContext } from './index.js';

export async function routeWorkScheduleApi(
  context: WorkApiRouteContext,
): Promise<boolean> {
  const testFireMatch = matchRoute(context.url.pathname, WORK_API_SCHEDULE_TEST_FIRE_PATTERN);
  if (testFireMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    const scheduleId = testFireMatch[0];
    if (!scheduleId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_schedule_id', message: 'Schedule id is required.' },
      });
      return true;
    }

    try {
      const service = createWorkSchedulerService(context);
      const result = await launchAdmittedScheduleRun(
        context,
        await service.manualTestFire(scheduleId),
      );
      sendJson(context.response, result.status === 'admitted' ? 201 : 200, result);
    } catch (error) {
      handleCoreError(context, error);
    }
    return true;
  }

  const detailMatch = matchRoute(context.url.pathname, WORK_API_SCHEDULE_DETAIL_PATTERN);
  if (detailMatch) {
    const scheduleId = detailMatch[0];
    if (!scheduleId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_schedule_id', message: 'Schedule id is required.' },
      });
      return true;
    }

    if (context.method === 'GET') {
      try {
        const service = createWorkSchedulerService(context);
        const rule = await service.getRule(scheduleId);
        if (!rule) {
          throw new CoreNotFoundError(
            `Schedule rule not found: ${scheduleId}`,
            'schedule_rule_not_found',
          );
        }
        sendJson(context.response, 200, {
          rule,
          triggerReceipts: await service.listTriggerReceipts({ ruleId: scheduleId, limit: 50 }),
        });
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }

    if (context.method === 'PATCH') {
      try {
        const service = createWorkSchedulerService(context);
        const body = await readJsonBody<Record<string, unknown>>(context.request);
        const rule = await service.updateRule(scheduleId, body as ScheduleRuleUpdateInput);
        sendJson(context.response, 200, {
          rule,
          triggerReceipts: await service.listTriggerReceipts({ ruleId: scheduleId, limit: 50 }),
        });
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }

    sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
    return true;
  }

  if (context.url.pathname === WORK_API_SCHEDULES_PATH) {
    if (context.method === 'GET') {
      try {
        const service = createWorkSchedulerService(context);
        sendJson(context.response, 200, {
          rules: await service.listRules(),
          triggerReceipts: await service.listTriggerReceipts({ limit: 50 }),
        });
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }

    if (context.method === 'POST') {
      try {
        const service = createWorkSchedulerService(context);
        const body = await readJsonBody<Record<string, unknown>>(context.request);
        const rule = await service.createRule({
          ...body,
          createdByActorId: typeof body.createdByActorId === 'string'
            ? body.createdByActorId
            : OWNER_ACTOR_ID,
        } as ScheduleRuleCreateInput);
        sendJson(context.response, 201, {
          rule,
          triggerReceipts: await service.listTriggerReceipts({ ruleId: rule.id, limit: 50 }),
        });
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }

    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  return false;
}

function createWorkSchedulerService(context: WorkApiRouteContext) {
  const scheduleStore = context.dependencies.scheduleStore;
  if (!scheduleStore) {
    throw new CoreConflictError(
      'Schedule store is not configured.',
      'schedule_store_unavailable',
    );
  }

  return createSchedulerService({
    scheduleStore,
    coreStore: context.dependencies.coreStore,
    now: context.dependencies.now,
    replaceActiveRun: async (request) => {
      await cancelScheduledRunThroughSupervision({
        coreStore: context.dependencies.coreStore,
        runtimeClient: context.dependencies.runtimeClient,
        evidenceDataDir: context.dependencies.evidenceDataDir,
        now: () => new Date(request.requestedAt),
      }, request.runId, {
        requestedAt: request.requestedAt,
        reasonNote: [
          `Replaced by schedule rule ${request.ruleId}`,
          `trigger ${request.triggerReceiptId}.`,
        ].join(' '),
      });
    },
  });
}

async function launchAdmittedScheduleRun(
  context: WorkApiRouteContext,
  result: ScheduleAdmissionResult,
): Promise<ScheduleAdmissionResult> {
  if (result.status !== 'admitted' || !result.run || !context.dependencies.runtimeClient) {
    return result;
  }

  const launched = await launchScheduledRunThroughSupervision({
    coreStore: context.dependencies.coreStore,
    runtimeClient: context.dependencies.runtimeClient,
    evidenceDataDir: context.dependencies.evidenceDataDir,
    now: context.dependencies.now,
  }, result.run.id);
  if (!launched) {
    return result;
  }

  return {
    ...result,
    run: launched.run,
    mission: launched.mission ?? result.mission,
  };
}
