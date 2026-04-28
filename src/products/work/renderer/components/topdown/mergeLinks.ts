import { buildIndexes, projectLinks } from "./shared";
import type {
  WorkGraphLink,
  WorkGraphProjection,
} from "./types";

/**
 * Combine a baseline `WorkGraphProjection` (e.g. the mock fixture) with a
 * batch of links fetched from the producer pipeline (Core), then re-run
 * `projectLinks` so the read-side `linksByEndpoint` and link diagnostics
 * reflect the union.
 *
 * The base's non-link projection surface (objects, evidence attachments,
 * gate decorators, base diagnostics) passes through unchanged.
 *
 * Dedup by `id`: a fetched link with the same id as a base-seeded link
 * replaces the base row. This lets the producer pipeline override
 * fixture data when the demo is moved into Core.
 */
export function mergeWorkGraphLinks(
  base: WorkGraphProjection,
  fetched: readonly WorkGraphLink[],
): WorkGraphProjection {
  const byId = new Map<string, WorkGraphLink>();
  for (const link of base.links) byId.set(link.id, link);
  for (const link of fetched) byId.set(link.id, link);
  const merged = Array.from(byId.values());

  const indexes = buildIndexes(base);
  const projection = projectLinks(merged, indexes.objectsByCoreRef);

  const baseDiagnostics = base.diagnostics.filter(
    (d) => d.kind !== "orphan_link" && d.kind !== "link_cycle",
  );

  return {
    ...base,
    links: merged,
    linksByEndpoint: projection.linksByEndpoint,
    diagnostics: [...baseDiagnostics, ...projection.diagnostics],
  };
}
