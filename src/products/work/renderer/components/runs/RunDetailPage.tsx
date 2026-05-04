import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { formatRelative } from "../topdown/shared";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { getWorkObjectStatusLabel } from "../topdown/WorkObjectCard";
import {
  stopWorkRun,
  type WorkRunStopResponse,
} from "../../api/runCancellation.js";
import { MISSIONS_QUERY_KEY } from "../../state/queries/missionsQuery.js";
import {
  RUNS_QUERY_KEY,
  useRunsQuery,
  type WorkRunListItem,
} from "../../state/queries/runsQuery.js";
import { useTasksQuery } from "../../state/queries/tasksQuery.js";
import {
  EMPTY_WORK_GRAPH,
  WORK_GRAPH_QUERY_KEY,
  useWorkGraphQuery,
} from "../../state/queries/workGraphQuery.js";
import {
  WORK_TASKS_PATH,
  buildWorkRunPath,
  buildWorkTaskPath,
} from "../../workPaths.js";
import {
  fetchTracesByRunId,
  type CoreTraceSummary,
} from "../../api/traces.js";
import { presentWorkRunSummary } from "./runSummaryLabels.js";
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

interface RunTreeNode {
  run: WorkRunListItem;
  children: RunTreeNode[];
}

function buildSubRunTree(
  rootRunId: string,
  allRuns: readonly WorkRunListItem[],
): RunTreeNode[] {
  const byParent = new Map<string, WorkRunListItem[]>();
  for (const run of allRuns) {
    const key = run.parentRunId ?? "";
    const list = byParent.get(key) ?? [];
    list.push(run);
    byParent.set(key, list);
  }

  function walk(parentId: string, visited: ReadonlySet<string>): RunTreeNode[] {
    const children = byParent.get(parentId) ?? [];
    return children
      .filter((r) => !visited.has(r.id))
      .sort((a, b) =>
        (a.startedAt ?? a.updatedAt).localeCompare(b.startedAt ?? b.updatedAt),
      )
      .map((run) => {
        const nextVisited = new Set(visited);
        nextVisited.add(run.id);
        return { run, children: walk(run.id, nextVisited) };
      });
  }

  return walk(rootRunId, new Set([rootRunId]));
}

