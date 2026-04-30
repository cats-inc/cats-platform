import { useState } from "react";
import { Link } from "react-router-dom";

import type { MessageKey } from "../../../../../shared/i18n/index.js";
import {
  buildWorkProjectPath,
  buildWorkTaskPath,
  buildWorkWorkItemPath,
} from "../../workPaths.js";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { NewLinkDialog } from "./NewLinkDialog";
import {
  endpointKey,
  getWorkGraphKindLabel,
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

const VIEW_KIND_LABEL_KEY: Record<WorkGraphLinkViewKind, MessageKey> = {
  blocks: "workTopdownLinkageViewKindBlocksLabel",
  blocked_by: "workTopdownLinkageViewKindBlockedByLabel",
  related_to: "workTopdownLinkageViewKindRelatedToLabel",
  duplicate_of: "workTopdownLinkageViewKindDuplicateOfLabel",
  follows: "workTopdownLinkageViewKindFollowsLabel",
};

const VIEW_KIND_ORDER: WorkGraphLinkViewKind[] = [
  "blocks",
  "blocked_by",
  "related_to",
  "duplicate_of",
  "follows",
];

const EMPTY_COPY_BY_KIND_KEY: Record<
  WorkGraphLinkViewKind,
  MessageKey
> = {
  blocks: "workTopdownLinkageViewKindBlocksEmpty",
  blocked_by: "workTopdownLinkageViewKindBlockedByEmpty",
  related_to: "workTopdownLinkageViewKindRelatedToEmpty",
  duplicate_of: "workTopdownLinkageViewKindDuplicateOfEmpty",
  follows: "workTopdownLinkageViewKindFollowsEmpty",
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
  const { t } = useI18n();
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
        <h2>{t("workTopdownLinkageTitle")}</h2>
        <span className="linkageSection__count">{views.length}</span>
        <button
          type="button"
          className="linkageSection__addBtn"
          onClick={() => setDialogOpen(true)}
        >
          + {t("workTopdownLinkageAddAction")}
        </button>
      </header>
      {views.length === 0 ? (
        <p className="linkageSection__empty">
          {t("workTopdownLinkageNoLinksYetPrefix")}{" "}
          <strong>{t("workTopdownLinkageAddAction")}</strong>{" "}
          {t("workTopdownLinkageNoLinksYetSuffix")}
        </p>
      ) : (
        presentKinds.map((kind) => (
          <LinkageGroup
            key={kind}
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
  views: WorkGraphLinkView[];
  kind: WorkGraphLinkViewKind;
  indexes: WorkGraphIndexes;
}

function LinkageGroup({
  views,
  kind,
  indexes,
}: LinkageGroupProps): JSX.Element {
  const { t } = useI18n();
  if (views.length === 0) {
    return (
      <div className={`linkageSection__group linkageSection__group--${kind}`}>
        <h3 className="linkageSection__groupLabel">
          {t(VIEW_KIND_LABEL_KEY[kind])}
        </h3>
        <p className="linkageSection__groupEmpty">
          {t(EMPTY_COPY_BY_KIND_KEY[kind])}
        </p>
      </div>
    );
  }
  return (
    <div className={`linkageSection__group linkageSection__group--${kind}`}>
      <h3 className="linkageSection__groupLabel">{t(VIEW_KIND_LABEL_KEY[kind])}</h3>
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
                {getWorkGraphKindLabel(other.kind, t)}
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
