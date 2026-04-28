import { useParams } from "react-router-dom";

import { ArtifactDetailView } from "../ArtifactDetailView.js";
import { useArtifactsMock } from "../../state/artifactsMockStore";
import { ArtifactDetailMockPage } from "./ArtifactDetailMockPage";

/**
 * Detail-route delegator: if the `:artifactId` matches a row in the local
 * mock store, render the mock-aware page so SPEC-091 IA can be previewed
 * without real Core data; otherwise fall back to the existing
 * `ArtifactDetailView` which fetches canonical Core artifacts.
 *
 * This split exists because the mock list page intentionally reuses the
 * canonical `/code/artifacts/:artifactId` URL shape. Once SPEC-091 lands
 * and Code artifacts come from real Core projection, this wrapper can be
 * removed and the route can point straight at `ArtifactDetailView`
 * again.
 */
export function ArtifactDetailRouter(): JSX.Element {
  const { artifactId } = useParams<{ artifactId: string }>();
  const { artifacts } = useArtifactsMock();
  const isMock =
    !!artifactId && artifacts.some((art) => art.id === artifactId);
  return isMock ? <ArtifactDetailMockPage /> : <ArtifactDetailView />;
}
