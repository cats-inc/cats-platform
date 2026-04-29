import { useState } from "react";
import { Link } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { useWorkItemsQuery } from "../../state/queries/workItemsQuery.js";
import { NewWorkItemDialog } from "./NewWorkItemDialog";
import "./work-items.css";

export function WorkItemsListPage(): JSX.Element {
  const workItemsQuery = useWorkItemsQuery();
  const workItems = workItemsQuery.data?.workItems ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="workItemsList">
      <header className="channelTopBar workItemsListTopBar">
        <div className="channelTopBarStart workItemsListTopBar__start">
          <h1 className="channelTopBarTitle workItemsListTopBar__title">
            Work items
          </h1>
          <span className="workItemsListTopBar__count">
            {workItems.length}
          </span>
        </div>
        <div className="channelTopBarCenter workItemsListTopBar__center" />
        <div className="channelTopBarEnd workItemsListTopBar__end">
          <button
            type="button"
            className="workItemsListTopBar__addBtn"
            onClick={() => setDialogOpen(true)}
            aria-label="Create new work item"
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
              <path d="M7 2v10" />
              <path d="M2 7h10" />
            </svg>
            <span>New work item</span>
          </button>
        </div>
      </header>
      <main className="workItemsList__main">
        {workItemsQuery.isPending ? (
          <p className="workItemsList__empty">Loading work items…</p>
        ) : workItemsQuery.isError ? (
          <p className="workItemsList__empty">
            Failed to load work items: {String((workItemsQuery.error as Error).message)}
          </p>
        ) : workItems.length === 0 ? (
          <p className="workItemsList__empty">
            No work items yet. Click <strong>New work item</strong> to create one.
          </p>
        ) : (
          <ul className="workItemsList__list">
            {workItems.map((wi) => (
              <li key={wi.id} className="workItemsList__row">
                <Link
                  to={wi.id}
                  className="workItemsList__rowLink"
                  aria-label={`Open work item ${wi.title}`}
                >
                  <div className="workItemsList__rowMain">
                    <span
                      className={`projectsList__dot projectsList__dot--${wi.status}`}
                      aria-hidden="true"
                    />
                    <div className="workItemsList__rowText">
                      <span className="workItemsList__rowTitle">
                        {wi.title}
                      </span>
                      {wi.summary ? (
                        <span className="workItemsList__rowSummary">
                          {wi.summary}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="workItemsList__rowMeta">
                    {wi.projectTitle ? (
                      <span className="workItemsList__projectChip">
                        in {wi.projectTitle}
                      </span>
                    ) : (
                      <span className="workItemsList__projectChip workItemsList__projectChip--orphan">
                        orphan
                      </span>
                    )}
                    {wi.parentWorkItemTitle ? (
                      <span
                        className="workItemsList__projectChip workItemsList__projectChip--parent"
                        title={`Parent work item: ${wi.parentWorkItemTitle}`}
                      >
                        ↳ {wi.parentWorkItemTitle}
                      </span>
                    ) : null}
                    {wi.attention === "decision_needed" ? (
                      <span className="workItemsList__pip workItemsList__pip--decision">
                        decision
                      </span>
                    ) : null}
                    {wi.attention === "blocked" || wi.attention === "failed" ? (
                      <span className="workItemsList__pip workItemsList__pip--blocked">
                        blocked
                      </span>
                    ) : null}
                    <span className="workItemsList__metric">
                      <strong>{wi.linkedTaskCount}</strong> tasks
                    </span>
                    <span className="workItemsList__metric workItemsList__metric--muted">
                      {formatRelative(wi.updatedAt)}
                    </span>
                    <span
                      className={`workItemsList__statusPill workItemsList__statusPill--${wi.status}`}
                    >
                      {wi.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      {dialogOpen ? (
        <NewWorkItemDialog onClose={() => setDialogOpen(false)} />
      ) : null}
    </div>
  );
}
