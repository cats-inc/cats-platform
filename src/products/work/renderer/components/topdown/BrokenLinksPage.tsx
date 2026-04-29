import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { removeWorkLink } from "../../api/links.js";
import {
  EMPTY_WORK_GRAPH,
  WORK_GRAPH_QUERY_KEY,
  useWorkGraphQuery,
} from "../../state/queries/workGraphQuery.js";
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
  const queryClient = useQueryClient();
  const graph = useWorkGraphQuery().data ?? EMPTY_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);
  // Every link in the graph is producer-stored, so every Remove
  // affordance is enabled.
  const fetchedLinkIds = useMemo(
    () => new Set(graph.links.map((l) => l.id)),
    [graph.links],
  );
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemoveLink = useCallback(
    async (linkId: string): Promise<void> => {
      setRemovingId(linkId);
      setRemoveError(null);
      try {
        await removeWorkLink(linkId);
        await queryClient.invalidateQueries({ queryKey: WORK_GRAPH_QUERY_KEY });
      } catch (err) {
        setRemoveError(err instanceof Error ? err.message : "Failed to remove link.");
      } finally {
        setRemovingId(null);
      }
    },
    [queryClient],
  );

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
        {removeError ? (
          <p className="brokenLinks__removeError" role="alert">
            {removeError}
          </p>
        ) : null}
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
              fetchedLinkIds={fetchedLinkIds}
              onRemoveLink={handleRemoveLink}
              removingId={removingId}
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
  fetchedLinkIds: ReadonlySet<string>;
  onRemoveLink: (linkId: string) => Promise<void>;
  removingId: string | null;
}

function DiagnosticRow({
  diagnostic,
  indexes,
  onOpenObject,
  fetchedLinkIds,
  onRemoveLink,
  removingId,
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
        fetchedLinkIds={fetchedLinkIds}
        onRemoveLink={onRemoveLink}
        removingId={removingId}
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
  fetchedLinkIds,
  onRemoveLink,
  removingId,
}: DiagnosticRowProps): JSX.Element {
  switch (diagnostic.kind) {
    case "orphan_link":
      return (
        <OrphanLinkBody
          diagnostic={diagnostic}
          indexes={indexes}
          removable={fetchedLinkIds.has(diagnostic.linkId)}
          onRemove={onRemoveLink}
          removing={removingId === diagnostic.linkId}
        />
      );
    case "link_cycle":
      return (
        <CycleLinkBody
          diagnostic={diagnostic}
          indexes={indexes}
          fetchedLinkIds={fetchedLinkIds}
          onRemove={onRemoveLink}
          removingId={removingId}
        />
      );
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
  removable,
  onRemove,
  removing,
}: {
  diagnostic: WorkGraphLinkOrphanDiagnostic;
  indexes: WorkGraphIndexes;
  removable: boolean;
  onRemove: (linkId: string) => Promise<void>;
  removing: boolean;
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
          disabled={!removable || removing}
          onClick={() => {
            if (removable && !removing) void onRemove(diagnostic.linkId);
          }}
          title={
            removable
              ? "Remove this link via the producer pipeline."
              : "Demo seed — restart the renderer to clear, or write through the producer pipeline first."
          }
        >
          {removing ? "Removing…" : "Remove this link"}
        </button>
        {!removable ? (
          <span className="brokenLinks__pendingNote">
            Demo fixture — only producer-stored links can be removed via API.
          </span>
        ) : null}
      </footer>
    </div>
  );
}

function CycleLinkBody({
  diagnostic,
  indexes,
  fetchedLinkIds,
  onRemove,
  removingId,
}: {
  diagnostic: WorkGraphLinkCycleDiagnostic;
  indexes: WorkGraphIndexes;
  fetchedLinkIds: ReadonlySet<string>;
  onRemove: (linkId: string) => Promise<void>;
  removingId: string | null;
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
          {diagnostic.cycleLinkIds.map((linkId) => {
            const removable = fetchedLinkIds.has(linkId);
            const removing = removingId === linkId;
            return (
              <li key={linkId}>
                <button
                  type="button"
                  className="brokenLinks__removeLink"
                  disabled={!removable || removing}
                  onClick={() => {
                    if (removable && !removing) void onRemove(linkId);
                  }}
                  title={
                    removable
                      ? "Remove this link via the producer pipeline."
                      : "Demo seed — only producer-stored links can be removed via API."
                  }
                >
                  {removing ? "Removing…" : `Remove `}
                  {!removing ? <code>{linkId}</code> : null}
                </button>
              </li>
            );
          })}
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
