import type { WorkPlaceholderProjection } from '../api/projection';

export async function fetchWorkPlaceholder(): Promise<WorkPlaceholderProjection> {
  const response = await fetch('/api/work');
  if (!response.ok) {
    throw new Error(`cats work placeholder returned ${response.status}`);
  }
  return response.json() as Promise<WorkPlaceholderProjection>;
}
