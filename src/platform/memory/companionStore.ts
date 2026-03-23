import type { ChatCat, ChatChannelView } from '../../shared/app-shell.js';
import type { CompanionBoxStore } from '../../products/chat/state/companionBoxStore.js';
import type {
  CompanionBox,
  CompanionBoxSummary,
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSessionContext,
  CompanionSourceIngestResult,
  CompanionSourceUpdateResult,
  CompanionSourceDeleteResult,
  CompanionSourceRecord,
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
} from '../../products/chat/companion/contracts.js';
import type { MemoryFlushResult } from './contracts.js';
import type { CatsMemoryService } from './service.js';

export type CompanionCanonicalSyncResult =
  | { status: 'synced'; flush: MemoryFlushResult }
  | { status: 'deferred'; flush: null };

export interface CanonicalSyncAwareCompanionBoxStore extends CompanionBoxStore {
  consumePendingCanonicalSync(catId: string): CompanionCanonicalSyncResult | null;
}

function reportCanonicalSyncFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-memory-sync] ${scope}: ${message}\n`);
}

export class MemoryAwareCompanionBoxStore implements CompanionBoxStore {
  private readonly pendingCanonicalSync = new Map<string, CompanionCanonicalSyncResult>();

  constructor(
    private readonly delegate: CompanionBoxStore,
    private readonly memoryService: CatsMemoryService,
  ) {}

  consumePendingCanonicalSync(catId: string): CompanionCanonicalSyncResult | null {
    const pending = this.pendingCanonicalSync.get(catId) ?? null;
    this.pendingCanonicalSync.delete(catId);
    return pending;
  }

  private async syncCanonicalCompanionMemory(catId: string, now?: Date): Promise<void> {
    try {
      const flush = await this.memoryService.flushCompanionBox({
        catId,
        companionStore: this,
        reason: 'manual',
        now,
      });
      this.pendingCanonicalSync.set(catId, { status: 'synced', flush });
    } catch (error) {
      reportCanonicalSyncFailure(`companion:${catId}`, error);
      this.pendingCanonicalSync.set(catId, { status: 'deferred', flush: null });
    }
  }

  async readSnapshot() {
    return this.delegate.readSnapshot();
  }

  async getBox(catId: string, now?: Date): Promise<CompanionBox> {
    return this.delegate.getBox(catId, now);
  }

  async getBoxSummary(catId: string, now?: Date): Promise<CompanionBoxSummary> {
    return this.delegate.getBoxSummary(catId, now);
  }

  async listSources(catId: string, now?: Date): Promise<CompanionSourceRecord[]> {
    return this.delegate.listSources(catId, now);
  }

  async ingestSource(
    catId: string,
    input: CreateCompanionSourceInput,
    now?: Date,
  ): Promise<CompanionSourceIngestResult> {
    const result = await this.delegate.ingestSource(catId, input, now);
    await this.syncCanonicalCompanionMemory(catId, now);
    return result;
  }

  async updateSource(
    catId: string,
    sourceId: string,
    update: UpdateCompanionSourceInput,
    now?: Date,
  ): Promise<CompanionSourceUpdateResult> {
    const result = await this.delegate.updateSource(catId, sourceId, update, now);
    await this.syncCanonicalCompanionMemory(catId, now);
    return result;
  }

  async deleteSource(
    catId: string,
    sourceId: string,
    now?: Date,
  ): Promise<CompanionSourceDeleteResult> {
    const result = await this.delegate.deleteSource(catId, sourceId, now);
    await this.syncCanonicalCompanionMemory(catId, now);
    return result;
  }

  async listDerived(catId: string, now?: Date): Promise<CompanionDerivedRecord[]> {
    return this.delegate.listDerived(catId, now);
  }

  async listMemory(catId: string, now?: Date): Promise<CompanionMemoryRecord[]> {
    return this.delegate.listMemory(catId, now);
  }

  async createMemory(
    catId: string,
    input: CreateCompanionMemoryInput,
    now?: Date,
  ): Promise<CompanionMemoryRecord> {
    const result = await this.delegate.createMemory(catId, input, now);
    await this.syncCanonicalCompanionMemory(catId, now);
    return result;
  }

  async getResponseProfile(catId: string, now?: Date): Promise<CompanionResponseProfile> {
    return this.delegate.getResponseProfile(catId, now);
  }

  async updateResponseProfile(
    catId: string,
    update: UpdateCompanionResponseProfileInput,
    now?: Date,
  ): Promise<CompanionResponseProfile> {
    const result = await this.delegate.updateResponseProfile(catId, update, now);
    await this.syncCanonicalCompanionMemory(catId, now);
    return result;
  }

  async buildSessionContext(input: {
    cat: ChatCat;
    channel: {
      id: string | null;
      title: string;
      topic: string;
      workingMemory?: ChatChannelView['workingMemory'];
      roomRouting?: ChatChannelView['roomRouting'];
    };
    requestedSkills: string[];
    transport: 'telegram' | 'line' | 'web' | null;
    now?: Date;
  }): Promise<CompanionSessionContext> {
    const context = await this.delegate.buildSessionContext(input);
    return {
      ...context,
      retrieval: await this.memoryService.buildCompanionRetrievalContext({
        cat: input.cat,
        channel: input.channel,
        transport: input.transport,
        companionStore: this.delegate,
        now: input.now,
      }),
    };
  }
}

export function createMemoryAwareCompanionBoxStore(
  delegate: CompanionBoxStore,
  memoryService: CatsMemoryService,
): CompanionBoxStore {
  return new MemoryAwareCompanionBoxStore(delegate, memoryService);
}
