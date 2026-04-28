import { expectJson } from './http.js';

import type { WorkIntakePlanProjection } from '../../api/intakeProjection.js';
import type { WorkTemplate } from '../../templates/types.js';
import type { WorkIntakeInput } from '../../intake/types.js';
import {
  buildWorkApiIntakeApprovePath,
  buildWorkApiIntakePlanPath,
  buildWorkApiIntakePlanTaskPath,
  buildWorkApiIntakeRejectPath,
  WORK_API_INTAKE_PATH,
  WORK_API_TEMPLATES_PATH,
} from '../../shared/apiPaths.js';

export interface WorkTemplateListResponse {
  product: { id: string; name: string };
  templates: WorkTemplate[];
}

export interface WorkIntakePlanTaskPatch {
  acceptanceCriteria?: string | null;
  productHint?: 'chat' | 'work' | 'code' | null;
  strategyHint?: string | null;
}

export async function fetchWorkTemplates(
  signal?: AbortSignal,
): Promise<WorkTemplate[]> {
  const response = await fetch(WORK_API_TEMPLATES_PATH, { signal });
  const payload = await expectJson<WorkTemplateListResponse>(
    response,
    'Failed to load templates',
  );
  return payload.templates;
}

export async function submitWorkIntake(
  input: WorkIntakeInput,
  signal?: AbortSignal,
): Promise<WorkIntakePlanProjection> {
  const response = await fetch(WORK_API_INTAKE_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  return expectJson<WorkIntakePlanProjection>(response, 'Failed to create work intake');
}

export async function fetchIntakePlan(
  projectId: string,
  signal?: AbortSignal,
): Promise<WorkIntakePlanProjection> {
  const response = await fetch(buildWorkApiIntakePlanPath(projectId), {
    signal,
  });
  return expectJson<WorkIntakePlanProjection>(response, 'Failed to load intake plan');
}

export async function approveIntakePlan(
  projectId: string,
  signal?: AbortSignal,
): Promise<WorkIntakePlanProjection> {
  const response = await fetch(
    buildWorkApiIntakeApprovePath(projectId),
    { method: 'POST', signal },
  );
  return expectJson<WorkIntakePlanProjection>(response, 'Failed to approve plan');
}

export async function patchIntakePlanTask(
  projectId: string,
  taskId: string,
  patch: WorkIntakePlanTaskPatch,
  signal?: AbortSignal,
): Promise<WorkIntakePlanProjection> {
  const response = await fetch(
    buildWorkApiIntakePlanTaskPath(projectId, taskId),
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
      signal,
    },
  );
  return expectJson<WorkIntakePlanProjection>(response, 'Failed to update plan task');
}

export async function rejectIntakePlan(
  projectId: string,
  notes: string,
  signal?: AbortSignal,
): Promise<WorkIntakePlanProjection> {
  const response = await fetch(
    buildWorkApiIntakeRejectPath(projectId),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes }),
      signal,
    },
  );
  return expectJson<WorkIntakePlanProjection>(response, 'Failed to reject plan');
}
