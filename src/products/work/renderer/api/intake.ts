import { expectJson } from './http.js';

import type { WorkIntakePlanProjection } from '../../api/intakeProjection.js';
import type { WorkTemplate } from '../../templates/types.js';
import type { WorkIntakeInput } from '../../intake/types.js';

export interface WorkTemplateListResponse {
  product: { id: string; name: string };
  templates: WorkTemplate[];
}

export async function fetchWorkTemplates(
  signal?: AbortSignal,
): Promise<WorkTemplate[]> {
  const response = await fetch('/api/work/templates', { signal });
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
  const response = await fetch('/api/work/intake', {
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
  const response = await fetch(`/api/work/intake/${encodeURIComponent(projectId)}/plan`, {
    signal,
  });
  return expectJson<WorkIntakePlanProjection>(response, 'Failed to load intake plan');
}

export async function approveIntakePlan(
  projectId: string,
  signal?: AbortSignal,
): Promise<WorkIntakePlanProjection> {
  const response = await fetch(
    `/api/work/intake/${encodeURIComponent(projectId)}/approve`,
    { method: 'POST', signal },
  );
  return expectJson<WorkIntakePlanProjection>(response, 'Failed to approve plan');
}

export async function rejectIntakePlan(
  projectId: string,
  notes: string,
  signal?: AbortSignal,
): Promise<WorkIntakePlanProjection> {
  const response = await fetch(
    `/api/work/intake/${encodeURIComponent(projectId)}/reject`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes }),
      signal,
    },
  );
  return expectJson<WorkIntakePlanProjection>(response, 'Failed to reject plan');
}
