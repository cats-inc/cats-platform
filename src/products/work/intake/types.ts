import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreProjectRecord,
  CoreTaskRecord,
  CoreWorkItemRecord,
} from '../../../core/types.js';
import type { WorkTemplate } from '../templates/types.js';

export const WORK_INTAKE_REQUIRED_FIELDS = [
  'title',
  'brief',
  'desiredOutcome',
  'templateId',
] as const;

export const WORK_INTAKE_OPTIONAL_FIELDS = [
  'repoPath',
  'deadline',
  'priority',
] as const;

export const WORK_INTAKE_PRIORITIES = ['low', 'medium', 'high'] as const;

export type WorkIntakeRequiredField = typeof WORK_INTAKE_REQUIRED_FIELDS[number];
export type WorkIntakeOptionalField = typeof WORK_INTAKE_OPTIONAL_FIELDS[number];
export type WorkIntakePriority = typeof WORK_INTAKE_PRIORITIES[number];

export interface WorkIntakeInput {
  title: string;
  brief: string;
  desiredOutcome: string;
  repoPath?: string | null;
  deadline?: string | null;
  priority?: WorkIntakePriority | null;
  templateId: string;
}

export type WorkIntakeDraft = WorkIntakeInput;

export interface WorkIntakePlanResult {
  project: CoreProjectRecord;
  workItem: CoreWorkItemRecord;
  tasks: CoreTaskRecord[];
  activities: CoreActivityRecord[];
  template: WorkTemplate;
}

export type GeneratedWorkPlan = WorkIntakePlanResult;

export interface GenerateWorkIntakePlanResult {
  core: CatsCoreState;
  plan: WorkIntakePlanResult;
}
