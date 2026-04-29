import { CoreNotFoundError, CoreValidationError } from '../../core/errors.js';
import { createCatActorId } from '../../core/actors.js';
import {
  upsertCoreMission,
  upsertCoreRun,
} from '../../core/model/index.js';
import type { CoreStore } from '../../core/store.js';
import type {
  CatsCoreState,
  CoreActorRecord,
  CoreRunRecord,
  MissionRecord,
} from '../../core/types.js';
import type {
  ScheduleRule,
  ScheduleRuleCreateInput,
  ScheduleRuleUpdateInput,
  ScheduleOriginalTargetRef,
  ScheduleTargetRef,
  ScheduleTriggerMetadata,
  ScheduleTriggerReceipt,
} from './contracts.js';
import {
  buildScheduleIdempotencyKey,
  collectDueFires,
  computeNextFireAfter,
  computeNextFireAt,
  type ScheduleDueFire,
} from './evaluator.js';
import type { ScheduleStore } from './store.js';
import {
  createScheduleRule,
  updateScheduleRule,
} from './validation.js';

export interface SchedulerService {
  listRules(): Promise<ScheduleRule[]>;
  getRule(ruleId: string): Promise<ScheduleRule | null>;
  createRule(input: ScheduleRuleCreateInput): Promise<ScheduleRule>;
  updateRule(ruleId: string, input: ScheduleRuleUpdateInput): Promise<ScheduleRule>;
  manualTestFire(ruleId: string): Promise<ScheduleAdmissionResult>;
  tick(options?: { startup?: boolean; maxFireAll?: number }): Promise<ScheduleTickResult>;
  listTriggerReceipts(filter?: {
    ruleId?: string;
    limit?: number;
  }): Promise<ScheduleTriggerReceipt[]>;
}

export interface SchedulerServiceDependencies {
  scheduleStore: ScheduleStore;
  coreStore: CoreStore;
  now?: () => Date;
  replaceActiveRun?: (request: ScheduleReplaceActiveRunRequest) => Promise<void>;
}

export interface ScheduleReplaceActiveRunRequest {
  runId: string;
  ruleId: string;
  triggerReceiptId: string;
  requestedAt: string;
}

export type ScheduleAdmissionStatus = 'admitted' | 'duplicate' | 'skipped' | 'failed';

export interface ScheduleAdmissionResult {
  status: ScheduleAdmissionStatus;
  receipt: ScheduleTriggerReceipt;
  rule: ScheduleRule;
  mission: MissionRecord | null;
  run: CoreRunRecord | null;
}

export interface ScheduleTickResult {
  evaluatedAt: string;
  results: ScheduleAdmissionResult[];
}

export function createSchedulerService(
  dependencies: SchedulerServiceDependencies,
): SchedulerService {
  return new DefaultSchedulerService(dependencies);
}

class DefaultSchedulerService implements SchedulerService {
  constructor(private readonly dependencies: SchedulerServiceDependencies) {}

  async listRules(): Promise<ScheduleRule[]> {
    return this.dependencies.scheduleStore.listRules();
  }

  async getRule(ruleId: string): Promise<ScheduleRule | null> {
    return this.dependencies.scheduleStore.getRule(ruleId);
  }

  async createRule(input: ScheduleRuleCreateInput): Promise<ScheduleRule> {
    const now = this.now();
    const created = createScheduleRule(input, now);
    const rule = {
      ...created,
      nextFireAt: computeNextFireAt(created, now),
    };
    return this.dependencies.scheduleStore.upsertRule(rule);
  }

  async updateRule(ruleId: string, input: ScheduleRuleUpdateInput): Promise<ScheduleRule> {
    const existing = await this.dependencies.scheduleStore.getRule(ruleId);
    if (!existing) {
      throw new CoreNotFoundError(`Schedule rule not found: ${ruleId}`, 'schedule_rule_not_found');
    }
    const now = this.now();
    const updated = updateScheduleRule(existing, input, now);
    const rule = {
      ...updated,
      nextFireAt: computeNextFireAt(updated, now),
    };
    return this.dependencies.scheduleStore.upsertRule(rule);
  }

  async manualTestFire(ruleId: string): Promise<ScheduleAdmissionResult> {
    const rule = await this.dependencies.scheduleStore.getRule(ruleId);
    if (!rule) {
      throw new CoreNotFoundError(`Schedule rule not found: ${ruleId}`, 'schedule_rule_not_found');
    }
    const now = this.now();
    return this.admitFire(rule, {
      scheduledFireAt: now.toISOString(),
      reason: 'manual_test',
    }, now);
  }

