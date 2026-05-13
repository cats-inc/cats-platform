import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { LinkageSection } from "../topdown/LinkageSection";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import {
  buildIndexes,
  formatWorkExternalBindingLabel,
  formatRelative,
  getWorkActorRoleLabel,
  getWorkGraphAttentionLabel,
  getWorkGraphKindLabel,
} from "../topdown/shared";
import { getWorkObjectStatusLabel } from "../topdown/WorkObjectCard";
import type {
  WorkGraphExternalBindingSummary,
  WorkGraphObjectSummary,
} from "../topdown/types";
import {
  removeWorkItem,
  unlinkWorkExternalIssue,
} from "../../api/workRecords.js";
import { useMissionsQuery, type WorkMissionListItem } from "../../state/queries/missionsQuery.js";
import { useProjectsQuery } from "../../state/queries/projectsQuery.js";
import {
  WORK_ITEMS_QUERY_KEY,
  useWorkItemsQuery,
} from "../../state/queries/workItemsQuery.js";
import {
  EMPTY_WORK_GRAPH,
  WORK_GRAPH_QUERY_KEY,
  useWorkGraphQuery,
} from "../../state/queries/workGraphQuery.js";
import {
  WORK_PROJECTS_PATH,
  WORK_WORK_ITEMS_PATH,
  buildWorkMissionPath,
  buildWorkWorkItemPath,
} from "../../workPaths.js";
import { formatWorkCrudMutationError } from "../workCrudErrorLabels.js";
import { WorkItemExternalBindingDialog } from "./WorkItemExternalBindingDialog";
import { WorkItemExternalBindingsSection } from "./WorkItemExternalBindingsSection";
import "./work-items.css";

