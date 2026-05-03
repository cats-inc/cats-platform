import { expectJson } from './http.js';
import type {
  WorkGraphLink,
  WorkGraphLinkEndpointKind,
  WorkGraphLinkKind,
} from '../components/topdown/types';
import {
  buildWorkApiLinkPath,
  WORK_API_LINKS_PATH,
} from '../../shared/apiPaths.js';

export interface CreateWorkLinkInput {
  kind: WorkGraphLinkKind | 'blocked_by';
  source: { recordFamily: WorkGraphLinkEndpointKind; recordId: string };
  target: { recordFamily: WorkGraphLinkEndpointKind; recordId: string };
  note?: string | null;
  createdByActorId?: string | null;
}

export interface CreateWorkLinkResult {
  link: WorkGraphLink;
  /** False when the producer found a duplicate on the canonical form. */
  created: boolean;
}

export interface ListWorkLinksQuery {
  kind?: WorkGraphLinkKind;
  recordFamily?: WorkGraphLinkEndpointKind;
  recordId?: string;
}

export async function createWorkLink(
  input: CreateWorkLinkInput,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<CreateWorkLinkResult> {
  const response = await fetch(WORK_API_LINKS_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  return expectJson<CreateWorkLinkResult>(response, errorMessage);
}

export async function removeWorkLink(
  linkId: string,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<{ removed: boolean; linkId: string }> {
  const response = await fetch(buildWorkApiLinkPath(linkId), {
    method: 'DELETE',
    signal,
  });
  return expectJson<{ removed: boolean; linkId: string }>(response, errorMessage);
}

export async function listWorkLinks(
  errorMessage: string,
  query: ListWorkLinksQuery = {},
  signal?: AbortSignal,
): Promise<WorkGraphLink[]> {
  const params = new URLSearchParams();
  if (query.kind) params.set('kind', query.kind);
  if (query.recordFamily) params.set('recordFamily', query.recordFamily);
  if (query.recordId) params.set('recordId', query.recordId);
  const qs = params.toString();
  const url = qs ? `${WORK_API_LINKS_PATH}?${qs}` : WORK_API_LINKS_PATH;
  const response = await fetch(url, { signal });
  const payload = await expectJson<{ links: WorkGraphLink[] }>(
    response,
    errorMessage,
  );
  return payload.links;
}
