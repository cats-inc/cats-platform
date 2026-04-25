import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { MOCK_WORK_GRAPH } from "./mock";
import { buildIndexes } from "./shared";
import type { WorkGraphDiagnosticSeverity } from "./types";
import { WorkObjectDrawer } from "./WorkObjectDrawer";
import "./topdown.css";

type SeverityFilter = "all" | WorkGraphDiagnosticSeverity;

const SEVERITY_ORDER: WorkGraphDiagnosticSeverity[] = ["error", "warning", "info"];

export function BrokenLinksPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const severityFilter =
    (searchParams.get("severity") as SeverityFilter | null) ?? "all";
  const selectedId = searchParams.get("selectedId");
  const graph = MOCK_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);

  const counts = useMemo(() => {
    const c: Record<WorkGraphDiagnosticSeverity, number> = {
      error: 0,
      warning: 0,
      info: 0,
    };
    for (const d of graph.diagnostics) c[d.severity] += 1;
    return c;
  }, [graph]);

  const filtered = useMemo(() => {
    return graph.diagnostics
      .filter((d) =>
        severityFilter === "all" ? true : d.severity === severityFilter,
      )
      .sort((a, b) => {
        const sev =
          SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
        if (sev !== 0) return sev;
        return a.kind.localeCompare(b.kind);
      });
  }, [graph, severityFilter]);

  function setSeverity(next: SeverityFilter): void {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("severity");
    else params.set("severity", next);
    setSearchParams(params, { replace: true });
  }

  function setSelectedId(id: string | null): void {
    const params = new URLSearchParams(searchParams);
    if (id === null) params.delete("selectedId");
    else params.set("selectedId", id);
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="topDownPage">
      <header className="channelTopBar topDownTopBar">
        <div className="channelTopBarStart topDownTopBar__start">
          <span className="topDownTopBar__eyebrow">Top-down · conformance</span>
          <h1 className="channelTopBarTitle topDownTopBar__title">Broken Links</h1>
        </div>
        <div className="channelTopBarCenter topDownTopBar__center">
          <p className="topDownTopBar__lede">
            Diagnostics from the projection layer when producer writes don't
            satisfy <code>SPEC-083 §Minimum Anchor Sets</code>.
          </p>
        </div>
        <div className="channelTopBarEnd topDownTopBar__end">
          <span
            className={
              "topDownTopBar__metric" +
              (counts.error > 0 ? " topDownTopBar__metric--bad" : "")
            }
          >
            <strong>{counts.error}</strong> errors
          </span>
          <span
            className={
              "topDownTopBar__metric" +
              (counts.warning > 0 ? " topDownTopBar__metric--warn" : "")
            }
          >
            <strong>{counts.warning}</strong> warnings
          </span>
          <span className="topDownTopBar__metric">
            <strong>{counts.info}</strong> info
          </span>
        </div>
      </header>
      <nav className="brokenLinks__filters" aria-label="Severity filters">
        <FilterChip
          active={severityFilter === "all"}
          label="All"
          n={graph.diagnostics.length}
          onClick={() => setSeverity("all")}
        />
        <FilterChip
          active={severityFilter === "error"}
          label="Error"
          n={counts.error}
          tone="error"
          onClick={() => setSeverity("error")}
        />
        <FilterChip
          active={severityFilter === "warning"}
          label="Warning"
          n={counts.warning}
          tone="warning"
          onClick={() => setSeverity("warning")}
        />
        <FilterChip
          active={severityFilter === "info"}
          label="Info"
          n={counts.info}
          tone="info"
          onClick={() => setSeverity("info")}
        />
      </nav>
      <div className="brokenLinks__list">
        {filtered.length === 0 ? (
          <p className="brokenLinks__empty">
            No diagnostics under the active filter.
          </p>
        ) : (
          filtered.map((d) => {
            const target = d.objectId
              ? indexes.objectsById.get(d.objectId)
              : undefined;
            return (
              <article
                key={d.id}
                className={`brokenLinks__row brokenLinks__row--${d.severity}`}
              >
                <header className="brokenLinks__rowHead">
                  <span
                    className={`brokenLinks__sev brokenLinks__sev--${d.severity}`}
                  >
                    {d.severity.toUpperCase()}
                  </span>
                  <code className="brokenLinks__kind">{d.kind}</code>
                  {target ? (
                    <span className="brokenLinks__rowSubject">
                      on <strong>{target.title}</strong>
                    </span>
                  ) : null}
                </header>
                <p className="brokenLinks__msg">{d.message}</p>
                <footer className="brokenLinks__rowFoot">
                  {d.objectId ? (
                    target ? (
                      <button
                        type="button"
                        className="brokenLinks__open"
                        onClick={() => setSelectedId(d.objectId)}
                      >
                        Open in drawer →
                      </button>
                    ) : (
                      <span className="brokenLinks__broken">
                        object id <code>{d.objectId}</code> not in projection
                      </span>
                    )
                  ) : (
                    <span className="brokenLinks__system">
                      systemic — no specific object
                    </span>
                  )}
                </footer>
              </article>
            );
          })
        )}
      </div>
      <WorkObjectDrawer
        graph={graph}
        indexes={indexes}
        selectedId={selectedId}
        onClose={() => setSelectedId(null)}
        onSelect={(id: string) =>
          setSelectedId(selectedId === id ? null : id)
        }
      />
    </div>
  );
}

function FilterChip({
  active,
  label,
  n,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  n: number;
  tone?: "error" | "warning" | "info";
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={
        "brokenLinks__chip" +
        (tone ? ` brokenLinks__chip--${tone}` : "") +
        (active ? " brokenLinks__chip--active" : "")
      }
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="brokenLinks__chipLabel">{label}</span>
      <span className="brokenLinks__chipCount">{n}</span>
    </button>
  );
}
