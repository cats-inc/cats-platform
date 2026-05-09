import type { CoreStore } from '../../../core/store.js';
import type {
  CatsCoreState,
  CoreArtifactRecord,
} from '../../../core/types.js';

export const ARTIFACT_ENTITY_SUBSCRIPTION_VERSION = 1;

export interface ArtifactSubscriptionState {
  artifact: CoreArtifactRecord;
}

export type ArtifactSubscriptionPatch =
  | {
      kind: 'artifact.updated';
      artifactId: string;
      artifact: CoreArtifactRecord;
    }
  | {
      kind: 'artifact.removed';
      artifactId: string;
    };

function serializeArtifactRecord(value: CoreArtifactRecord): string {
  return JSON.stringify(value);
}

function findArtifact(
  core: CatsCoreState,
  artifactId: string,
): CoreArtifactRecord | null {
  return core.artifacts.find((artifact) => artifact.id === artifactId) ?? null;
}

export function buildArtifactSubscriptionStateFromCore(
  core: CatsCoreState,
  artifactId: string,
): ArtifactSubscriptionState {
  const artifact = findArtifact(core, artifactId);
  if (!artifact) {
    throw new Error(`Artifact not found: ${artifactId}`);
  }

  return { artifact };
}

export async function buildArtifactSubscriptionState(
  coreStore: CoreStore,
  artifactId: string,
): Promise<ArtifactSubscriptionState> {
  return buildArtifactSubscriptionStateFromCore(
    await coreStore.readCore(),
    artifactId,
  );
}

export function buildArtifactSubscriptionPatches(
  previous: ArtifactSubscriptionState,
  next: ArtifactSubscriptionState | null,
): ArtifactSubscriptionPatch[] {
  if (!next) {
    return [{
      kind: 'artifact.removed',
      artifactId: previous.artifact.id,
    }];
  }

  if (serializeArtifactRecord(previous.artifact) === serializeArtifactRecord(next.artifact)) {
    return [];
  }

  return [{
    kind: 'artifact.updated',
    artifactId: next.artifact.id,
    artifact: next.artifact,
  }];
}
