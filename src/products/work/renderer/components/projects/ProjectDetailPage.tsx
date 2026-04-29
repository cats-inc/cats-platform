import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { LinkageSection } from "../topdown/LinkageSection";
import {
  ATTENTION_LABEL,
  buildIndexes,
  formatRelative,
  KIND_LABEL,
} from "../topdown/shared";
import type { WorkGraphObjectSummary } from "../topdown/types";
import { useProjectsQuery } from "../../state/queries/projectsQuery.js";
import {
  EMPTY_WORK_GRAPH,
  useWorkGraphQuery,
} from "../../state/queries/workGraphQuery.js";
import "./projects.css";

export function ProjectDetailPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const graph = useWorkGraphQuery().data ?? EMPTY_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);
  const projectsQuery = useProjectsQuery();

  const project = projectId
    ? projectsQuery.data?.projects.find((p) => p.id === projectId)
    : undefined;

  if (projectsQuery.isPending) {
    return <ProjectDetailLoading />;
  }
  if (!project) {
    return <ProjectNotFound projectId={projectId ?? null} />;
  }

  const workItems = graph.objects.filter(
    (o) => o.kind === "work_item" && o.linkedProjectId === project.id,
  );
  const tasks = graph.objects.filter(
    (o) => o.kind === "task" && o.linkedProjectId === project.id,
  );
  const activities = graph.objects
    .filter(
      (o) => o.kind === "activity" && o.linkedProjectId === project.id,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="projectDetail">
      <header className="channelTopBar projectDetailTopBar">
        <div className="channelTopBarStart projectDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="projectDetailTopBar__back"
            aria-label="Back to projects"
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
            <span>Projects</span>
          </Link>
        </div>
        <div className="channelTopBarCenter projectDetailTopBar__center">
          <span
            className={`projectsList__dot projectsList__dot--${project.status}`}
            aria-hidden="true"
          />
          <h1 className="channelTopBarTitle projectDetailTopBar__title">
            {project.title}
          </h1>
        </div>
        <div className="channelTopBarEnd projectDetailTopBar__end">
          {project.attention !== "none" && ATTENTION_LABEL[project.attention] ? (
            <span
              className={`projectDetail__attention projectDetail__attention--${project.attention}`}
            >
              {ATTENTION_LABEL[project.attention]}
            </span>
          ) : null}
          <span
            className={`projectsList__statusPill projectsList__statusPill--${project.status}`}
          >
            {project.status.replace(/_/g, " ")}
          </span>
          <span className="projectDetailTopBar__updated">
            updated {formatRelative(project.updatedAt)}
          </span>
          <button
            type="button"
            className="projectDetailTopBar__action"
            onClick={() => undefined}
            aria-label="Project settings"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="2" />
              <path d="M11 7c0 .4-.04.8-.12 1.2l1.36.94-1.4 2.42-1.5-.6c-.6.5-1.3.86-2.1 1.04L7 13.4 4.76 11l-1.5.6-1.4-2.42 1.36-.94A6 6 0 0 1 3 7c0-.4.04-.8.12-1.2L1.76 4.86l1.4-2.42 1.5.6c.6-.5 1.3-.86 2.1-1.04L7 .6 9.24 3l1.5-.6 1.4 2.42-1.36.94c.08.4.12.8.12 1.24z" />
            </svg>
          </button>
        </div>
      </header>
      <main className="projectDetail__main">
        <section className="projectDetail__section projectDetail__overview">
          <header className="projectDetail__sectionHeader">
            <h2>Overview</h2>
          </header>
          <dl className="projectDetail__overviewList">
            {project.summary ? (
              <>
                <dt>Summary</dt>
                <dd>{project.summary}</dd>
              </>
            ) : null}
            <dt>Owner</dt>
            <dd>{project.ownerName}</dd>
            {project.primaryConversationId ? (
              <>
                <dt>Conversation</dt>
                <dd>
                  <span className="projectDetail__convoTitle">
                    {project.primaryConversationTitle ??
                      project.primaryConversationId}
                  </span>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <ItemsSection
          title="Work items"
          items={workItems}
          emptyLabel="No work items in this project yet."
        />

        <ItemsSection
          title="Tasks"
          items={tasks}
          emptyLabel="No tasks in this project yet."
        />

        <LinkageSection
          selfRef={{ recordFamily: "project", recordId: project.id }}
          graph={graph}
          indexes={indexes}
        />

        <section className="projectDetail__section">
          <header className="projectDetail__sectionHeader">
            <h2>Activity</h2>
            <span className="projectDetail__sectionCount">
              {activities.length}
            </span>
          </header>
          {activities.length === 0 ? (
            <p className="projectDetail__empty">
              No activity recorded for this project.
            </p>
          ) : (
            <ul className="projectDetail__activity">
              {activities.map((act) => (
                <li key={act.id} className="projectDetail__activityRow">
                  <span className="projectDetail__activityWhen">
                    {formatRelative(act.updatedAt)}
                  </span>
                  <span className="projectDetail__activityTitle">
                    {act.title}
                  </span>
                  {act.summary ? (
                    <span className="projectDetail__activitySummary">
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
    <section className="projectDetail__section">
      <header className="projectDetail__sectionHeader">
        <h2>{title}</h2>
        <span className="projectDetail__sectionCount">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="projectDetail__empty">{emptyLabel}</p>
      ) : (
        <ul className="projectDetail__items">
          {items.map((item) => (
            <li key={item.id} className="projectDetail__item">
              <span
                className={`projectsList__dot projectsList__dot--small projectsList__dot--${item.status}`}
                aria-hidden="true"
              />
              <span className="projectDetail__itemKind">
                {KIND_LABEL[item.kind]}
              </span>
              <span className="projectDetail__itemTitle">{item.title}</span>
              {item.attention !== "none" && ATTENTION_LABEL[item.attention] ? (
                <span
                  className={`projectDetail__itemAttention projectDetail__itemAttention--${item.attention}`}
                >
                  {ATTENTION_LABEL[item.attention]}
                </span>
              ) : null}
              <span className="projectDetail__itemStatus">
                {item.status.replace(/_/g, " ")}
              </span>
              {item.ownerRole ? (
                <span className="projectDetail__itemOwner">
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

function ProjectDetailLoading(): JSX.Element {
  return (
    <div className="projectDetail">
      <header className="channelTopBar projectDetailTopBar">
        <div className="channelTopBarStart projectDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="projectDetailTopBar__back"
          >
            <span>← Projects</span>
          </Link>
        </div>
      </header>
      <main className="projectDetail__main">
        <p className="projectDetail__empty">Loading project…</p>
      </main>
    </div>
  );
}

function ProjectNotFound({
  projectId,
}: {
  projectId: string | null;
}): JSX.Element {
  return (
    <div className="projectDetail">
      <header className="channelTopBar projectDetailTopBar">
        <div className="channelTopBarStart projectDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="projectDetailTopBar__back"
          >
            <span>← Projects</span>
          </Link>
          <span className="projectDetailTopBar__separator" aria-hidden="true">
            /
          </span>
          <h1 className="channelTopBarTitle projectDetailTopBar__title">
            Not found
          </h1>
        </div>
      </header>
      <main className="projectDetail__main">
        <p className="projectDetail__empty">
          Project <code>{projectId ?? "(missing id)"}</code> is not in the
          current projection.
        </p>
      </main>
    </div>
  );
}
