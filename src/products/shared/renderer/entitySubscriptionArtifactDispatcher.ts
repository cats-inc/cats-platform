import type { CoreArtifactRecord } from '../../../core/types.js';
import type {
  EntitySubscriptionPatch,
  EntitySubscriptionSnapshot,
} from './entitySubscriptionHub.js';

export interface ArtifactSubscriptionState {
  artifact: CoreArtifactRecord;
}

export type ArtifactSubscriptionPatch =
  | {
      kind: 'artifact.updated';
      artifactId: string;
      artifact: CoreArtifactRecord;
      state: ArtifactSubscriptionState;
    }
  | {
      kind: 'artifact.removed';
      artifactId: string;
    };

function isMatchingArtifact(
  expectedArtifactId: string | null | undefined,
  eventKind: string,
  eventId: string,
  artifactId: string,
): boolean {
  return eventKind === 'artifact'
    && expectedArtifactId !== null
    && expectedArtifactId !== undefined
    && expectedArtifactId === eventId
    && expectedArtifactId === artifactId;
}

export function shouldRefreshArtifactCanvasForSnapshot(
  artifactId: string | null | undefined,
  snapshot: EntitySubscriptionSnapshot<ArtifactSubscriptionState>,
): boolean {
  return isMatchingArtifact(
    artifactId,
    snapshot.kind,
    snapshot.id,
    snapshot.state.artifact.id,
  );
}

export function shouldRefreshArtifactCanvasForPatch(
  artifactId: string | null | undefined,
  patch: EntitySubscriptionPatch<ArtifactSubscriptionPatch>,
): boolean {
  return isMatchingArtifact(
    artifactId,
    patch.kind,
    patch.id,
    patch.patch.artifactId,
  );
}
