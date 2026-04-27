import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { MOCK_WORK_GRAPH } from "../topdown/mock";
import {
  ATTENTION_LABEL,
  buildIndexes,
  formatRelative,
  KIND_LABEL,
} from "../topdown/shared";
import type { WorkGraphObjectSummary } from "../topdown/types";
import "./projects-paperclip.css";

export function ProjectDetailPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const graph = MOCK_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);

  const project = projectId ? indexes.objectsById.get(projectId) : undefined;

  if (!project || project.kind !== "project") {
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
  const conversation = project.linkedConversationId
    ? indexes.objectsById.get(project.linkedConversationId)
    : undefined;

  return (
    <div className="paperclipProject">
      <header className="channelTopBar paperclipProjectTopBar">
        <div className="channelTopBarStart paperclipProjectTopBar__start">
          <Link
            to=".."
            relative="path"
            className="paperclipProjectTopBar__back"
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
        <div className="channelTopBarCenter paperclipProjectTopBar__center">
          <span
            className={`paperclipProjects__dot paperclipProjects__dot--${project.status}`}
            aria-hidden="true"
          />
          <h1 className="channelTopBarTitle paperclipProjectTopBar__title">
            {project.title}
          </h1>
        </div>
        <div className="channelTopBarEnd paperclipProjectTopBar__end">
          {project.attention !== "none" && ATTENTION_LABEL[project.attention] ? (
            <span
              className={`paperclipProject__attention paperclipProject__attention--${project.attention}`}
            >
              {ATTENTION_LABEL[project.attention]}
            </span>
          ) : null}
          <span
            className={`paperclipProjects__statusPill paperclipProjects__statusPill--${project.status}`}
          >
            {project.status.replace(/_/g, " ")}
          </span>
          <span className="paperclipProjectTopBar__updated">
            updated {formatRelative(project.updatedAt)}
          </span>
          <button
            type="button"
            className="paperclipProjectTopBar__action"
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
      <main className="paperclipProject__main">
        <section className="paperclipProject__section paperclipProject__overview">
          <header className="paperclipProject__sectionHeader">
            <h2>Overview</h2>
          </header>
          <dl className="paperclipProject__overviewList">
            {project.summary ? (
              <>
                <dt>Summary</dt>
                <dd>{project.summary}</dd>
              </>
            ) : null}
            <dt>Owner role</dt>
            <dd>{project.ownerRole ?? <em>(not assigned)</em>}</dd>
            <dt>Next action</dt>
            <dd>{project.nextAction ?? <em>(none recorded)</em>}</dd>
            {conversation ? (
              <>
                <dt>Conversation</dt>
                <dd>
                  <span className="paperclipProject__convoTitle">
                    {conversation.title}
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

        <section className="paperclipProject__section">
          <header className="paperclipProject__sectionHeader">
            <h2>Activity</h2>
            <span className="paperclipProject__sectionCount">
              {activities.length}
            </span>
          </header>
          {activities.length === 0 ? (
            <p className="paperclipProject__empty">
              No activity recorded for this project.
            </p>
          ) : (
            <ul className="paperclipProject__activity">
              {activities.map((act) => (
                <li key={act.id} className="paperclipProject__activityRow">
                  <span className="paperclipProject__activityWhen">
                    {formatRelative(act.updatedAt)}
                  </span>
                  <span className="paperclipProject__activityTitle">
                    {act.title}
                  </span>
                  {act.summary ? (
                    <span className="paperclipProject__activitySummary">
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
    <section className="paperclipProject__section">
      <header className="paperclipProject__sectionHeader">
        <h2>{title}</h2>
        <span className="paperclipProject__sectionCount">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="paperclipProject__empty">{emptyLabel}</p>
      ) : (
        <ul className="paperclipProject__items">
          {items.map((item) => (
            <li key={item.id} className="paperclipProject__item">
              <span
                className={`paperclipProjects__dot paperclipProjects__dot--small paperclipProjects__dot--${item.status}`}
                aria-hidden="true"
              />
              <span className="paperclipProject__itemKind">
                {KIND_LABEL[item.kind]}
              </span>
              <span className="paperclipProject__itemTitle">{item.title}</span>
              {item.attention !== "none" && ATTENTION_LABEL[item.attention] ? (
                <span
                  className={`paperclipProject__itemAttention paperclipProject__itemAttention--${item.attention}`}
                >
                  {ATTENTION_LABEL[item.attention]}
                </span>
              ) : null}
              <span className="paperclipProject__itemStatus">
                {item.status.replace(/_/g, " ")}
              </span>
              {item.ownerRole ? (
                <span className="paperclipProject__itemOwner">
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

function ProjectNotFound({
  projectId,
}: {
  projectId: string | null;
}): JSX.Element {
  return (
    <div className="paperclipProject">
      <header className="channelTopBar paperclipProjectTopBar">
        <div className="channelTopBarStart paperclipProjectTopBar__start">
          <Link
            to=".."
            relative="path"
            className="paperclipProjectTopBar__back"
          >
            <span>← Projects</span>
          </Link>
          <span className="paperclipProjectTopBar__separator" aria-hidden="true">
            /
          </span>
          <h1 className="channelTopBarTitle paperclipProjectTopBar__title">
            Not found
          </h1>
        </div>
      </header>
      <main className="paperclipProject__main">
        <p className="paperclipProject__empty">
          Project <code>{projectId ?? "(missing id)"}</code> is not in the
          current projection.
        </p>
      </main>
    </div>
  );
}
