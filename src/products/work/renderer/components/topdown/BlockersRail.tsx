import { useMemo } from "react";

import {
  getWorkGraphKindLabel,
  walkUpstreamBlockers,
  type WorkGraphIndexes,
} from "./shared";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import type {
  WorkGraphLink,
  WorkGraphLinkEndpointKind,
  WorkGraphObjectSummary,
} from "./types";

interface BlockersRailProps {
  rows: WorkGraphObjectSummary[];
  links: readonly WorkGraphLink[];
  indexes: WorkGraphIndexes;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Cap the upstream chain depth (SPEC-090 §UI Surfaces uses 3 at v1). */
  maxDepth?: number;
}

const PWT_KINDS: ReadonlySet<WorkGraphLinkEndpointKind> = new Set([
  "project",
  "work_item",
  "task",
]);

interface RowChain {
  row: WorkGraphObjectSummary;
  chain: WorkGraphObjectSummary[];
}

/**
 * Cockpit-side rail listing the transitive upstream `blocks` chain for
 * each row in the supplied attention list. Skips rows whose record
 * family is outside the SPEC-090 v1 endpoint set (project / work_item /
 * task) — Conversation / Run / Mission cards never carry link views.
 *
 * Read-only at this phase per PLAN-079; clicking a blocker selects it
 * via `onSelect` (the parent decides whether that opens a drawer or
 * routes elsewhere).
 */
export function BlockersRail({
  rows,
  links,
  indexes,
  selectedId,
  onSelect,
  maxDepth = 3,
}: BlockersRailProps): JSX.Element {
  const { t } = useI18n();
  const sections = useMemo<RowChain[]>(() => {
    const out: RowChain[] = [];
    for (const row of rows) {
      if (!PWT_KINDS.has(row.kind as WorkGraphLinkEndpointKind)) continue;
      const chain = walkUpstreamBlockers(
        {
          recordFamily: row.kind as WorkGraphLinkEndpointKind,
          recordId: row.sourceRecordId,
        },
        links,
        indexes.objectsByCoreRef,
        maxDepth,
      );
      if (chain.length === 0) continue;
      out.push({ row, chain });
    }
    return out;
  }, [rows, links, indexes.objectsByCoreRef, maxDepth]);

  return (
    <aside
      className="blockersRail"
      aria-label={t("workTopdownUpstreamBlockersAriaLabel")}
    >
      <header className="blockersRail__head">
        <h3>{t("workTopdownBlockersTitle")}</h3>
        <p>
          {t("workTopdownUpstreamBlocksLine", {
            maxDepth: `${maxDepth}`,
          })}
        </p>
      </header>
      {sections.length === 0 ? (
        <p className="blockersRail__empty">
          {t("workTopdownNoUpstreamBlockers")}
        </p>
      ) : (
        <ul className="blockersRail__sections">
          {sections.map(({ row, chain }) => (
            <li key={row.id} className="blockersRail__section">
              <div className="blockersRail__rowHead">
                <span
                  className={`projectsList__dot projectsList__dot--small projectsList__dot--${row.status}`}
                  aria-hidden="true"
                />
                <span className="blockersRail__rowTitle">{row.title}</span>
              </div>
              <ul className="blockersRail__chain">
                {chain.map((blocker) => (
                  <li key={blocker.id} className="blockersRail__chainItem">
                    <button
                      type="button"
                      className={
                        "blockersRail__btn" +
                        (selectedId === blocker.id
                          ? " blockersRail__btn--selected"
                          : "")
                      }
                      onClick={() =>
                        onSelect(
                          selectedId === blocker.id ? null : blocker.id,
                        )
                      }
                    >
                      <span
                        className={`projectsList__dot projectsList__dot--small projectsList__dot--${blocker.status}`}
                        aria-hidden="true"
                      />
                      <span className="blockersRail__btnTitle">
                        {blocker.title}
                      </span>
                      <span className="blockersRail__btnTier">
                        {getWorkGraphKindLabel(blocker.kind, t)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
