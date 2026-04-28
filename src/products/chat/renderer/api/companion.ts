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
import type {
  CompanionContentReference,
  CompanionReferenceParseResult,
} from '../../companion/contentReference.js';
import type {
  CompanionContentPreview,
} from '../../companion/contentResolver.js';
import {
  buildCompanionMessageReferenceSnapshot,
  type CompanionMessageReferenceSnapshot,
} from '../../companion/messageReferenceSnapshot.js';
import {
  detectCompanionReferences,
} from '../../companion/composerReferenceDetector.js';
import type { CompanionProfileReadModel } from '../../companion/profileReadModel.js';

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

export async function getCompanionProfile(
  catId: string,
  signal?: AbortSignal,
): Promise<CompanionProfileReadModel> {
  const response = await fetch(`${catPath(catId)}/profile`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await expectJson<{ profile: CompanionProfileReadModel }>(
    response,
    `companion profile read-model returned ${response.status}`,
  );
  return data.profile;
}

export interface CompanionResolveReferenceResult {
  parse: CompanionReferenceParseResult;
  preview?: CompanionContentPreview;
}

export async function resolveCompanionContentReference(
  catId: string,
  referenceText: string,
  signal?: AbortSignal,
): Promise<CompanionResolveReferenceResult> {
  const response = await fetch(`${catPath(catId)}/resolve-reference`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ referenceText }),
    signal,
  });
  return expectJson<CompanionResolveReferenceResult>(
    response,
    `companion resolve-reference returned ${response.status}`,
  );
}

/**
 * Phase 5 send-time capture: scan `body` for `cats://companion/v1/...`
 * occurrences, resolve each one against its target cat, and build the
 * persistable snapshot for every reference whose live target was
 * `available`. References that resolved as `missing` / `deleted` /
 * `inaccessible` are silently skipped (they would only persist a
 * generic-fallback snapshot, which the transcript hydrator can produce
 * itself from the raw reference text).
 *
 * Errors per reference are swallowed so a transient resolver failure
 * never blocks the user from sending the message.
 */
export async function captureCompanionReferenceSnapshots(
  body: string,
  options: { capturedAt?: string; signal?: AbortSignal } = {},
): Promise<CompanionMessageReferenceSnapshot[]> {
  const matches = detectCompanionReferences(body);
  const parsed: CompanionContentReference[] = [];
  for (const match of matches) {
    if (match.parseResult.status === 'parsed') {
      parsed.push(match.parseResult.reference);
    }
  }
  if (parsed.length === 0) {
    return [];
  }
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const snapshots: CompanionMessageReferenceSnapshot[] = [];
  for (const reference of parsed) {
    try {
      const result = await resolveCompanionContentReference(
        reference.catId,
        // re-serialize from the parsed reference so the URL path is
        // canonical (the original raw substring may carry trailing
        // characters or encoding the parser already normalised).
        `cats://companion/v1/${reference.scopeId}/${reference.catId}/${reference.type}/${reference.targetId}`,
        options.signal,
      );
      if (result.preview && result.preview.availability === 'available') {
        snapshots.push(
          buildCompanionMessageReferenceSnapshot(result.preview, { capturedAt }),
        );
      }
    } catch {
      // Silently skip — transient resolver errors should never block send.
    }
  }
  return snapshots;
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
