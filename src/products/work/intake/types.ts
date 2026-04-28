import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreProjectRecord,
  CoreTaskRecord,
  CoreWorkItemRecord,
} from '../../../core/types.js';
import type { WorkTemplate } from '../templates/types.js';

export type WorkIntakePriority = 'low' | 'medium' | 'high';

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