export function WorkItemDetailPage(): JSX.Element {
  const { workItemId } = useParams<{ workItemId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [externalLinkDialogOpen, setExternalLinkDialogOpen] = useState(false);
  const workItemsQuery = useWorkItemsQuery();
  const projectsQuery = useProjectsQuery();
  const missionsQuery = useMissionsQuery();
  const { t } = useI18n();
  const graph = useWorkGraphQuery(t("workGraphLoadErrorFallback")).data ?? EMPTY_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);

  const allWorkItems = workItemsQuery.data?.workItems ?? [];
  const workItem = workItemId
    ? allWorkItems.find((wi) => wi.id === workItemId)
    : undefined;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await removeWorkItem(id, t("workItemDeleteError"));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORK_ITEMS_QUERY_KEY });
      navigate(WORK_WORK_ITEMS_PATH);
    },
  });
  const unlinkExternalMutation = useMutation({
    mutationFn: async (input: {
      binding: WorkGraphExternalBindingSummary;
      workItemId: string;
    }) => {
      await unlinkWorkExternalIssue(
        {
          localKind: "work_item",
          localId: input.workItemId,
          provider: input.binding.provider,
          externalType: input.binding.externalType,
          externalId: input.binding.externalId,
        },
        t("workExternalUnlinkError"),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORK_ITEMS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: WORK_GRAPH_QUERY_KEY }),
      ]);
    },
  });

  const handleDelete = () => {
    if (!workItem) return;
    if (
      !window.confirm(
        t("workItemDeleteConfirmation", { title: workItem.title }),
      )
    ) {
      return;
    }
    deleteMutation.mutate(workItem.id);
  };

  const handleUnlinkExternalBinding = (binding: WorkGraphExternalBindingSummary) => {
    if (!workItem) return;
    const label = formatWorkExternalBindingLabel(binding);
    if (!window.confirm(t("workExternalUnlinkConfirmation", { label }))) {
      return;
    }
    unlinkExternalMutation.mutate({ binding, workItemId: workItem.id });
  };

  if (workItemsQuery.isPending) {
    return <WorkItemDetailLoading />;
  }
  if (!workItem) {
    return <WorkItemNotFound workItemId={workItemId ?? null} />;
  }

  const deleteError = deleteMutation.error
    ? formatWorkCrudMutationError(
      deleteMutation.error,
      t("workItemDeleteError"),
      t,
    )
    : null;
  const externalUnlinkError = unlinkExternalMutation.error
    ? formatWorkCrudMutationError(
      unlinkExternalMutation.error,
      t("workExternalUnlinkError"),
      t,
    )
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
  const workItemGraphObject = graph.objects.find(
    (object) =>
      object.kind === "work_item" &&
      object.sourceRecordId === workItem.id,
  );
  const externalBindings = workItemGraphObject?.externalBindings ?? [];
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
            aria-label={t("workItemBackLabel")}
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
            <span>{t("workItemBackArrowLabel")}</span>
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
          {workItem.attention !== "none" ? (
            <span
              className={`workItemDetail__attention workItemDetail__attention--${workItem.attention}`}
            >
              {getWorkGraphAttentionLabel(workItem.attention, t)}
            </span>
          ) : null}
          <span
            className={`workItemsList__statusPill workItemsList__statusPill--${workItem.status}`}
          >
            {getWorkObjectStatusLabel(workItem.status, t)}
          </span>
          <span className="workItemDetailTopBar__updated">
            {t("workItemUpdatedAtPrefix", {
              updatedAt: formatRelative(workItem.updatedAt, t),
            })}
          </span>
          <button
            type="button"
            className="workItemDetailTopBar__action workItemDetailTopBar__action--destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            aria-label={t("workItemDeleteLabel")}
          >
            {deleteMutation.isPending
              ? t("workItemDeleteLabelBusy")
              : t("workItemDeleteLabel")}
          </button>
        </div>
      </header>
      <main className="workItemDetail__main">
        {deleteError ? (
          <p className="workItemDetail__error" role="alert">
            {deleteError}
          </p>
        ) : null}
        {externalUnlinkError ? (
          <p className="workItemDetail__error" role="alert">
            {externalUnlinkError}
          </p>
        ) : null}
        <section className="workItemDetail__section workItemDetail__overview">
          <header className="workItemDetail__sectionHeader">
            <h2>{t("workItemOverviewTitle")}</h2>
          </header>
          <dl className="workItemDetail__overviewList">
            {workItem.summary ? (
              <>
                <dt>{t("workItemSummaryLabel")}</dt>
                <dd>{workItem.summary}</dd>
              </>
            ) : null}
            <dt>{t("workItemProjectLabel")}</dt>
            <dd>
              {linkedProject ? (
                <Link
                  className="workItemDetail__projectLink"
                  to={`${WORK_PROJECTS_PATH}/${linkedProject.id}`}
                >
                  {linkedProject.title}
                </Link>
              ) : (
                <em>{t("workItemOrphanSummaryFallback")}</em>
              )}
            </dd>
            {parentWorkItem ? (
              <>
                <dt>{t("workItemParentLabel")}</dt>
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
            <dt>{t("workItemOwnerLabel")}</dt>
            <dd>{workItem.ownerName}</dd>
            {workItem.conversationId ? (
              <>
                <dt>{t("workItemConversationLabel")}</dt>
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

        <WorkItemExternalBindingsSection
          bindings={externalBindings}
          onAddClick={() => setExternalLinkDialogOpen(true)}
          onRemoveBinding={handleUnlinkExternalBinding}
          removeDisabled={unlinkExternalMutation.isPending}
        />

        <ItemsSection
          title={t("workItemTasksTitle")}
          items={tasks}
          emptyLabel={t("workItemNoTasksLabel")}
        />

        <MissionsSection missions={linkedMissions} />

        <LinkageSection
          selfRef={{ recordFamily: "work_item", recordId: workItem.id }}
          graph={graph}
          indexes={indexes}
        />

        <section className="workItemDetail__section">
          <header className="workItemDetail__sectionHeader">
            <h2>{t("workItemActivityTitle")}</h2>
            <span className="workItemDetail__sectionCount">
              {activities.length}
            </span>
          </header>
          {activities.length === 0 ? (
            <p className="workItemDetail__empty">
              {t("workItemNoActivity")}
            </p>
          ) : (
            <ul className="workItemDetail__activity">
              {activities.map((act) => (
                <li key={act.id} className="workItemDetail__activityRow">
                  <span className="workItemDetail__activityWhen">
                    {formatRelative(act.updatedAt, t)}
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
      {externalLinkDialogOpen ? (
        <WorkItemExternalBindingDialog
          workItemId={workItem.id}
          onClose={() => setExternalLinkDialogOpen(false)}
        />
      ) : null}
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
  const { t } = useI18n();

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
                {getWorkGraphKindLabel(item.kind, t)}
              </span>
              <span className="workItemDetail__itemTitle">{item.title}</span>
              {item.attention !== "none" ? (
                <span
                  className={`workItemDetail__itemAttention workItemDetail__itemAttention--${item.attention}`}
                >
                  {getWorkGraphAttentionLabel(item.attention, t)}
                </span>
              ) : null}
              <span className="workItemDetail__itemStatus">
                {getWorkObjectStatusLabel(item.status, t)}
              </span>
              {item.ownerRole ? (
                <span className="workItemDetail__itemOwner">
                  {getWorkActorRoleLabel(item.ownerRole, t)}
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
  const { t } = useI18n();

  return (
    <section className="workItemDetail__section">
      <header className="workItemDetail__sectionHeader">
        <h2>{t("workItemSubWorkItemsTitle")}</h2>
        <span className="workItemDetail__sectionCount">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="workItemDetail__empty">
          {t("workItemNoSubWorkItems")}
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
                {getWorkObjectStatusLabel(item.status, t)}
              </span>
              <span className="workItemDetail__itemOwner">
                {formatRelative(item.updatedAt, t)}
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
  const { t } = useI18n();

  return (
    <section className="workItemDetail__section">
      <header className="workItemDetail__sectionHeader">
        <h2>{t("workItemMissionsTitle")}</h2>
        <span className="workItemDetail__sectionCount">{missions.length}</span>
      </header>
      {missions.length === 0 ? (
        <p className="workItemDetail__empty">
          {t("workItemNoMissions")}
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
                {getWorkObjectStatusLabel(mission.status, t)}
              </span>
              <span className="workItemDetail__itemOwner">
                {formatRelative(mission.updatedAt, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkItemDetailLoading(): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="workItemDetail">
      <header className="channelTopBar workItemDetailTopBar">
        <div className="channelTopBarStart workItemDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="workItemDetailTopBar__back"
          >
            <span>{t("workItemBackArrowLabel")}</span>
          </Link>
        </div>
      </header>
      <main className="workItemDetail__main">
        <p className="workItemDetail__empty">{t("workItemLoadingLabel")}</p>
      </main>
    </div>
  );
}

function WorkItemNotFound({
  workItemId,
}: {
  workItemId: string | null;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="workItemDetail">
      <header className="channelTopBar workItemDetailTopBar">
        <div className="channelTopBarStart workItemDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="workItemDetailTopBar__back"
          >
            <span>{t("workItemBackArrowLabel")}</span>
          </Link>
          <span className="workItemDetailTopBar__separator" aria-hidden="true">
            /
          </span>
          <h1 className="channelTopBarTitle workItemDetailTopBar__title">
            {t("workItemNotFoundTitle")}
          </h1>
        </div>
      </header>
      <main className="workItemDetail__main">
        <p className="workItemDetail__empty">
          {t("workItemNotFoundText", {
            workItemId: workItemId ?? t("workItemNotFoundCodeLabel"),
          })}
        </p>
      </main>
    </div>
  );
}
