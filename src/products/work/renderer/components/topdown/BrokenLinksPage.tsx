import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { useWorkGraphLinks } from "../../state/workGraphLinksStore";
import { mergeWorkGraphLinks } from "./mergeLinks";
import { MOCK_WORK_GRAPH } from "./mock";
import {
  buildIndexes,
  endpointKey,
  KIND_LABEL,
  type WorkGraphIndexes,
} from "./shared";
import type {
  WorkGraphDiagnostic,
  WorkGraphDiagnosticSeverity,
  WorkGraphLinkCycleDiagnostic,
  WorkGraphLinkDiagnostic,
  WorkGraphLinkEndpointRef,
  WorkGraphLinkOrphanDiagnostic,
} from "./types";
import { WorkObjectDrawer } from "./WorkObjectDrawer";
import "./topdown.css";

type SeverityFilter = "all" | WorkGraphDiagnosticSeverity;

const SEVERITY_ORDER: WorkGraphDiagnosticSeverity[] = ["error", "warning", "info"];

type Diagnostic = WorkGraphDiagnostic | WorkGraphLinkDiagnostic;

export function BrokenLinksPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const severityFilter =
    (searchParams.get("severity") as SeverityFilter | null) ?? "all";
  const selectedId = searchParams.get("selectedId");
  const { fetchedLinks } = useWorkGraphLinks();
  const graph = useMemo(
    () => mergeWorkGraphLinks(MOCK_WORK_GRAPH, fetchedLinks),
    [fetchedLinks],
  );
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
            satisfy <code>SPEC-083 §Minimum Anchor Sets</code> or SPEC-090 link
            integrity.
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
          filtered.map((d) => (
            <DiagnosticRow
              key={d.id}
              diagnostic={d}
              indexes={indexes}
              onOpenObject={setSelectedId}
            />
          ))
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

interface DiagnosticRowProps {
  diagnostic: Diagnostic;
  indexes: WorkGraphIndexes;
  onOpenObject: (id: string | null) => void;
}

function DiagnosticRow({
  diagnostic,
  indexes,
  onOpenObject,
}: DiagnosticRowProps): JSX.Element {
  return (
    <article
      className={`brokenLinks__row brokenLinks__row--${diagnostic.severity}`}
    >
      <header className="brokenLinks__rowHead">
        <span
          className={`brokenLinks__sev brokenLinks__sev--${diagnostic.severity}`}
        >
          {diagnostic.severity.toUpperCase()}
        </span>
        <code className="brokenLinks__kind">{diagnostic.kind}</code>
        <RowSubject diagnostic={diagnostic} indexes={indexes} />
      </header>
      <p className="brokenLinks__msg">{diagnostic.message}</p>
      <DiagnosticBody
        diagnostic={diagnostic}
        indexes={indexes}
        onOpenObject={onOpenObject}
      />
    </article>
  );
}

function RowSubject({
  diagnostic,
  indexes,
}: {
  diagnostic: Diagnostic;
  indexes: WorkGraphIndexes;
}): JSX.Element | null {
  if (diagnostic.kind === "orphan_link" || diagnostic.kind === "link_cycle") {
    return null;
  }
  if (!diagnostic.objectId) return null;
  const target = indexes.objectsById.get(diagnostic.objectId);
  if (!target) return null;
  return (
    <span className="brokenLinks__rowSubject">
      on <strong>{target.title}</strong>
    </span>
  );
}

function DiagnosticBody({
  diagnostic,
  indexes,
  onOpenObject,
}: DiagnosticRowProps): JSX.Element {
  switch (diagnostic.kind) {
    case "orphan_link":
      return <OrphanLinkBody diagnostic={diagnostic} indexes={indexes} />;
    case "link_cycle":
      return <CycleLinkBody diagnostic={diagnostic} indexes={indexes} />;
    default:
      return (
        <BaseDiagnosticBody
          diagnostic={diagnostic}
          indexes={indexes}
          onOpenObject={onOpenObject}
        />
      );
  }
}

