import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import {
  buildSubRunTree,
  useRuns,
  type RunItem,
  type RunTreeNode,
} from "../../state/runsStore";
import { useTasks } from "../../state/tasksStore";
import { useWorkGraph } from "../../state/workGraphStore";
import {
  WORK_TASKS_PATH,
  buildWorkRunPath,
  buildWorkTaskPath,
} from "../../workPaths.js";
import {
  fetchTracesByRunId,
  type CoreTraceSummary,
} from "../../api/traces.js";
import "./runs.css";

interface TraceState {
  status: "idle" | "loading" | "ready" | "error";
  traces: CoreTraceSummary[];
  error: string | null;
}

const INITIAL_TRACE_STATE: TraceState = {
  status: "idle",
  traces: [],
  error: null,
};

function formatDuration(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) return null;
  const endMs = end ? Date.parse(end) : Date.now();
  if (Number.isNaN(endMs)) return null;
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

export function RunDetailPage(): JSX.Element {
  const { taskId, runId } = useParams<{ taskId: string; runId: string }>();
  const { allRuns } = useRuns();
  const { allTasks } = useTasks();
  const { graph } = useWorkGraph();

  const run = runId ? allRuns.find((r) => r.id === runId) : undefined;
  const parentTask = taskId
    ? allTasks.find((t) => t.id === taskId)
    : undefined;
  const subTree = useMemo<RunTreeNode[]>(
    () => (runId ? buildSubRunTree(runId, allRuns) : []),
    [runId, allRuns],
  );

  const activities = useMemo(
    () =>
      graph.objects
        .filter((o) => o.kind === "activity" && o.linkedRunId === runId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [graph.objects, runId],
  );
  const outcomes = useMemo(
    () =>
      graph.objects
        .filter((o) => o.kind === "outcome" && o.linkedRunId === runId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [graph.objects, runId],
  );
  const artifacts = useMemo(
    () =>
      graph.objects
        .filter((o) => o.kind === "artifact" && o.linkedRunId === runId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [graph.objects, runId],
  );

  const [traceState, setTraceState] = useState<TraceState>(INITIAL_TRACE_STATE);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    setTraceState({ status: "loading", traces: [], error: null });
    fetchTracesByRunId(runId, controller.signal)
      .then((traces) => {
        setTraceState({ status: "ready", traces, error: null });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setTraceState({
          status: "error",
          traces: [],
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => controller.abort();
  }, [runId]);

  if (!run) {
    return <RunNotFound runId={runId ?? null} />;
  }

  const duration = formatDuration(run.startedAt ?? null, run.completedAt ?? null);

  return (
    <div className="runDetail">
      <header className="channelTopBar runDetailTopBar">
        <div className="channelTopBarStart runDetailTopBar__start">
          <Link
            to={WORK_TASKS_PATH}
            className="runDetailTopBar__back"
            aria-label="Back to tasks"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7.5 2L3.5 6l4 4" />
            </svg>
            <span>Tasks</span>
          </Link>
          {parentTask ? (
            <>
              <span className="runDetailTopBar__sep">›</span>
              <Link
                to={buildWorkTaskPath(parentTask.id)}
                className="runDetailTopBar__crumb"
              >
                {parentTask.title}
              </Link>
            </>
          ) : null}
          <span className="runDetailTopBar__sep">›</span>
          <h1 className="channelTopBarTitle runDetailTopBar__title">
            {run.title}
          </h1>
        </div>
        <div className="channelTopBarCenter runDetailTopBar__center" />
        <div className="channelTopBarEnd runDetailTopBar__end">
          <span className={`runDetail__statusPill runDetail__statusPill--${run.status}`}>
            {run.status.replace(/_/g, " ")}
          </span>
        </div>
      </header>

      <main className="runDetail__main">
        <section className="runDetail__section">
          <h2 className="runDetail__sectionHeading">Run summary</h2>
          <dl className="runDetail__summary">
            <div className="runDetail__summaryRow">
              <dt>Status</dt>
              <dd>{run.status.replace(/_/g, " ")}</dd>
            </div>
            {run.ownerRole ? (
              <div className="runDetail__summaryRow">
                <dt>Orchestrator</dt>
                <dd>{run.ownerRole}</dd>
              </div>
            ) : null}
            <div className="runDetail__summaryRow">
              <dt>Updated</dt>
              <dd>{formatRelative(run.updatedAt)}</dd>
            </div>
            {duration ? (
              <div className="runDetail__summaryRow">
                <dt>Duration</dt>
                <dd>{duration}</dd>
              </div>
            ) : null}
            {run.parentRunId ? (
              <div className="runDetail__summaryRow">
                <dt>Parent run</dt>
                <dd>
                  {parentTask ? (
                    <Link
                      to={buildWorkRunPath(parentTask.id, run.parentRunId)}
                      className="runDetail__crumbLink"
                    >
                      {run.parentRunId}
                    </Link>
                  ) : (
                    <code>{run.parentRunId}</code>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          {run.summary ? (
            <p className="runDetail__summaryBody">{run.summary}</p>
          ) : null}
        </section>

        <section className="runDetail__section">
          <h2 className="runDetail__sectionHeading">
            Sub-runs <span className="runDetail__count">{countTree(subTree)}</span>
          </h2>
          {subTree.length === 0 ? (
            <p className="runDetail__empty">No sub-runs.</p>
          ) : (
            <SubRunTree nodes={subTree} taskId={taskId ?? "orphan"} depth={0} />
          )}
        </section>

        <section className="runDetail__section">
          <h2 className="runDetail__sectionHeading">
            Trace{" "}
            <span className="runDetail__count">{traceState.traces.length}</span>
          </h2>
          {traceState.status === "loading" ? (
            <p className="runDetail__empty">Loading trace…</p>
          ) : traceState.status === "error" ? (
            <p className="runDetail__error">
              Failed to load trace: {traceState.error}
            </p>
          ) : traceState.traces.length === 0 ? (
            <p className="runDetail__empty">No trace records.</p>
          ) : (
            <ol className="runDetail__trace">
              {traceState.traces
                .slice()
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((trace) => (
                  <li
                    key={trace.id}
                    className={`runDetail__traceRow runDetail__traceRow--${trace.kind}`}
                  >
                    <span className="runDetail__traceKind">{trace.kind}</span>
                    <p className="runDetail__traceMessage">{trace.message}</p>
                    <span className="runDetail__traceTime">
                      {formatRelative(trace.createdAt)}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </section>

        {activities.length > 0 ? (
          <section className="runDetail__section">
            <h2 className="runDetail__sectionHeading">
              Activities <span className="runDetail__count">{activities.length}</span>
            </h2>
            <ul className="runDetail__simpleList">
              {activities.map((a) => (
                <li key={a.id} className="runDetail__simpleRow">
                  <span className="runDetail__simpleTitle">{a.title}</span>
                  <span className="runDetail__simpleTime">
                    {formatRelative(a.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {outcomes.length > 0 ? (
          <section className="runDetail__section">
            <h2 className="runDetail__sectionHeading">
              Outcomes <span className="runDetail__count">{outcomes.length}</span>
            </h2>
            <ul className="runDetail__simpleList">
              {outcomes.map((o) => (
                <li key={o.id} className="runDetail__simpleRow">
                  <span className="runDetail__simpleTitle">{o.title}</span>
                  <span className="runDetail__simpleStatus">{o.status}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {artifacts.length > 0 ? (
          <section className="runDetail__section">
            <h2 className="runDetail__sectionHeading">
              Artifacts <span className="runDetail__count">{artifacts.length}</span>
            </h2>
            <ul className="runDetail__simpleList">
              {artifacts.map((a) => (
                <li key={a.id} className="runDetail__simpleRow">
                  <span className="runDetail__simpleTitle">{a.title}</span>
                  <span className="runDetail__simpleStatus">{a.status}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function countTree(nodes: RunTreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count += 1 + countTree(n.children);
  }
  return count;
}

interface SubRunTreeProps {
  nodes: RunTreeNode[];
  taskId: string;
  depth: number;
}

function SubRunTree({ nodes, taskId, depth }: SubRunTreeProps): JSX.Element {
  return (
    <ul
      className={
        depth === 0 ? "runDetail__subTree" : "runDetail__subTree runDetail__subTree--nested"
      }
    >
      {nodes.map(({ run, children }) => (
        <li key={run.id} className="runDetail__subTreeNode">
          <Link
            to={buildWorkRunPath(taskId, run.id)}
            className="runDetail__subTreeLink"
            aria-label={`Open sub-run ${run.title}`}
          >
            <span
              className={`runDetail__subTreeDot runDetail__subTreeDot--${run.status}`}
              aria-hidden="true"
            />
            <span className="runDetail__subTreeTitle">{run.title}</span>
            <span
              className={`runDetail__subTreeStatus runDetail__subTreeStatus--${run.status}`}
            >
              {run.status.replace(/_/g, " ")}
            </span>
            <span className="runDetail__subTreeTime">
              {formatRelative(run.updatedAt)}
            </span>
          </Link>
          {children.length > 0 ? (
            <SubRunTree nodes={children} taskId={taskId} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RunNotFound({ runId }: { runId: string | null }): JSX.Element {
  return (
    <div className="runDetail">
      <header className="channelTopBar runDetailTopBar">
        <div className="channelTopBarStart runDetailTopBar__start">
          <Link to={WORK_TASKS_PATH} className="runDetailTopBar__back">
            <span>Tasks</span>
          </Link>
        </div>
      </header>
      <main className="runDetail__main">
        <p className="runDetail__empty">
          {runId ? `Run ${runId} not found.` : "No run id provided."}
        </p>
      </main>
    </div>
  );
}
