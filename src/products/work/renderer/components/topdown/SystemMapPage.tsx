import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  EMPTY_WORK_GRAPH,
  useWorkGraphQuery,
} from "../../state/queries/workGraphQuery.js";
import { useI18n } from "../../../app/renderer/i18n/index.js";
import { buildIndexes } from "./shared";
import type { WorkGraphLayer, WorkGraphObjectSummary } from "./types";
import { WorkObjectCard, pickEvidence } from "./WorkObjectCard";
import { WorkObjectDrawer } from "./WorkObjectDrawer";
import "./topdown.css";

const PANES: ReadonlyArray<{ layer: WorkGraphLayer }> = [
  {
    layer: "interaction",
  },
  {
    layer: "planning",
  },
  {
    layer: "execution",
  },
];

export function SystemMapPage(): JSX.Element {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("selectedId");

  const graph = useWorkGraphQuery().data ?? EMPTY_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);

  const byLayer = useMemo(() => {
    const groups: Record<WorkGraphLayer, WorkGraphObjectSummary[]> = {
      interaction: [],
      planning: [],
      execution: [],
    };
    for (const o of graph.objects) {
      if (o.structuralLayer) groups[o.structuralLayer].push(o);
    }
    return groups;
  }, [graph]);

  const counts = {
    objects: graph.objects.length,
    diagnostics: graph.diagnostics.length,
    structural:
      byLayer.interaction.length + byLayer.planning.length + byLayer.execution.length,
  };

  function setSelectedId(id: string | null): void {
    const next = new URLSearchParams(searchParams);
    if (id === null) next.delete("selectedId");
    else next.set("selectedId", id);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="topDownPage">
      <header className="channelTopBar topDownTopBar">
        <div className="channelTopBarStart topDownTopBar__start">
          <span className="topDownTopBar__eyebrow">
            {t("topdown.systemMapEyebrow")}
          </span>
          <h1 className="channelTopBarTitle topDownTopBar__title">
            {t("topdown.systemMapTitle")}
          </h1>
        </div>
        <div className="channelTopBarCenter topDownTopBar__center">
          <p className="topDownTopBar__lede">
            {t("topdown.systemMapLede")}
          </p>
        </div>
        <div className="channelTopBarEnd topDownTopBar__end">
          <span className="topDownTopBar__metric">
            <strong>{counts.structural}</strong> {t("topdown.systemMapStructuralLabel")}
          </span>
          <span className="topDownTopBar__metric">
            <strong>{counts.objects}</strong> {t("topdown.systemMapTotalLabel")}
          </span>
          <span
            className={
              "topDownTopBar__metric" +
              (counts.diagnostics > 0
                ? " topDownTopBar__metric--warn"
                : "")
            }
          >
            <strong>{counts.diagnostics}</strong>{" "}
            {t("topdown.systemMapDiagnosticsLabel")}
          </span>
        </div>
      </header>
      <div className="systemMap">
        {PANES.map((pane) => {
          const objects = byLayer[pane.layer];
          return (
            <section
              key={pane.layer}
              className="systemMap__pane"
              data-layer={pane.layer}
              aria-label={t("topdown.systemMapLayerAriaLabel", {
                layerLabel: getSystemMapLayerLabel(pane.layer, t),
              })}
            >
              <header className="systemMap__paneHead">
                <h2 className="systemMap__paneTitle">
                  {getSystemMapLayerLabel(pane.layer, t)}
                </h2>
                <span className="systemMap__paneCount">{objects.length}</span>
                <p className="systemMap__paneDescription">
                  {getSystemMapLayerDescription(pane.layer, t)}
                </p>
              </header>
              <div className="systemMap__paneBody">
                {objects.length === 0 ? (
                  <p className="systemMap__paneEmpty">
                    {t("topdown.systemMapLayerEmpty")}
                  </p>
                ) : (
                  objects.map((o) => (
                    <WorkObjectCard
                      key={o.id}
                      object={o}
                      evidence={pickEvidence(indexes, o.id)}
                      gates={indexes.gatesBySubject.get(o.id) ?? []}
                      selected={selectedId === o.id}
                      onSelect={(id) =>
                        setSelectedId(selectedId === id ? null : id)
                      }
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
      <WorkObjectDrawer
        graph={graph}
        indexes={indexes}
        selectedId={selectedId}
        onClose={() => setSelectedId(null)}
        onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
      />
    </div>
  );
}

function getSystemMapLayerLabel(
  layer: WorkGraphLayer,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  return layer === "interaction"
    ? t("topdown.systemMapLayerInteractionLabel")
    : layer === "planning"
      ? t("topdown.systemMapLayerPlanningLabel")
      : t("topdown.systemMapLayerExecutionLabel");
}

function getSystemMapLayerDescription(
  layer: WorkGraphLayer,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  return layer === "interaction"
    ? t("topdown.systemMapLayerInteractionDescription")
    : layer === "planning"
      ? t("topdown.systemMapLayerPlanningDescription")
      : t("topdown.systemMapLayerExecutionDescription");
}