  async tick(
    options: { startup?: boolean; maxFireAll?: number } = {},
  ): Promise<ScheduleTickResult> {
    const now = this.now();
    const ruleIds = (await this.dependencies.scheduleStore.listRules()).map((rule) => rule.id);
    const results: ScheduleAdmissionResult[] = [];

    for (const ruleId of ruleIds) {
      const rule = await this.dependencies.scheduleStore.getRule(ruleId);
      if (!rule) {
        continue;
      }
      const fires = collectDueFires({
        rule,
        now,
        startup: options.startup,
        maxFireAll: options.maxFireAll,
      });
      for (const fire of fires) {
        const latestRule = await this.dependencies.scheduleStore.getRule(ruleId);
        if (!latestRule) {
          continue;
        }
        if (options.startup && latestRule.executionPolicy.misfirePolicy === 'skip') {
          results.push(await this.skipFire(
            latestRule,
            fire,
            now,
            'Skipped startup misfire by policy.',
          ));
          continue;
        }
        results.push(await this.admitFire(latestRule, fire, now));
      }
    }

    return {
      evaluatedAt: now.toISOString(),
      results,
    };
  }

  async listTriggerReceipts(filter?: {
    ruleId?: string;
    limit?: number;
  }): Promise<ScheduleTriggerReceipt[]> {
    return this.dependencies.scheduleStore.listTriggerReceipts(filter);
  }

  private now(): Date {
    return this.dependencies.now?.() ?? new Date();
  }

  private async skipFire(
    rule: ScheduleRule,
    fire: ScheduleDueFire,
    actualFireAt: Date,
    message: string,
  ): Promise<ScheduleAdmissionResult> {
    const receipt = await this.claimReceipt(rule, fire, actualFireAt);
    if (!receipt.created) {
      return {
        status: 'duplicate',
        receipt: receipt.receipt,
        rule,
        mission: null,
        run: null,
      };
    }
    const skipped = await this.dependencies.scheduleStore.updateTriggerReceipt(
      receipt.receipt.id,
      {
        status: 'skipped',
        message,
      },
    );
    const updatedRule = await this.advanceRuleAfterFire(rule, fire.scheduledFireAt, {
      lastRunId: null,
      lastFailure: null,
    });

    return {
      status: 'skipped',
      receipt: skipped,
      rule: updatedRule,
      mission: null,
      run: null,
    };
  }

