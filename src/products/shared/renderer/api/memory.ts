import { expectJson } from './http.js';

export interface DurableMemoryItem {
  id: string;
  category: string;
  content: string;
  confidence: number | null;
  updatedAt: string;
}

export async function listCatMemory(
  catId: string,
  signal?: AbortSignal,
): Promise<DurableMemoryItem[]> {
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}/memory`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await expectJson<{ records: DurableMemoryItem[] }>(
    response,
    `cat memory list returned ${response.status}`,
  );
  return data.records ?? [];
}

export async function createCatMemory(
  catId: string,
  input: { category: string; content: string },
  signal?: AbortSignal,
): Promise<DurableMemoryItem> {
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}/memory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  const data = await expectJson<{ memory: DurableMemoryItem }>(
    response,
    `cat memory create returned ${response.status}`,
  );
  return data.memory;
}

export async function deleteCatMemory(
  catId: string,
  memoryId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/cats/${encodeURIComponent(catId)}/memory/${encodeURIComponent(memoryId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    signal,
  });
  await expectJson<unknown>(response, `cat memory delete returned ${response.status}`);
}
