import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { getWorkObjectStatusLabel } from "../topdown/WorkObjectCard";
import { formatRelative } from "../topdown/shared";
import { cancelWorkMission } from "../../api/runCancellation.js";
import {
  MISSIONS_QUERY_KEY,
  useMissionsQuery,
} from "../../state/queries/missionsQuery.js";
import { RUNS_QUERY_KEY, useRunsQuery } from "../../state/queries/runsQuery.js";
import { useTasksQuery } from "../../state/queries/tasksQuery.js";
import { useWorkItemsQuery } from "../../state/queries/workItemsQuery.js";
import {
  WORK_MISSIONS_PATH,
  buildWorkRunPath,
  buildWorkTaskPath,
  buildWorkWorkItemPath,
} from "../../workPaths.js";
import "./missions.css";

export function MissionDetailPage(): JSX.Element {
  const { missionId } = useParams<{ missionId: string }>();
  const queryClient = useQueryClient();
  const missionsQuery = useMissionsQuery();
  const workItemsQuery = useWorkItemsQuery();
  const tasksQuery = useTasksQuery();
  const runsQuery = useRunsQuery();
  const { t } = useI18n();
  const [cancelBlockerMessage, setCancelBlockerMessage] = useState<string | null>(null);

  const mission = missionId
    ? missionsQuery.data?.missions.find((m) => m.id === missionId)
    : undefined;

  const cancelMissionMutation = useMutation({
    mutationFn: async (id: string) => cancelWorkMission(id),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MISSIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY }),
      ]);
      if (result.status === "blocked") {
        const detail = result.blockers
          .map((blocker) => `${blocker.runId}: ${blocker.reason}`)
          .join("; ");
        setCancelBlockerMessage(
          result.message
            ?? t("workMissionCancelBlocked", {
              detail: detail || t("workMissionCancelBlockedNoDetails"),
            }),
        );
      } else {
        setCancelBlockerMessage(null);
      }
    },
  });

  const handleCancelMission = () => {
    if (!mission) return;
    if (
      !window.confirm(
        t("workMissionCancelConfirmation", {
          missionTitle: mission.title,
        }),
      )
    ) {
      return;
    }
    setCancelBlockerMessage(null);
    cancelMissionMutation.mutate(mission.id);
  };

  const cancelMutationError = cancelMissionMutation.error;
  const cancelErrorMessage = cancelMutationError
    ? cancelMutationError instanceof Error
      ? cancelMutationError.message
      : t("workMissionCancelError")
    : null;

  const linkedWorkItem = mission?.managedWorkId
    ? workItemsQuery.data?.workItems.find((wi) => wi.id === mission.managedWorkId)
    : undefined;

  const transitiveTasks = useMemo(() => {
    if (!linkedWorkItem) return [];
    const allTasks = tasksQuery.data?.tasks ?? [];
    return allTasks
      .filter((t) => t.workItemId === linkedWorkItem.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [tasksQuery.data, linkedWorkItem]);

  const transitiveRuns = useMemo(() => {
    if (transitiveTasks.length === 0) return [];
    const taskIds = new Set(transitiveTasks.map((t) => t.id));
    const allRuns = runsQuery.data?.runs ?? [];
    return allRuns
      .filter((r) => r.taskId !== null && taskIds.has(r.taskId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [runsQuery.data, transitiveTasks]);

  if (missionsQuery.isPending) {
    return <MissionDetailLoading />;
  }
  if (!mission) {
    return <MissionNotFound missionId={missionId ?? null} />;
  }

  const isTerminal =
    mission.status === "completed"
    || mission.status === "failed"
    || mission.status === "cancelled";

  return (
    <div className="missionDetail">
      <header className="channelTopBar missionDetailTopBar">
        <div className="channelTopBarStart missionDetailTopBar__start">
          <Link
            to={WORK_MISSIONS_PATH}
            className="missionDetailTopBar__back"
            aria-label={t("workMissionBackArrowLabel")}
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
            <span>{t("workMissionBackLabel")}</span>
          </Link>
          <span className="missionDetailTopBar__sep">›</span>
          <h1 className="channelTopBarTitle missionDetailTopBar__title">
            {mission.title}
          </h1>
        </div>
        <div className="channelTopBarCenter missionDetailTopBar__center" />
        <div className="channelTopBarEnd missionDetailTopBar__end">
          {!isTerminal ? (
            <button
              type="button"
              className="missionDetailTopBar__action missionDetailTopBar__action--destructive"
              onClick={handleCancelMission}
              disabled={cancelMissionMutation.isPending}
              aria-label={t("workMissionCancelLabel")}
            >
              {cancelMissionMutation.isPending
                ? t("workMissionCancelLabelBusy")
                : t("workMissionCancelLabel")}
            </button>
          ) : null}
          <span
            className={`missionDetail__statusPill missionDetail__statusPill--${mission.status}`}
          >
            {getWorkObjectStatusLabel(mission.status, t)}
          </span>
        </div>
      </header>

      <main className="missionDetail__main">
        {cancelErrorMessage ? (
          <p className="missionDetail__error" role="alert">
            {cancelErrorMessage}
          </p>
        ) : null}
        {cancelBlockerMessage ? (
          <p className="missionDetail__warning" role="alert">
            {cancelBlockerMessage}
          </p>
        ) : null}
        <section className="missionDetail__section">
          <h2 className="missionDetail__sectionHeading">
            {t("workMissionSummaryTitle")}
          </h2>
          <dl className="missionDetail__summary">
            <div className="missionDetail__summaryRow">
              <dt>{t("workMissionStatusLabel")}</dt>
              <dd>{getWorkObjectStatusLabel(mission.status, t)}</dd>
            </div>
            {mission.assignedAgentName ? (
              <div className="missionDetail__summaryRow">
                <dt>{t("workMissionAssignedAgentLabel")}</dt>
                <dd>{mission.assignedAgentName}</dd>
              </div>
            ) : null}
            <div className="missionDetail__summaryRow">
              <dt>{t("workMissionUpdatedAtLabel")}</dt>
              <dd>{formatRelative(mission.updatedAt, t)}</dd>
            </div>
            {linkedWorkItem ? (
              <div className="missionDetail__summaryRow">
                <dt>{t("workMissionWorkItemLabel")}</dt>
                <dd>
                  <Link
                    to={buildWorkWorkItemPath(linkedWorkItem.id)}
                    className="missionDetail__crumbLink"
                  >
                    {linkedWorkItem.title}
                  </Link>
                </dd>
              </div>
            ) : null}
            {mission.conversationId ? (
              <div className="missionDetail__summaryRow">
                <dt>{t("workMissionConversationLabel")}</dt>
                <dd>
                  {mission.conversationTitle ?? (
                    <code className="missionDetail__monoId">
                      {mission.conversationId}
                    </code>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          {mission.summary ? (
            <p className="missionDetail__summaryBody">{mission.summary}</p>
          ) : null}
        </section>

        <section className="missionDetail__section">
          <h2 className="missionDetail__sectionHeading">
            {t("workMissionTasksHeading", {
              count: `${transitiveTasks.length}`,
            })}
          </h2>
          {!linkedWorkItem ? (
            <p className="missionDetail__empty">
              {t("workMissionNoLinkedWorkItemForTasks")}
            </p>
          ) : transitiveTasks.length === 0 ? (
            <p className="missionDetail__empty">
              {t("workMissionNoTasks")}
            </p>
          ) : (
            <ul className="missionDetail__transitiveList">
              {transitiveTasks.map((task) => (
                <li key={task.id} className="missionDetail__transitiveRow">
                  <Link
                    to={buildWorkTaskPath(task.id)}
                    className="missionDetail__transitiveLink"
                  >
                    <span className="missionDetail__transitiveTitle">
                      {task.title}
                    </span>
                    <span
                      className={`missionDetail__transitiveStatus missionDetail__transitiveStatus--${task.status}`}
                    >
                      {getWorkObjectStatusLabel(task.status, t)}
                    </span>
                    <span className="missionDetail__transitiveTime">
                      {formatRelative(task.updatedAt, t)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="missionDetail__section">
          <h2 className="missionDetail__sectionHeading">
            {t("workMissionRunsHeading", {
              count: `${transitiveRuns.length}`,
            })}
          </h2>
          {!linkedWorkItem ? (
            <p className="missionDetail__empty">
              {t("workMissionNoLinkedWorkItemForRuns")}
            </p>
          ) : transitiveRuns.length === 0 ? (
            <p className="missionDetail__empty">
              {t("workMissionNoTransitiveRuns")}
            </p>
          ) : (
            <ul className="missionDetail__transitiveList">
              {transitiveRuns.map((run) => (
                <li key={run.id} className="missionDetail__transitiveRow">
                  <Link
                    to={buildWorkRunPath(run.taskId ?? "orphan", run.id)}
                    className="missionDetail__transitiveLink"
                  >
                    <span className="missionDetail__transitiveTitle">
                      {run.title}
                    </span>
                    {run.taskTitle ? (
                      <span className="missionDetail__transitiveParent">
                        ↳ {run.taskTitle}
                      </span>
                    ) : null}
                    <span
                      className={`missionDetail__transitiveStatus missionDetail__transitiveStatus--${run.status}`}
                    >
                      {getWorkObjectStatusLabel(run.status, t)}
                    </span>
                    <span className="missionDetail__transitiveTime">
                      {formatRelative(run.updatedAt, t)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function MissionDetailLoading(): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="missionDetail">
      <header className="channelTopBar missionDetailTopBar">
        <div className="channelTopBarStart missionDetailTopBar__start">
          <Link
            to={WORK_MISSIONS_PATH}
            className="missionDetailTopBar__back"
          >
            <span>{t("workMissionBackLabel")}</span>
          </Link>
        </div>
      </header>
      <main className="missionDetail__main">
        <p className="missionDetail__empty">{t("workMissionLoadingLabel")}</p>
      </main>
    </div>
  );
}

function MissionNotFound({
  missionId,
}: {
  missionId: string | null;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="missionDetail">
      <header className="channelTopBar missionDetailTopBar">
        <div className="channelTopBarStart missionDetailTopBar__start">
          <Link
            to={WORK_MISSIONS_PATH}
            className="missionDetailTopBar__back"
          >
            <span>{t("workMissionBackLabel")}</span>
          </Link>
        </div>
      </header>
      <main className="missionDetail__main">
        <p className="missionDetail__empty">
          {missionId
            ? t("workMissionNotFound", {
                missionId,
              })
            : t("workMissionNoMissionId")}
        </p>
      </main>
    </div>
  );
}
