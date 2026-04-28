import type { TaskExecutionProduct } from '../../../shared/taskPlanning.js';

export interface WorkTemplateRole {
  key: string;
  label: string;
  productHint: TaskExecutionProduct | null;
  strategyHint: string | null;
  required: boolean;
}

export interface WorkTemplateTaskBlueprint {
  key: string;
  title: string;
  roleKey: string;
  productHint: TaskExecutionProduct;
  strategyHint: string;
  acceptanceCriteria: string | null;
  dependsOnKeys: string[];
  summary: string | null;
}

export interface WorkTemplateApprovalExpectation {
  requiresPlanApproval: boolean;
  requiresDeliveryApproval: boolean;
}

export interface WorkTemplate {
  id: string;
  label: string;
  description: string;
  version: number;
  roles: WorkTemplateRole[];
  taskBlueprints: WorkTemplateTaskBlueprint[];
  approval: WorkTemplateApprovalExpectation;
}

export type WorkTeamTemplate = WorkTemplate;
