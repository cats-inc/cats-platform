import { expectJson } from './http.js';
import type {
  CompanionBoxSummary,
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSourceDeleteResult,
  CompanionSourceIngestResult,
  CompanionSourceRecord,
  CompanionSourceUpdateResult,
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
  UpdateCompanionSourceInput,
} from '../../companion/contracts.js';

function catPath(catId: string): string {
  return `/api/cats/${encodeURIComponent(catId)}/companion-box`;
}

export async function getCompanionBoxSummary(
  catId: string,
  signal?: AbortSignal,
): Promise<CompanionBoxSummary> {
  const response = await fetch(catPath(catId), {
    headers: { Accept: 'application/json' },
    signal,
  });
  return expectJson<CompanionBoxSummary>(
    response,
    `companion box summary returned ${response.status}`,
  );
}

export async function listCompanionSources(
  catId: string,
  signal?: AbortSignal,
): Promise<CompanionSourceRecord[]> {
  const response = await fetch(`${catPath(catId)}/sources`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await expectJson<{ sources: CompanionSourceRecord[] }>(
    response,
    `companion sources list returned ${response.status}`,
  );
  return data.sources ?? [];
}

export async function createCompanionSource(
  catId: string,
  input: CreateCompanionSourceInput,
  signal?: AbortSignal,
): Promise<CompanionSourceIngestResult> {
  const response = await fetch(`${catPath(catId)}/sources`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  return expectJson<CompanionSourceIngestResult>(
    response,
    `companion source create returned ${response.status}`,
  );
}

export async function updateCompanionSource(
  catId: string,
  sourceId: string,
  input: UpdateCompanionSourceInput,
  signal?: AbortSignal,
): Promise<CompanionSourceUpdateResult> {
  const response = await fetch(
    `${catPath(catId)}/sources/${encodeURIComponent(sourceId)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
      signal,
    },
  );
  return expectJson<CompanionSourceUpdateResult>(
    response,
    `companion source update returned ${response.status}`,
  );
}

export async function deleteCompanionSource(
  catId: string,
  sourceId: string,
  signal?: AbortSignal,
): Promise<CompanionSourceDeleteResult> {
  const response = await fetch(
    `${catPath(catId)}/sources/${encodeURIComponent(sourceId)}`,
    {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      signal,
    },
  );
  return expectJson<CompanionSourceDeleteResult>(
    response,
    `companion source delete returned ${response.status}`,
  );
}

export async function listCompanionDerived(
  catId: string,
  signal?: AbortSignal,
): Promise<CompanionDerivedRecord[]> {
  const response = await fetch(`${catPath(catId)}/derived`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await expectJson<{ derived: CompanionDerivedRecord[] }>(
    response,
    `companion derived list returned ${response.status}`,
  );
  return data.derived ?? [];
}

export async function listCompanionMemory(
  catId: string,
  signal?: AbortSignal,
): Promise<CompanionMemoryRecord[]> {
  const response = await fetch(`${catPath(catId)}/memory`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await expectJson<{ memory: CompanionMemoryRecord[] }>(
    response,
    `companion memory list returned ${response.status}`,
  );
  return data.memory ?? [];
}

export async function createCompanionMemory(
  catId: string,
  input: CreateCompanionMemoryInput,
  signal?: AbortSignal,
): Promise<CompanionMemoryRecord> {
  const response = await fetch(`${catPath(catId)}/memory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  return expectJson<CompanionMemoryRecord>(
    response,
    `companion memory create returned ${response.status}`,
  );
}

export async function deleteCompanionMemory(
  catId: string,
  memoryId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${catPath(catId)}/memory/${encodeURIComponent(memoryId)}`,
    {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`companion memory delete returned ${response.status}`);
  }
}

export async function getCompanionResponseProfile(
  catId: string,
  signal?: AbortSignal,
): Promise<CompanionResponseProfile> {
  const response = await fetch(`${catPath(catId)}/response-profile`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  return expectJson<CompanionResponseProfile>(
    response,
    `companion response profile returned ${response.status}`,
  );
}

export async function updateCompanionResponseProfile(
  catId: string,
  input: UpdateCompanionResponseProfileInput,
  signal?: AbortSignal,
): Promise<CompanionResponseProfile> {
  const response = await fetch(`${catPath(catId)}/response-profile`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  return expectJson<CompanionResponseProfile>(
    response,
    `companion response profile update returned ${response.status}`,
  );
}