function isTerminalRunStatus(status: WorkRunListItem["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function buildRuntimeAbortBlockerMessage(
  result: WorkRunStopResponse,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const { runtimeAbort } = result;
  if (runtimeAbort.status === "failed") {
    return runtimeAbort.error
      ? t("workRunStopErrorWithError", { error: runtimeAbort.error })
      : t("workRunStopErrorFallback");
  }
  if (runtimeAbort.status === "not_applicable") {
    return t("workRunStopNotStoppable");
  }
  return t("workRunStopNotStoppableGeneric");
}

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
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const runsQuery = useRunsQuery();
  const tasksQuery = useTasksQuery();
  const graph = useWorkGraphQuery(t("workGraphLoadErrorFallback")).data ?? EMPTY_WORK_GRAPH;
  const [stopBlockerMessage, setStopBlockerMessage] = useState<string | null>(null);

  const allRuns = runsQuery.data?.runs ?? [];
  const allTasks = tasksQuery.data?.tasks ?? [];

  const run = runId ? allRuns.find((r) => r.id === runId) : undefined;
  const parentTask = taskId ? allTasks.find((t) => t.id === taskId) : undefined;

  const stopRunMutation = useMutation({
    mutationFn: async (id: string) =>
      stopWorkRun(id, undefined, {
        fallbackMessage: t("workRunStopError"),
        routeFallback: (statusCode) =>
          t("workRunStopRouteFailed", { statusCode }),
      }),
    onSuccess: async (result: WorkRunStopResponse) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: MISSIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: WORK_GRAPH_QUERY_KEY }),
      ]);
      if (result.status === 'not_stoppable') {
        setStopBlockerMessage(
          result.message ?? buildRuntimeAbortBlockerMessage(result, t),
        );
      } else {
        setStopBlockerMessage(null);
      }
    },
  });

  const handleStopRun = () => {
    if (!run) return;
    if (
      !window.confirm(
        t("workRunStopConfirmation", {
          runTitle: run.title,
        }),
      )
    ) {
      return;
    }
    setStopBlockerMessage(null);
    stopRunMutation.mutate(run.id);
  };

  const stopMutationError = stopRunMutation.error;
  const stopErrorMessage = stopMutationError
    ? stopMutationError instanceof Error
      ? stopMutationError.message
      : t("workRunStopError")
    : null;
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
  const actorTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of graph.objects) {
      if (o.kind === "agent") {
        map.set(o.id, o.title);
      }
    }
    return map;
  }, [graph.objects]);
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
    const isLive = run?.status === "queued" || run?.status === "running";

    const controller = new AbortController();
    let cancelled = false;

    async function loadOnce() {
      try {
        const traces = await fetchTracesByRunId(
          runId!,
          t("workRunTraceLoadFallback"),
          controller.signal,
        );
        if (cancelled) return;
        setTraceState({ status: "ready", traces, error: null });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setTraceState((prev) => ({
          status: "error",
          traces: prev.traces,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }

    setTraceState((prev) => ({
      status: prev.traces.length === 0 ? "loading" : "ready",
      traces: prev.traces,
      error: null,
    }));
    loadOnce();

    if (!isLive) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const interval = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: WORK_GRAPH_QUERY_KEY });
      loadOnce();
    }, 3000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [runId, run?.status, queryClient]);

  if (runsQuery.isPending) {
    return <RunDetailLoading />;
  }
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
            aria-label={t("workRunBackArrowLabel")}
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
            <span>{t("workRunBackLabel")}</span>
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
          {!isTerminalRunStatus(run.status) ? (
            <button
              type="button"
              className="runDetailTopBar__action runDetailTopBar__action--destructive"
              onClick={handleStopRun}
              disabled={stopRunMutation.isPending}
              aria-label={t("workRunStopLabel")}
            >
              {stopRunMutation.isPending
                ? t("workRunStopLabelBusy")
                : t("workRunStopLabel")}
            </button>
          ) : null}
          <span className={`runDetail__statusPill runDetail__statusPill--${run.status}`}>
            {getWorkObjectStatusLabel(run.status, t)}
          </span>
        </div>
      </header>

      <main className="runDetail__main">
        {stopErrorMessage ? (
          <p className="runDetail__error" role="alert">
            {stopErrorMessage}
          </p>
        ) : null}
        {stopBlockerMessage ? (
          <p className="runDetail__warning" role="alert">
            {stopBlockerMessage}
          </p>
        ) : null}
        <section className="runDetail__section">
          <h2 className="runDetail__sectionHeading">{t("workRunSummaryTitle")}</h2>
          <dl className="runDetail__summary">
            <div className="runDetail__summaryRow">
              <dt>{t("workRunStatusLabel")}</dt>
              <dd>{getWorkObjectStatusLabel(run.status, t)}</dd>
            </div>
            <div className="runDetail__summaryRow">
              <dt>{t("workRunUpdatedLabel")}</dt>
              <dd>{formatRelative(run.updatedAt, t)}</dd>
            </div>
            {duration ? (
              <div className="runDetail__summaryRow">
                <dt>{t("workRunDurationLabel")}</dt>
                <dd>{duration}</dd>
              </div>
            ) : null}
            {run.parentRunId ? (
              <div className="runDetail__summaryRow">
                <dt>{t("workRunParentRunLabel")}</dt>
                <dd>
                  {parentTask ? (
                    <Link
                      to={buildWorkRunPath(parentTask.id, run.parentRunId)}
                      className="runDetail__crumbLink"
                    >
                      {run.parentRunTitle ?? run.parentRunId}
                    </Link>
                  ) : (
                    <span title={run.parentRunId}>
                      {run.parentRunTitle ?? <code>{run.parentRunId}</code>}
                    </span>
                  )}
                </dd>
              </div>
            ) : null}
            {run.conversationId ? (
              <div className="runDetail__summaryRow">
                <dt>{t("workRunConversationLabel")}</dt>
                <dd>
                  {run.conversationTitle ?? (
                    <code>{run.conversationId}</code>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          {run.summary ? (
            <p className="runDetail__summaryBody">
              {presentWorkRunSummary(run.summary, t)}
            </p>
          ) : null}
        </section>

        <section className="runDetail__section">
          <h2 className="runDetail__sectionHeading">
            {t("workRunSubRunsTitle", {
              count: `${countTree(subTree)}`,
            })}
          </h2>
          {subTree.length === 0 ? (
            <p className="runDetail__empty">{t("workRunNoSubRuns")}</p>
          ) : (
            <SubRunTree nodes={subTree} taskId={taskId ?? "orphan"} depth={0} t={t} />
          )}
        </section>

        <section className="runDetail__section">
          <h2 className="runDetail__sectionHeading">
            {t("workRunTraceTitle", {
              count: `${traceState.traces.length}`,
            })}
          </h2>
          {traceState.status === "loading" ? (
            <p className="runDetail__empty">{t("workRunTraceLoading")}</p>
          ) : traceState.status === "error" ? (
            <p className="runDetail__error">
              {t("workRunTraceLoadError", { errorMessage: traceState.error })}
            </p>
          ) : traceState.traces.length === 0 ? (
            <p className="runDetail__empty">
              {emptyTraceMessage(run.status, t)}
            </p>
          ) : (
            <ol className="runDetail__trace">
              {traceState.traces
                .slice()
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((trace) => {
                  const actorLabel = trace.actorId
                    ? actorTitleById.get(trace.actorId) ?? trace.actorId
                    : null;
                  return (
                    <li
                      key={trace.id}
                      className={`runDetail__traceRow runDetail__traceRow--${trace.kind}`}
                    >
                      <span className="runDetail__traceKind">
                        {trace.kind}
                      </span>
                      <span
                        className="runDetail__traceActor"
                        title={trace.actorId ?? t("workRunTraceNoActorRecorded")}
                      >
                        {actorLabel ?? "—"}
                      </span>
                      <p className="runDetail__traceMessage">{trace.message}</p>
                      <span className="runDetail__traceTime">
                        {formatRelative(trace.createdAt, t)}
                      </span>
                    </li>
                  );
                })}
            </ol>
          )}
        </section>

        {activities.length > 0 ? (
          <section className="runDetail__section">
            <h2 className="runDetail__sectionHeading">
              {t("workRunActivitiesTitle", {
                count: `${activities.length}`,
              })}
            </h2>
            <ul className="runDetail__simpleList">
              {activities.map((a) => (
                <li key={a.id} className="runDetail__simpleRow">
                  <span className="runDetail__simpleTitle">{a.title}</span>
                  <span className="runDetail__simpleTime">
                    {formatRelative(a.updatedAt, t)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {outcomes.length > 0 ? (
          <section className="runDetail__section">
            <h2 className="runDetail__sectionHeading">
              {t("workRunOutcomesTitle", { count: `${outcomes.length}` })}
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
              {t("workRunArtifactsTitle", { count: `${artifacts.length}` })}
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

function emptyTraceMessage(
  status: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "queued":
      return t("workRunTraceEmptyQueued");
    case "running":
      return t("workRunTraceEmptyRunning");
    case "blocked":
      return t("workRunTraceEmptyBlocked");
    case "completed":
      return t("workRunTraceEmptyCompleted");
    case "failed":
      return t("workRunTraceEmptyFailed");
    case "cancelled":
      return t("workRunTraceEmptyCancelled");
    default:
      return t("workRunTraceEmptyDefault");
  }
}

interface SubRunTreeProps {
  nodes: RunTreeNode[];
  taskId: string;
  depth: number;
  t: ReturnType<typeof useI18n>["t"];
}

function SubRunTree({ nodes, taskId, depth, t }: SubRunTreeProps): JSX.Element {
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
            aria-label={t("workRunOpenSubRunAriaLabel", { runTitle: run.title })}
          >
            <span
              className={`runDetail__subTreeDot runDetail__subTreeDot--${run.status}`}
              aria-hidden="true"
            />
            <span className="runDetail__subTreeTitle">{run.title}</span>
            <span
              className={`runDetail__subTreeStatus runDetail__subTreeStatus--${run.status}`}
            >
              {getWorkObjectStatusLabel(run.status, t)}
            </span>
            <span className="runDetail__subTreeTime">
              {formatRelative(run.updatedAt, t)}
            </span>
          </Link>
          {children.length > 0 ? (
            <SubRunTree nodes={children} taskId={taskId} depth={depth + 1} t={t} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RunDetailLoading(): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="runDetail">
      <header className="channelTopBar runDetailTopBar">
        <div className="channelTopBarStart runDetailTopBar__start">
          <Link to={WORK_TASKS_PATH} className="runDetailTopBar__back">
            <span>{t("workRunBackLabel")}</span>
          </Link>
        </div>
      </header>
      <main className="runDetail__main">
        <p className="runDetail__empty">{t("workRunLoadingLabel")}</p>
      </main>
    </div>
  );
}

function RunNotFound({ runId }: { runId: string | null }): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="runDetail">
      <header className="channelTopBar runDetailTopBar">
        <div className="channelTopBarStart runDetailTopBar__start">
          <Link to={WORK_TASKS_PATH} className="runDetailTopBar__back">
            <span>{t("workRunBackLabel")}</span>
          </Link>
        </div>
      </header>
      <main className="runDetail__main">
        <p className="runDetail__empty">
          {runId ? t("workRunNotFound", { runId }) : t("workRunNoRunId")}
        </p>
      </main>
    </div>
  );
}
