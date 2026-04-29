import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { LinkageSection } from "../topdown/LinkageSection";
import {
  ATTENTION_LABEL,
  buildIndexes,
  formatRelative,
  KIND_LABEL,
} from "../topdown/shared";
import type { WorkGraphObjectSummary } from "../topdown/types";
import { removeWorkItem } from "../../api/workRecords.js";
import { useMissionsQuery, type WorkMissionListItem } from "../../state/queries/missionsQuery.js";
import { useProjectsQuery } from "../../state/queries/projectsQuery.js";
import {
  WORK_ITEMS_QUERY_KEY,
  useWorkItemsQuery,
} from "../../state/queries/workItemsQuery.js";
import {
  EMPTY_WORK_GRAPH,
  useWorkGraphQuery,
} from "../../state/queries/workGraphQuery.js";
import {
  WORK_PROJECTS_PATH,
  WORK_WORK_ITEMS_PATH,
  buildWorkMissionPath,
  buildWorkWorkItemPath,
} from "../../workPaths.js";
import "./work-items.css";

export function WorkItemDetailPage(): JSX.Element {
  const { workItemId } = useParams<{ workItemId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const graph = useWorkGraphQuery().data ?? EMPTY_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);
  const workItemsQuery = useWorkItemsQuery();
  const projectsQuery = useProjectsQuery();
  const missionsQuery = useMissionsQuery();

  const allWorkItems = workItemsQuery.data?.workItems ?? [];
  const workItem = workItemId
    ? allWorkItems.find((wi) => wi.id === workItemId)
    : undefined;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await removeWorkItem(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORK_ITEMS_QUERY_KEY });
      navigate(WORK_WORK_ITEMS_PATH);
    },
  });

  const handleDelete = () => {
    if (!workItem) return;
    if (
      !window.confirm(
        `Delete work item "${workItem.title}"?\n\nThis cannot be undone. Linked tasks, runs, and missions are not removed.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(workItem.id);
  };

  if (workItemsQuery.isPending) {
    return <WorkItemDetailLoading />;
  }
  if (!workItem) {
    return <WorkItemNotFound workItemId={workItemId ?? null} />;
  }

  const deleteError = deleteMutation.error
    ? deleteMutation.error instanceof Error
      ? deleteMutation.error.message
      : "Failed to delete work item."
    : null;

  const linkedProject = workItem.projectId
    ? projectsQuery.data?.projects.find((p) => p.id === workItem.projectId)
    : undefined;
  const parentWorkItem = workItem.parentWorkItemId
    ? allWorkItems.find((wi) => wi.id === workItem.parentWorkItemId)
    : undefined;
  const subWorkItems = allWorkItems.filter(
    (wi) => wi.parentWorkItemId === workItem.id,
  );
  const tasks = graph.objects.filter(
    (o) => o.kind === "task" && o.linkedWorkItemId === workItem.id,
  );
  const activities = graph.objects
    .filter(
      (o) => o.kind === "activity" && o.linkedWorkItemId === workItem.id,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const linkedMissions = (missionsQuery.data?.missions ?? []).filter(
    (m) => m.managedWorkId === workItem.id,
  );

  return (
    <div className="workItemDetail">
      <header className="channelTopBar workItemDetailTopBar">
        <div className="channelTopBarStart workItemDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="workItemDetailTopBar__back"
            aria-label="Back to work items"
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
            <span>Work items</span>
          </Link>
        </div>
        <div className="channelTopBarCenter workItemDetailTopBar__center">
          <span
            className={`projectsList__dot projectsList__dot--${workItem.status}`}
            aria-hidden="true"
          />
          <h1 className="channelTopBarTitle workItemDetailTopBar__title">
            {workItem.title}
          </h1>
        </div>
        <div className="channelTopBarEnd workItemDetailTopBar__end">
          {workItem.attention !== "none" && ATTENTION_LABEL[workItem.attention] ? (
            <span
              className={`workItemDetail__attention workItemDetail__attention--${workItem.attention}`}
            >
              {ATTENTION_LABEL[workItem.attention]}
            </span>
          ) : null}
          <span
            className={`workItemsList__statusPill workItemsList__statusPill--${workItem.status}`}
          >
            {workItem.status.replace(/_/g, " ")}
          </span>
          <span className="workItemDetailTopBar__updated">
            updated {formatRelative(workItem.updatedAt)}
          </span>
          <button
            type="button"
            className="workItemDetailTopBar__action workItemDetailTopBar__action--destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            aria-label="Delete work item"
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </header>
      <main className="workItemDetail__main">
        {deleteError ? (
          <p className="workItemDetail__error" role="alert">
            {deleteError}
          </p>
        ) : null}
        <section className="workItemDetail__section workItemDetail__overview">
          <header className="workItemDetail__sectionHeader">
            <h2>Overview</h2>
          </header>
          <dl className="workItemDetail__overviewList">
            {workItem.summary ? (
              <>
                <dt>Summary</dt>
                <dd>{workItem.summary}</dd>
              </>
            ) : null}
            <dt>Project</dt>
            <dd>
              {linkedProject ? (
                <Link
                  className="workItemDetail__projectLink"
                  to={`${WORK_PROJECTS_PATH}/${linkedProject.id}`}
                >
                  {linkedProject.title}
                </Link>
              ) : (
                <em>(orphan — no project linked)</em>
              )}
            </dd>
            {parentWorkItem ? (
              <>
                <dt>Parent work item</dt>
                <dd>
                  <Link
                    className="workItemDetail__projectLink"
                    to={buildWorkWorkItemPath(parentWorkItem.id)}
                  >
                    {parentWorkItem.title}
                  </Link>
                </dd>
              </>
            ) : null}
            <dt>Owner</dt>
            <dd>{workItem.ownerName}</dd>
            {workItem.conversationId ? (
              <>
                <dt>Conversation</dt>
                <dd>
                  <span className="workItemDetail__convoTitle">
                    {workItem.conversationTitle ??
                      workItem.conversationId}
                  </span>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <SubWorkItemsSection items={subWorkItems} />

        <ItemsSection
          title="Tasks"
          items={tasks}
          emptyLabel="No tasks under this work item yet."
        />

        <MissionsSection missions={linkedMissions} />

        <LinkageSection
          selfRef={{ recordFamily: "work_item", recordId: workItem.id }}
          graph={graph}
          indexes={indexes}
        />

        <section className="workItemDetail__section">
          <header className="workItemDetail__sectionHeader">
            <h2>Activity</h2>
            <span className="workItemDetail__sectionCount">
              {activities.length}
            </span>
          </header>
          {activities.length === 0 ? (
            <p className="workItemDetail__empty">
              No activity recorded for this work item.
            </p>
          ) : (
            <ul className="workItemDetail__activity">
              {activities.map((act) => (
                <li key={act.id} className="workItemDetail__activityRow">
                  <span className="workItemDetail__activityWhen">
                    {formatRelative(act.updatedAt)}
                  </span>
                  <span className="workItemDetail__activityTitle">
                    {act.title}
                  </span>
                  {act.summary ? (
                    <span className="workItemDetail__activitySummary">
                      {act.summary}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

interface ItemsSectionProps {
  title: string;
  items: WorkGraphObjectSummary[];
  emptyLabel: string;
}

function ItemsSection({
  title,
  items,
  emptyLabel,
}: ItemsSectionProps): JSX.Element {
  return (
    <section className="workItemDetail__section">
      <header className="workItemDetail__sectionHeader">
        <h2>{title}</h2>
        <span className="workItemDetail__sectionCount">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="workItemDetail__empty">{emptyLabel}</p>
      ) : (
        <ul className="workItemDetail__items">
          {items.map((item) => (
            <li key={item.id} className="workItemDetail__item">
              <span
                className={`projectsList__dot projectsList__dot--small projectsList__dot--${item.status}`}
                aria-hidden="true"
              />
              <span className="workItemDetail__itemKind">
                {KIND_LABEL[item.kind]}
              </span>
              <span className="workItemDetail__itemTitle">{item.title}</span>
              {item.attention !== "none" && ATTENTION_LABEL[item.attention] ? (
                <span
                  className={`workItemDetail__itemAttention workItemDetail__itemAttention--${item.attention}`}
                >
                  {ATTENTION_LABEL[item.attention]}
                </span>
              ) : null}
              <span className="workItemDetail__itemStatus">
                {item.status.replace(/_/g, " ")}
              </span>
              {item.ownerRole ? (
                <span className="workItemDetail__itemOwner">
                  {item.ownerRole}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface SubWorkItemsSectionProps {
  items: ReadonlyArray<{
    id: string;
    title: string;
    status: string;
    updatedAt: string;
  }>;
}

function SubWorkItemsSection({
  items,
}: SubWorkItemsSectionProps): JSX.Element {
  return (
    <section className="workItemDetail__section">
      <header className="workItemDetail__sectionHeader">
        <h2>Sub-work-items</h2>
        <span className="workItemDetail__sectionCount">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="workItemDetail__empty">
          No sub-work-items.
        </p>
      ) : (
        <ul className="workItemDetail__items">
          {items.map((item) => (
            <li key={item.id} className="workItemDetail__item">
              <span
                className={`projectsList__dot projectsList__dot--small projectsList__dot--${item.status}`}
                aria-hidden="true"
              />
              <Link
                to={buildWorkWorkItemPath(item.id)}
                className="workItemDetail__itemTitle"
              >
                {item.title}
              </Link>
              <span className="workItemDetail__itemStatus">
                {item.status.replace(/_/g, " ")}
              </span>
              <span className="workItemDetail__itemOwner">
                {formatRelative(item.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface MissionsSectionProps {
  missions: readonly WorkMissionListItem[];
}

function MissionsSection({ missions }: MissionsSectionProps): JSX.Element {
  return (
    <section className="workItemDetail__section">
      <header className="workItemDetail__sectionHeader">
        <h2>Missions</h2>
        <span className="workItemDetail__sectionCount">{missions.length}</span>
      </header>
      {missions.length === 0 ? (
        <p className="workItemDetail__empty">
          No missions for this work item.
        </p>
      ) : (
        <ul className="workItemDetail__items">
          {missions.map((mission) => (
            <li key={mission.id} className="workItemDetail__item">
              <Link
                to={buildWorkMissionPath(mission.id)}
                className="workItemDetail__itemTitle"
              >
                {mission.title}
              </Link>
              <span className="workItemDetail__itemStatus">
                {mission.status.replace(/_/g, " ")}
              </span>
              <span className="workItemDetail__itemOwner">
                {formatRelative(mission.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkItemDetailLoading(): JSX.Element {
  return (
    <div className="workItemDetail">
      <header className="channelTopBar workItemDetailTopBar">
        <div className="channelTopBarStart workItemDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="workItemDetailTopBar__back"
          >
            <span>← Work items</span>
          </Link>
        </div>
      </header>
      <main className="workItemDetail__main">
        <p className="workItemDetail__empty">Loading work item…</p>
      </main>
    </div>
  );
}

function WorkItemNotFound({
  workItemId,
}: {
  workItemId: string | null;
}): JSX.Element {
  return (
    <div className="workItemDetail">
      <header className="channelTopBar workItemDetailTopBar">
        <div className="channelTopBarStart workItemDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="workItemDetailTopBar__back"
          >
            <span>← Work items</span>
          </Link>
          <span className="workItemDetailTopBar__separator" aria-hidden="true">
            /
          </span>
          <h1 className="channelTopBarTitle workItemDetailTopBar__title">
            Not found
          </h1>
        </div>
      </header>
      <main className="workItemDetail__main">
        <p className="workItemDetail__empty">
          Work item <code>{workItemId ?? "(missing id)"}</code> is not in the
          current projection.
        </p>
      </main>
    </div>
  );
}
