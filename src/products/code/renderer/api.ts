import type { CodePlaceholderProjection } from '../api/projection';

export async function fetchCodePlaceholder(): Promise<CodePlaceholderProjection> {
  const response = await fetch('/api/code');
  if (!response.ok) {
    throw new Error(`cats code placeholder returned ${response.status}`);
  }
  return response.json() as Promise<CodePlaceholderProjection>;
}
