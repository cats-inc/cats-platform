import type { ChatCat, ChatChannelView } from '../../api/contracts.js';
import type {
  CompanionBox,
  CompanionBoxSummary,
  CompanionDerivedRecord,
  CompanionLifeProfile,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSessionContext,
  CompanionSnapshot,
  CompanionSourceDeleteResult,
  CompanionSourceIngestResult,
  CompanionSourceRecord,
  CompanionSourceUpdateResult,
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
  UpdateCompanionSourceInput,
} from '../../companion/contracts.js';
import type { CompanionLifeProfilePatch } from '../../companion/life/profile.js';

export interface CompanionSessionContextInput {
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
}

export interface CompanionBoxStore {
  clearForReset?(): Promise<void>;
  readSnapshot(): Promise<CompanionSnapshot>;
  getBox(catId: string, now?: Date): Promise<CompanionBox>;
  getBoxSummary(catId: string, now?: Date): Promise<CompanionBoxSummary>;
  listSources(catId: string, now?: Date): Promise<CompanionSourceRecord[]>;
  ingestSource(
    catId: string,
    input: CreateCompanionSourceInput,
    now?: Date,
  ): Promise<CompanionSourceIngestResult>;
  updateSource(
    catId: string,
    sourceId: string,
    update: UpdateCompanionSourceInput,
    now?: Date,
  ): Promise<CompanionSourceUpdateResult>;
  deleteSource(
    catId: string,
    sourceId: string,
    now?: Date,
  ): Promise<CompanionSourceDeleteResult>;
  listDerived(catId: string, now?: Date): Promise<CompanionDerivedRecord[]>;
  upsertDerived(
    catId: string,
    record: CompanionDerivedRecord,
    now?: Date,
  ): Promise<CompanionDerivedRecord>;
  listMemory(catId: string, now?: Date): Promise<CompanionMemoryRecord[]>;
  createMemory(
    catId: string,
    input: CreateCompanionMemoryInput,
    now?: Date,
  ): Promise<CompanionMemoryRecord>;
  getResponseProfile(catId: string, now?: Date): Promise<CompanionResponseProfile>;
  updateResponseProfile(
    catId: string,
    update: UpdateCompanionResponseProfileInput,
    now?: Date,
  ): Promise<CompanionResponseProfile>;
  deleteMemory(
    catId: string,
    memoryId: string,
    now?: Date,
  ): Promise<{ deleted: boolean }>;
  updateMemoryStatus(
    catId: string,
    memoryId: string,
    status: 'active' | 'archived',
    now?: Date,
  ): Promise<CompanionMemoryRecord>;
  getLifeProfile(catId: string, now?: Date): Promise<CompanionLifeProfile>;
  updateLifeProfile(
    catId: string,
    patch: CompanionLifeProfilePatch,
    now?: Date,
  ): Promise<CompanionLifeProfile>;
  buildSessionContext(input: CompanionSessionContextInput): Promise<CompanionSessionContext>;
}
