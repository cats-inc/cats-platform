import type { CatsCoreState } from '../../../core/types.js';
import type { ArtifactCanvasProjection } from './contracts.js';
import {
  isSupervisorOwnedPreviewOrigin,
  type ArtifactCanvasSupervisorPreviewLeaseStore,
} from './iframePolicy.js';
import { isArtifactCanvasTextPresentation } from './projection.js';

/** Largest lease-served file inlined for the `code` and `markdown` viewers. */
export const ARTIFACT_CANVAS_LEASE_TEXT_LIMIT_BYTES = 2 * 1024 * 1024;

const LEASE_TEXT_TIMEOUT_MS = 5_000;

/**
 * The canvas renderer runs on the Cats shell origin, and a supervisor lease is a
 * different loopback origin that deliberately sends no CORS headers, so the
 * renderer cannot read lease-served text itself. For text presentations,
 * Platform reads the file from the lease over loopback and inlines it in the
 * projection. Only a URL on a live lease owned by this artifact is read.
 */
export async function inlineArtifactCanvasLeaseText(input: {
  core: CatsCoreState;
  projection: ArtifactCanvasProjection;
  supervisorPreviewLeaseStore?: ArtifactCanvasSupervisorPreviewLeaseStore | null;
  now?: Date;
}): Promise<ArtifactCanvasProjection> {
  const { projection } = input;
  if (
    !isArtifactCanvasTextPresentation(projection.presentationResolved)
    || projection.textContent !== null
    || !projection.safeUrl
  ) {
    return projection;
  }
  const artifact = input.core.artifacts.find((candidate) =>
    candidate.id === projection.artifact.id);
  if (
    !artifact
    || !isSupervisorOwnedPreviewOrigin({
      url: projection.safeUrl,
      artifact,
      leaseStore: input.supervisorPreviewLeaseStore,
      now: input.now,
    })
  ) {
    return projection;
  }
  const textContent = await readLeaseText(projection.safeUrl);
  return textContent === null ? projection : { ...projection, textContent };
}

async function readLeaseText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(LEASE_TEXT_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return text + decoder.decode();
      }
      size += value.byteLength;
      if (size > ARTIFACT_CANVAS_LEASE_TEXT_LIMIT_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  }
}
