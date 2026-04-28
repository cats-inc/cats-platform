import { useState } from "react";
import { Link } from "react-router-dom";

import {
  buildWorkProjectPath,
  buildWorkTaskPath,
  buildWorkWorkItemPath,
} from "../../workPaths.js";
import { NewLinkDialog } from "./NewLinkDialog";
import {
  endpointKey,
  KIND_LABEL,
  type WorkGraphIndexes,
} from "./shared";
import type {
  WorkGraphLinkEndpointRef,
  WorkGraphLinkView,
  WorkGraphLinkViewKind,
  WorkGraphProjection,
} from "./types";
import "./linkage-section.css";
import "./new-link-dialog.css";

interface LinkageSectionProps {
  selfRef: WorkGraphLinkEndpointRef;
  graph: WorkGraphProjection;
  indexes: WorkGraphIndexes;
}

const VIEW_KIND_LABEL: Record<WorkGraphLinkViewKind, string> = {
  blocks: "Blocking",
  blocked_by: "Blocked by",
  related_to: "Related",
  duplicate_of: "Duplicate of",
  follows: "Follows",
};

const VIEW_KIND_ORDER: WorkGraphLinkViewKind[] = [
  "blocks",
  "blocked_by",
  "related_to",
  "duplicate_of",
  "follows",
];

const EMPTY_COPY_BY_KIND: Record<WorkGraphLinkViewKind, string> = {
  blocks: "Nothing is waiting on this yet.",
  blocked_by: "No upstream blockers.",
  related_to: "No related projects, work items, or tasks linked.",
  duplicate_of: "Not marked as a duplicate of anything.",
  follows: "Doesn't supersede an earlier item.",
};

function detailRouteFor(ref: WorkGraphLinkEndpointRef): string {
  switch (ref.recordFamily) {
    case "project":
      return buildWorkProjectPath(ref.recordId);
    case "work_item":
      return buildWorkWorkItemPath(ref.recordId);
    case "task":
      return buildWorkTaskPath(ref.recordId);
  }
}

export function LinkageSection({
  selfRef,
  graph,
  indexes,
}: LinkageSectionProps): JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);
  const selfKey = endpointKey(selfRef);
  const views = graph.linksByEndpoint[selfKey] ?? [];

  const byKind = new Map<WorkGraphLinkViewKind, WorkGraphLinkView[]>();
  for (const v of views) {
    const list = byKind.get(v.kind) ?? [];
    list.push(v);
    byKind.set(v.kind, list);
  }
  const presentKinds = VIEW_KIND_ORDER.filter((k) => byKind.has(k));

  return (
    <section className="linkageSection">
      <header className="linkageSection__header">
        <h2>Linkage</h2>
        <span className="linkageSection__count">{views.length}</span>
        <button
          type="button"
          className="linkageSection__addBtn"
          onClick={() => setDialogOpen(true)}
        >
          + Add link
        </button>
      </header>
      {views.length === 0 ? (
        <p className="linkageSection__empty">
          No links yet — use <strong>Add link</strong> to connect this to a
          Project, Work Item, or Task.
        </p>
      ) : (
        presentKinds.map((kind) => (
          <LinkageGroup
            key={kind}
            label={VIEW_KIND_LABEL[kind]}
            views={byKind.get(kind) ?? []}
            kind={kind}
            indexes={indexes}
          />
        ))
      )}
      {dialogOpen ? (
        <NewLinkDialog
          selfRef={selfRef}
          graph={graph}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}

interface LinkageGroupProps {
  label: string;
  views: WorkGraphLinkView[];
  kind: WorkGraphLinkViewKind;
  indexes: WorkGraphIndexes;
}

function LinkageGroup({
  label,
  views,
  kind,
  indexes,
}: LinkageGroupProps): JSX.Element {
  if (views.length === 0) {
    return (
      <div className={`linkageSection__group linkageSection__group--${kind}`}>
        <h3 className="linkageSection__groupLabel">{label}</h3>
        <p className="linkageSection__groupEmpty">{EMPTY_COPY_BY_KIND[kind]}</p>
      </div>
    );
  }
  return (
    <div className={`linkageSection__group linkageSection__group--${kind}`}>
      <h3 className="linkageSection__groupLabel">{label}</h3>
      <ul className="linkageSection__list">
        {views.map((view) => {
          const otherKey = endpointKey(view.otherEndpoint);
          const other = indexes.objectsByCoreRef.get(otherKey);
          if (!other) return null;
          return (
            <li key={view.linkId} className="linkageSection__row">
              <span
                className={`projectsList__dot projectsList__dot--small projectsList__dot--${other.status}`}
                aria-hidden="true"
              />
              <Link
                className="linkageSection__title"
                to={detailRouteFor(view.otherEndpoint)}
              >
                {other.title}
              </Link>
              <span className="linkageSection__kindBadge">
                {KIND_LABEL[other.kind]}
              </span>
              {view.note ? (
                <span className="linkageSection__note">{view.note}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
