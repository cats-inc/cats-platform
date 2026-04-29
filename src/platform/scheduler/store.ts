import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  ScheduleRule,
  ScheduleTriggerClaimInput,
  ScheduleTriggerReceipt,
  ScheduleTriggerReceiptUpdate,
  SchedulerState,
} from './contracts.js';
import {
  createEmptySchedulerState,
  normalizeSchedulerState,
} from './validation.js';
import { resolveScheduleStatePathFromChatState } from '../../shared/platformPaths.js';

export interface ScheduleStore {
  readState(): Promise<SchedulerState>;
  writeState(state: SchedulerState): Promise<SchedulerState>;
  listRules(): Promise<ScheduleRule[]>;
  getRule(ruleId: string): Promise<ScheduleRule | null>;
  upsertRule(rule: ScheduleRule): Promise<ScheduleRule>;
  claimTriggerReceipt(input: ScheduleTriggerClaimInput): Promise<{
    receipt: ScheduleTriggerReceipt;
    created: boolean;
  }>;
  updateTriggerReceipt(
    receiptId: string,
    update: ScheduleTriggerReceiptUpdate,
  ): Promise<ScheduleTriggerReceipt>;
  listTriggerReceipts(filter?: {
    ruleId?: string;
    limit?: number;
  }): Promise<ScheduleTriggerReceipt[]>;
}

abstract class BaseScheduleStore implements ScheduleStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly now: () => Date = () => new Date()) {}

  protected abstract readSnapshot(): Promise<SchedulerState>;
  protected abstract writeSnapshot(state: SchedulerState): Promise<void>;

  protected currentDate(): Date {
    return this.now();
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release: () => void = () => {};
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async readState(): Promise<SchedulerState> {
    await this.mutationQueue;
    return structuredClone(await this.readSnapshot());
  }

  async writeState(state: SchedulerState): Promise<SchedulerState> {
    return this.runExclusive(async () => {
      const next = {
        ...structuredClone(state),
        updatedAt: this.now().toISOString(),
      };
      await this.writeSnapshot(next);
      return structuredClone(next);
    });
  }

  async listRules(): Promise<ScheduleRule[]> {
    const state = await this.readState();
    return state.rules
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getRule(ruleId: string): Promise<ScheduleRule | null> {
    const state = await this.readState();
    return structuredClone(state.rules.find((rule) => rule.id === ruleId) ?? null);
  }

  async upsertRule(rule: ScheduleRule): Promise<ScheduleRule> {
    return this.runExclusive(async () => {
      const state = await this.readSnapshot();
      const existingIndex = state.rules.findIndex((candidate) => candidate.id === rule.id);
      const nextRule = structuredClone(rule);
      if (existingIndex === -1) {
        state.rules.push(nextRule);
      } else {
        state.rules[existingIndex] = nextRule;
      }
      state.updatedAt = nextRule.updatedAt;
      await this.writeSnapshot(state);
      return structuredClone(nextRule);
    });
  }

  async claimTriggerReceipt(input: ScheduleTriggerClaimInput): Promise<{
    receipt: ScheduleTriggerReceipt;
    created: boolean;
  }> {
    return this.runExclusive(async () => {
      const state = await this.readSnapshot();
      const existing = state.triggerReceipts.find(
        (receipt) => receipt.idempotencyKey === input.idempotencyKey,
      );
      if (existing) {
        return {
          receipt: structuredClone({
            ...existing,
            status: existing.status === 'claimed' ? 'duplicate' : existing.status,
          }),
          created: false,
        };
      }

      const nowIso = input.actualFireAt;
      const receipt: ScheduleTriggerReceipt = {
        id: `schedule-trigger-${randomUUID()}`,
        ruleId: input.ruleId,
        ruleRevision: input.ruleRevision,
        scheduledFireAt: input.scheduledFireAt,
        actualFireAt: input.actualFireAt,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        status: 'claimed',
        missionId: null,
        runId: null,
        message: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        metadata: structuredClone(input.metadata ?? {}),
      };
      state.triggerReceipts.unshift(receipt);
      state.updatedAt = nowIso;
      await this.writeSnapshot(state);
      return {
        receipt: structuredClone(receipt),
        created: true,
      };
    });
  }

  async updateTriggerReceipt(
    receiptId: string,
    update: ScheduleTriggerReceiptUpdate,
  ): Promise<ScheduleTriggerReceipt> {
    return this.runExclusive(async () => {
      const state = await this.readSnapshot();
      const existingIndex = state.triggerReceipts.findIndex((receipt) => receipt.id === receiptId);
      if (existingIndex === -1) {
        throw new Error(`Schedule trigger receipt not found: ${receiptId}`);
      }

      const nowIso = this.now().toISOString();
      const existing = state.triggerReceipts[existingIndex]!;
      const next: ScheduleTriggerReceipt = {
        ...existing,
        status: update.status,
        missionId: update.missionId === undefined ? existing.missionId : update.missionId,
        runId: update.runId === undefined ? existing.runId : update.runId,
        message: update.message === undefined ? existing.message : update.message,
        metadata: {
          ...existing.metadata,
          ...(update.metadata ?? {}),
        },
        updatedAt: nowIso,
      };
      state.triggerReceipts[existingIndex] = next;
      state.updatedAt = nowIso;
      await this.writeSnapshot(state);
      return structuredClone(next);
    });
  }

  async listTriggerReceipts(filter: {
    ruleId?: string;
    limit?: number;
  } = {}): Promise<ScheduleTriggerReceipt[]> {
    const state = await this.readState();
    return state.triggerReceipts
      .filter((receipt) => !filter.ruleId || receipt.ruleId === filter.ruleId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, filter.limit);
  }
}

export class MemoryScheduleStore extends BaseScheduleStore {
  private state: SchedulerState;

  constructor(
    initialState?: SchedulerState,
    now?: () => Date,
  ) {
    super(now);
    this.state = structuredClone(initialState ?? createEmptySchedulerState(this.currentDate()));
  }

  protected async readSnapshot(): Promise<SchedulerState> {
    return structuredClone(this.state);
  }

  protected async writeSnapshot(state: SchedulerState): Promise<void> {
    this.state = structuredClone(state);
  }
}

export class FileBackedScheduleStore extends BaseScheduleStore {
  constructor(
    private readonly statePath: string,
    now?: () => Date,
  ) {
    super(now);
  }

  protected async readSnapshot(): Promise<SchedulerState> {
    try {
      const raw = await readFile(this.statePath, 'utf-8');
      return normalizeSchedulerState(JSON.parse(raw) as unknown, this.currentDate());
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        const state = createEmptySchedulerState(this.currentDate());
        await this.writeSnapshot(state);
        return state;
      }
      throw error;
    }
  }

  protected async writeSnapshot(state: SchedulerState): Promise<void> {
    await mkdir(path.dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  }
}

export function createFileBackedScheduleStore(
  chatStatePath: string,
  now?: () => Date,
): ScheduleStore {
  return new FileBackedScheduleStore(resolveScheduleStatePathFromChatState(chatStatePath), now);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
