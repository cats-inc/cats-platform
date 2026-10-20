export type PlanningOwnerFamily = 'project' | 'work_item' | 'task' | 'artifact';
export type PlanningOwnerAction = 'edit' | 'pause' | 'resume' | 'complete' | 'reopen' | 'cancel' | 'archive' | 'restore' | 'delete';
export interface OwnerActionView {
  family: PlanningOwnerFamily;
  id: string;
  token: string;
  title: string;
  summary: string | null;
  status: string;
  listing: string;
  source: string;
  sourcePath: string | null;
  assignedActorIds: string[];
  projectId: string | null;
  parentId: string | null;
  priority: string;
  acceptanceCriteria: string | null;
  actions: Array<{ action: PlanningOwnerAction; blockers: string[] }>;
  dependencies: Array<{ family: string; id: string; title: string }>;
  choices: { projects: Array<{ id: string; title: string }>; parents: Array<{ id: string; title: string }>; actors: Array<{ id: string; title: string }> };
}
