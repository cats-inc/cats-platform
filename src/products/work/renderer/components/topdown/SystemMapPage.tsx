import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { MOCK_WORK_GRAPH } from "./mock";
import { buildIndexes } from "./shared";
import type { WorkGraphLayer, WorkGraphObjectSummary } from "./types";
import { WorkObjectCard, pickEvidence } from "./WorkObjectCard";
import { WorkObjectDrawer } from "./WorkObjectDrawer";
import "./topdown.css";

const PANES: Array<{ layer: WorkGraphLayer; label: string; description: string }> = [
  {
    layer: "interaction",
    label: "Interaction",
    description: "Who interacts, through which channel, in what shape.",
  },
  {
    layer: "planning",
    label: "Planning",
    description: "What the operator wants done — Project / WorkItem.",
  },
  {
    layer: "execution",
    label: "Execution",
    description: "How work runs — Task / Mission / Run.",
  },
];

export function SystemMapPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("selectedId");

  const graph = MOCK_WORK_GRAPH;
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
          <span className="topDownTopBar__eyebrow">Top-down · structural</span>
          <h1 className="channelTopBarTitle topDownTopBar__title">System Map</h1>
        </div>
        <div className="channelTopBarCenter topDownTopBar__center">
          <p className="topDownTopBar__lede">
            Three canonical layers from <code>ADR-081</code> as cohabiting
            cards — see what exists in the taxonomy, not what's urgent.
          </p>
        </div>
        <div className="channelTopBarEnd topDownTopBar__end">
          <span className="topDownTopBar__metric">
            <strong>{counts.structural}</strong> structural
          </span>
          <span className="topDownTopBar__metric">
            <strong>{counts.objects}</strong> total
          </span>
          <span
            className={
              "topDownTopBar__metric" +
              (counts.diagnostics > 0
                ? " topDownTopBar__metric--warn"
                : "")
            }
          >
            <strong>{counts.diagnostics}</strong> diagnostics
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
              aria-label={`${pane.label} layer`}
            >
              <header className="systemMap__paneHead">
                <h2 className="systemMap__paneTitle">{pane.label}</h2>
                <span className="systemMap__paneCount">{objects.length}</span>
                <p className="systemMap__paneDescription">{pane.description}</p>
              </header>
              <div className="systemMap__paneBody">
                {objects.length === 0 ? (
                  <p className="systemMap__paneEmpty">
                    No objects in this layer.
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