  private async admitFire(
    rule: ScheduleRule,
    fire: ScheduleDueFire,
    actualFireAt: Date,
  ): Promise<ScheduleAdmissionResult> {
    const receiptClaim = await this.claimReceipt(rule, fire, actualFireAt);
    if (!receiptClaim.created) {
      return {
        status: 'duplicate',
        receipt: receiptClaim.receipt,
        rule,
        mission: null,
        run: null,
      };
    }

    try {
      if (rule.executionPolicy.concurrencyPolicy === 'replace') {
        await this.cancelActiveRunsForReplace(rule, receiptClaim.receipt);
      }

      let skippedBecauseActive = false;
      let admittedMissionId: string | null = null;
      let admittedRunId: string | null = null;
      const persisted = await updateCoreAtomically(this.dependencies.coreStore, (core) => {
        const activeRuns = findActiveScheduleRuns(core, rule.id);
        if (activeRuns.length > 0 && rule.executionPolicy.concurrencyPolicy === 'skip') {
          skippedBecauseActive = true;
          return core;
        }
        if (activeRuns.length > 0 && rule.executionPolicy.concurrencyPolicy === 'replace') {
          throw new CoreValidationError(
            'Schedule replace cancellation did not clear active runs.',
            'schedule_concurrency_replace_active_runs_remaining',
          );
        }

        const assignedAgent = resolveScheduleTargetAgent(core, rule.missionTemplate.target);
        const admission = admitMissionAndRun({
          core,
          rule,
          receipt: receiptClaim.receipt,
          assignedAgent,
          actualFireAt,
        });
        admittedMissionId = admission.mission.id;
        admittedRunId = admission.run.id;
        return admission.core;
      });

      if (skippedBecauseActive) {
        const skipped = await this.dependencies.scheduleStore.updateTriggerReceipt(
          receiptClaim.receipt.id,
          {
            status: 'skipped',
            message: 'Skipped because a previous run for this schedule is still active.',
          },
        );
        const updatedRule = fire.reason === 'manual_test'
          ? rule
          : await this.advanceRuleAfterFire(rule, fire.scheduledFireAt, {
              lastRunId: null,
              lastFailure: null,
            });
        return {
          status: 'skipped',
          receipt: skipped,
          rule: updatedRule,
          mission: null,
          run: null,
        };
      }
      const run = admittedRunId
        ? persisted.runs.find((candidate) => candidate.id === admittedRunId) ?? null
        : null;
      const mission = admittedMissionId
        ? persisted.missions.find((candidate) => candidate.id === admittedMissionId) ?? null
        : null;
      if (!run || !mission) {
        throw new CoreValidationError(
          'Scheduled admission did not persist a mission and run.',
          'schedule_admission_missing_records',
        );
      }
      const admittedReceipt = await this.dependencies.scheduleStore.updateTriggerReceipt(
        receiptClaim.receipt.id,
        {
          status: 'admitted',
          missionId: mission.id,
          runId: run.id,
        },
      );
      const updatedRule = fire.reason === 'manual_test'
        ? rule
        : await this.advanceRuleAfterFire(rule, fire.scheduledFireAt, {
            lastRunId: run.id,
            lastFailure: null,
          });

      return {
        status: 'admitted',
        receipt: admittedReceipt,
        rule: updatedRule,
        mission,
        run,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedReceipt = await this.dependencies.scheduleStore.updateTriggerReceipt(
        receiptClaim.receipt.id,
        {
          status: 'failed',
          message,
        },
      );
      const updatedRule = fire.reason === 'manual_test'
        ? rule
        : await this.advanceRuleAfterFire(rule, fire.scheduledFireAt, {
            lastRunId: null,
            lastFailure: message,
          });

      return {
        status: 'failed',
        receipt: failedReceipt,
        rule: updatedRule,
        mission: null,
        run: null,
      };
    }
  }

  private async cancelActiveRunsForReplace(
    rule: ScheduleRule,
    receipt: ScheduleTriggerReceipt,
  ): Promise<void> {
    const core = await this.dependencies.coreStore.readCore();
    const activeRuns = findActiveScheduleRuns(core, rule.id);
    if (activeRuns.length === 0) {
      return;
    }
    if (!this.dependencies.replaceActiveRun) {
      throw new CoreValidationError(
        'Schedule concurrencyPolicy replace requires a supervised cancellation boundary.',
        'schedule_concurrency_replace_unavailable',
      );
    }

    for (const run of activeRuns) {
      await this.dependencies.replaceActiveRun({
        runId: run.id,
        ruleId: rule.id,
        triggerReceiptId: receipt.id,
        requestedAt: receipt.actualFireAt,
      });
    }
  }

  private async claimReceipt(
    rule: ScheduleRule,
    fire: ScheduleDueFire,
    actualFireAt: Date,
  ): Promise<{
    receipt: ScheduleTriggerReceipt;
    created: boolean;
  }> {
    const actualFireAtIso = actualFireAt.toISOString();
    const idempotencyKey = buildScheduleIdempotencyKey({
      ruleId: rule.id,
      ruleRevision: rule.revision,
      scheduledFireAt: fire.scheduledFireAt,
      actualFireAt: actualFireAtIso,
      reason: fire.reason,
    });

    return this.dependencies.scheduleStore.claimTriggerReceipt({
      ruleId: rule.id,
      ruleRevision: rule.revision,
      scheduledFireAt: fire.scheduledFireAt,
      actualFireAt: actualFireAtIso,
      idempotencyKey,
      reason: fire.reason,
    });
  }

  private async advanceRuleAfterFire(
    rule: ScheduleRule,
    scheduledFireAt: string,
    update: {
      lastRunId: string | null;
      lastFailure: string | null;
    },
  ): Promise<ScheduleRule> {
    const scheduled = new Date(scheduledFireAt);
    const nextFire = computeNextFireAfter(rule, scheduled);
    const nextRule: ScheduleRule = {
      ...rule,
      nextFireAt: nextFire?.toISOString() ?? null,
      lastFireAt: scheduled.toISOString(),
      lastRunId: update.lastRunId,
      lastFailure: update.lastFailure,
      updatedAt: this.now().toISOString(),
    };

    return this.dependencies.scheduleStore.upsertRule(nextRule);
  }
}

async function updateCoreAtomically(
  coreStore: CoreStore,
  mutator: (core: CatsCoreState) => CatsCoreState | Promise<CatsCoreState>,
): Promise<CatsCoreState> {
  return coreStore.updateCore(mutator);
}

function admitMissionAndRun(input: {
  core: CatsCoreState;
  rule: ScheduleRule;
  receipt: ScheduleTriggerReceipt;
  assignedAgent: CoreActorRecord;
  actualFireAt: Date;
}): {
  core: CatsCoreState;
  mission: MissionRecord;
  run: CoreRunRecord;
} {
  const now = input.actualFireAt;
  const originalTargetRef = resolveOriginalTargetRef(input.rule.missionTemplate.target);
  const runTitle = [
    input.receipt.reason === 'manual_test' ? '[TEST] ' : '',
    `Scheduled run: ${input.rule.title}`,
  ].join('');
  const missionWrite = upsertCoreMission(
    input.core,
    {
      title: input.rule.title,
      status: 'queued',
      conversationId: input.rule.missionTemplate.conversationTarget?.conversationId ?? null,
      assignedAgentId: input.assignedAgent.id,
      summary: input.rule.missionTemplate.intent,
      createdAt: input.receipt.actualFireAt,
      metadata: {
        source: 'schedule_rule',
        scheduleRuleId: input.rule.id,
        scheduleRuleRevision: input.rule.revision,
        scheduleTriggerReceiptId: input.receipt.id,
        originSurface: input.rule.missionTemplate.originSurface,
        transportTargets: input.rule.missionTemplate.transportTargets ?? [],
        resourceScopes: input.rule.missionTemplate.resourceScopes ?? [],
        toolScopes: input.rule.missionTemplate.toolScopes ?? [],
        approvalPolicy: input.rule.missionTemplate.approvalPolicy ?? null,
        outputPolicy: input.rule.missionTemplate.outputPolicy ?? null,
      },
    },
    now,
  );
  const triggerMetadata: ScheduleTriggerMetadata = {
    ruleId: input.receipt.ruleId,
    ruleRevision: input.receipt.ruleRevision,
    scheduledFireAt: input.receipt.scheduledFireAt,
    actualFireAt: input.receipt.actualFireAt,
    idempotencyKey: input.receipt.idempotencyKey,
    reason: input.receipt.reason,
    triggerReceiptId: input.receipt.id,
    ...(originalTargetRef ? { originalTargetRef } : {}),
  };
  const runWrite = upsertCoreRun(
    missionWrite.core,
    {
      title: runTitle,
      status: 'queued',
      conversationId: input.rule.missionTemplate.conversationTarget?.conversationId ?? null,
      taskId: null,
      orchestratorActorId: input.assignedAgent.id,
      traceId: `trace-${input.receipt.id}`,
      summary: input.rule.missionTemplate.intent,
      createdAt: input.receipt.actualFireAt,
      metadata: {
        missionId: missionWrite.mission.id,
        source: 'schedule_rule',
        scheduleTrigger: triggerMetadata,
        missionTemplate: {
          originSurface: input.rule.missionTemplate.originSurface,
          transportTargets: input.rule.missionTemplate.transportTargets ?? [],
          resourceScopes: input.rule.missionTemplate.resourceScopes ?? [],
          toolScopes: input.rule.missionTemplate.toolScopes ?? [],
          approvalPolicy: input.rule.missionTemplate.approvalPolicy ?? null,
          outputPolicy: input.rule.missionTemplate.outputPolicy ?? null,
        },
      },
    },
    now,
  );
  const missionWithRun = upsertCoreMission(
    runWrite.core,
    {
      id: missionWrite.mission.id,
      title: missionWrite.mission.title,
      status: missionWrite.mission.status,
      conversationId: missionWrite.mission.conversationId,
      assignedAgentId: missionWrite.mission.assignedAgentId,
      summary: missionWrite.mission.summary,
      createdAt: missionWrite.mission.createdAt,
      metadata: {
        ...missionWrite.mission.metadata,
        runId: runWrite.run.id,
      },
    },
    now,
  );

  return {
    core: missionWithRun.core,
    mission: missionWithRun.mission,
    run: runWrite.run,
  };
}

function resolveOriginalTargetRef(
  target: ScheduleTargetRef,
): ScheduleOriginalTargetRef | undefined {
  return target.kind === 'cat' ? target : undefined;
}

function resolveScheduleTargetAgent(
  core: CatsCoreState,
  target: ScheduleTargetRef,
): CoreActorRecord {
  const actor = target.kind === 'agent'
    ? core.actors.find((candidate) => candidate.id === target.id)
    : core.actors.find((candidate) =>
        candidate.id === createCatActorId(target.id)
        || (candidate.source === 'chat_cat' && candidate.sourceId === target.id));

  if (!actor || actor.status !== 'active') {
    throw new CoreNotFoundError(
      `Schedule target ${target.kind}:${target.id} could not be resolved to an active agent.`,
      'schedule_target_agent_not_found',
    );
  }

  return actor;
}

function findActiveScheduleRuns(core: CatsCoreState, ruleId: string): CoreRunRecord[] {
  return core.runs.filter((run) => {
    if (!isActiveRunStatus(run.status)) {
      return false;
    }
    const trigger = readScheduleTrigger(run);
    return trigger?.ruleId === ruleId;
  });
}

function readScheduleTrigger(run: CoreRunRecord): ScheduleTriggerMetadata | null {
  const value = run.metadata.scheduleTrigger;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<ScheduleTriggerMetadata>;
  return typeof candidate.ruleId === 'string' ? candidate as ScheduleTriggerMetadata : null;
}

function isActiveRunStatus(status: CoreRunRecord['status']): boolean {
  return status === 'queued' || status === 'running' || status === 'blocked';
}