function BaseDiagnosticBody({
  diagnostic,
  indexes,
  onOpenObject,
}: {
  diagnostic: WorkGraphDiagnostic;
  indexes: WorkGraphIndexes;
  onOpenObject: (id: string | null) => void;
}): JSX.Element {
  const target = diagnostic.objectId
    ? indexes.objectsById.get(diagnostic.objectId)
    : undefined;
  return (
    <footer className="brokenLinks__rowFoot">
      {diagnostic.objectId ? (
        target ? (
          <button
            type="button"
            className="brokenLinks__open"
            onClick={() => onOpenObject(diagnostic.objectId)}
          >
            Open in drawer →
          </button>
        ) : (
          <span className="brokenLinks__broken">
            object id <code>{diagnostic.objectId}</code> not in projection
          </span>
        )
      ) : (
        <span className="brokenLinks__system">
          systemic — no specific object
        </span>
      )}
    </footer>
  );
}

function OrphanLinkBody({
  diagnostic,
  indexes,
}: {
  diagnostic: WorkGraphLinkOrphanDiagnostic;
  indexes: WorkGraphIndexes;
}): JSX.Element {
  const sourceUnresolved =
    diagnostic.unresolvedSide === "source" ||
    diagnostic.unresolvedSide === "both";
  const targetUnresolved =
    diagnostic.unresolvedSide === "target" ||
    diagnostic.unresolvedSide === "both";
  return (
    <div className="brokenLinks__linkBody">
      <div className="brokenLinks__endpoints">
        <EndpointPill
          endpoint={diagnostic.sourceEndpoint}
          indexes={indexes}
          unresolved={sourceUnresolved}
        />
        <span className="brokenLinks__arrow" aria-hidden="true">→</span>
        <EndpointPill
          endpoint={diagnostic.targetEndpoint}
          indexes={indexes}
          unresolved={targetUnresolved}
        />
      </div>
      <footer className="brokenLinks__rowFoot">
        <button
          type="button"
          className="brokenLinks__removeLink"
          disabled
          title="Disabled until Phase 5 wires the producer-pipeline removeLink call."
        >
          Remove this link
        </button>
        <span className="brokenLinks__pendingNote">
          Phase 5 enables write actions.
        </span>
      </footer>
    </div>
  );
}

function CycleLinkBody({
  diagnostic,
  indexes,
}: {
  diagnostic: WorkGraphLinkCycleDiagnostic;
  indexes: WorkGraphIndexes;
}): JSX.Element {
  return (
    <div className="brokenLinks__linkBody">
      <ol className="brokenLinks__cycle">
        {diagnostic.cycleEndpoints.map((endpoint, i) => (
          <li
            key={`${endpoint.recordFamily}:${endpoint.recordId}:${i}`}
            className="brokenLinks__cycleStep"
          >
            <EndpointPill
              endpoint={endpoint}
              indexes={indexes}
              unresolved={false}
            />
            <span
              className={
                "brokenLinks__arrow" +
                (i === diagnostic.cycleEndpoints.length - 1
                  ? " brokenLinks__arrow--loop"
                  : "")
              }
              aria-hidden="true"
            >
              {i === diagnostic.cycleEndpoints.length - 1 ? "↺" : "→"}
            </span>
          </li>
        ))}
      </ol>
      <footer className="brokenLinks__rowFoot brokenLinks__rowFoot--cycle">
        <span className="brokenLinks__cycleActionsLabel">
          Removable rows ({diagnostic.cycleLinkIds.length}):
        </span>
        <ul className="brokenLinks__cycleActions">
          {diagnostic.cycleLinkIds.map((linkId) => (
            <li key={linkId}>
              <button
                type="button"
                className="brokenLinks__removeLink"
                disabled
                title="Disabled until Phase 5 wires the producer-pipeline removeLink call."
              >
                Remove <code>{linkId}</code>
              </button>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}

interface EndpointPillProps {
  endpoint: WorkGraphLinkEndpointRef;
  indexes: WorkGraphIndexes;
  unresolved: boolean;
}

function EndpointPill({
  endpoint,
  indexes,
  unresolved,
}: EndpointPillProps): JSX.Element {
  const summary = indexes.objectsByCoreRef.get(endpointKey(endpoint));
  const familyLabel = KIND_LABEL[endpoint.recordFamily];
  return (
    <span
      className={
        "brokenLinks__endpointPill" +
        (unresolved ? " brokenLinks__endpointPill--unresolved" : "")
      }
    >
      <span className="brokenLinks__endpointFamily">{familyLabel}</span>
      <span className="brokenLinks__endpointTitle">
        {summary ? summary.title : <code>{endpoint.recordId}</code>}
      </span>
      {unresolved ? (
        <span className="brokenLinks__deletedMark">(deleted)</span>
      ) : null}
    </span>
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
