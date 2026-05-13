import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { LinkageSection } from "../topdown/LinkageSection";
import {
  buildIndexes,
  formatWorkExternalBindingLabel,
  formatRelative,
  getWorkActorRoleLabel,
  getWorkGraphAttentionLabel,
  getWorkGraphKindLabel,
} from "../topdown/shared";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { getWorkObjectStatusLabel } from "../topdown/WorkObjectCard";
import type {
  WorkGraphExternalBindingSummary,
  WorkGraphObjectSummary,
} from "../topdown/types";
import {
  removeWorkProject,
  unlinkWorkExternalIssue,
} from "../../api/workRecords.js";
import {
  PROJECTS_QUERY_KEY,
  useProjectsQuery,
} from "../../state/queries/projectsQuery.js";
import {
  EMPTY_WORK_GRAPH,
  WORK_GRAPH_QUERY_KEY,
  useWorkGraphQuery,
} from "../../state/queries/workGraphQuery.js";
import { WORK_PROJECTS_PATH } from "../../workPaths.js";
import { formatWorkCrudMutationError } from "../workCrudErrorLabels.js";
import { ProjectExternalBindingDialog } from "./ProjectExternalBindingDialog";
import { ProjectExternalBindingsSection } from "./ProjectExternalBindingsSection";
import "./projects.css";

export function ProjectDetailPage(): JSX.Element {
  const { t } = useI18n();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [externalLinkDialogOpen, setExternalLinkDialogOpen] = useState(false);
  const graph = useWorkGraphQuery(t("workGraphLoadErrorFallback")).data ?? EMPTY_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);
  const projectsQuery = useProjectsQuery();

  const project = projectId
    ? projectsQuery.data?.projects.find((p) => p.id === projectId)
    : undefined;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await removeWorkProject(id, t("workProjectDeleteError"));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      navigate(WORK_PROJECTS_PATH);
    },
  });
  const unlinkExternalMutation = useMutation({
    mutationFn: async (input: {
      binding: WorkGraphExternalBindingSummary;
      projectId: string;
    }) => {
      await unlinkWorkExternalIssue(
        {
          localKind: "project",
          localId: input.projectId,
          provider: input.binding.provider,
          externalType: input.binding.externalType,
          externalId: input.binding.externalId,
        },
        t("workExternalUnlinkError"),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: WORK_GRAPH_QUERY_KEY }),
      ]);
    },
  });

  const handleDelete = () => {
    if (!project) return;
    if (
      !window.confirm(
        t("workProjectDeleteConfirmation", {
          projectTitle: project.title,
        }),
      )
    ) {
      return;
    }
    deleteMutation.mutate(project.id);
  };

  const handleUnlinkExternalBinding = (binding: WorkGraphExternalBindingSummary) => {
    if (!project) return;
    const label = formatWorkExternalBindingLabel(binding);
    if (!window.confirm(t("workExternalUnlinkConfirmation", { label }))) {
      return;
    }
    unlinkExternalMutation.mutate({ binding, projectId: project.id });
  };

  if (projectsQuery.isPending) {
    return <ProjectDetailLoading />;
  }
  if (!project) {
    return <ProjectNotFound projectId={projectId ?? null} />;
  }

  const deleteError = deleteMutation.error
    ? formatWorkCrudMutationError(
      deleteMutation.error,
      t("workProjectDeleteError"),
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
            aria-label={t("workProjectBackArrowLabel")}
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
            <span>{t("workProjectBackLabel")}</span>
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
          {getWorkGraphAttentionLabel(project.attention, t) ? (
            <span
              className={`projectDetail__attention projectDetail__attention--${project.attention}`}
            >
              {getWorkGraphAttentionLabel(project.attention, t)}
            </span>
          ) : null}
          <span
            className={`projectsList__statusPill projectsList__statusPill--${project.status}`}
          >
            {getWorkObjectStatusLabel(project.status, t)}
          </span>
          <span className="projectDetailTopBar__updated">
            {t("workProjectUpdatedAtPrefix", {
              updatedAt: formatRelative(project.updatedAt, t),
            })}
          </span>
          <button
            type="button"
            className="projectDetailTopBar__action projectDetailTopBar__action--destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            aria-label={t("workProjectDeleteLabel")}
          >
            {deleteMutation.isPending
              ? t("workProjectDeleteLabelBusy")
              : t("workProjectDeleteLabel")}
          </button>
        </div>
      </header>
      <main className="projectDetail__main">
        {deleteError ? (
          <p className="projectDetail__error" role="alert">
            {deleteError}
          </p>
        ) : null}
        {externalUnlinkError ? (
          <p className="projectDetail__error" role="alert">
            {externalUnlinkError}
          </p>
        ) : null}
        <section className="projectDetail__section projectDetail__overview">
          <header className="projectDetail__sectionHeader">
            <h2>{t("workProjectOverviewTitle")}</h2>
          </header>
          <dl className="projectDetail__overviewList">
            {project.summary ? (
              <>
                <dt>{t("workProjectSummaryLabel")}</dt>
                <dd>{project.summary}</dd>
              </>
            ) : null}
            <dt>{t("workProjectOwnerLabel")}</dt>
            <dd>{project.ownerName}</dd>
            {project.primaryConversationId ? (
              <>
                <dt>{t("workProjectConversationLabel")}</dt>
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

        <ProjectExternalBindingsSection
          bindings={project.externalBindings ?? []}
          onAddClick={() => setExternalLinkDialogOpen(true)}
          onRemoveBinding={handleUnlinkExternalBinding}
          removeDisabled={unlinkExternalMutation.isPending}
        />

        <ItemsSection
          title={t("workProjectWorkItemsTitle")}
          items={workItems}
          emptyLabel={t("workProjectNoWorkItems")}
        />

        <ItemsSection
          title={t("workProjectTasksTitle")}
          items={tasks}
          emptyLabel={t("workProjectNoTasks")}
        />

        <LinkageSection
          selfRef={{ recordFamily: "project", recordId: project.id }}
          graph={graph}
          indexes={indexes}
        />

        <section className="projectDetail__section">
          <header className="projectDetail__sectionHeader">
            <h2>{t("workProjectActivityTitle")}</h2>
            <span className="projectDetail__sectionCount">
              {activities.length}
            </span>
          </header>
          {activities.length === 0 ? (
            <p className="projectDetail__empty">
              {t("workProjectNoActivity")}
            </p>
          ) : (
            <ul className="projectDetail__activity">
              {activities.map((act) => (
                <li key={act.id} className="projectDetail__activityRow">
                  <span className="projectDetail__activityWhen">
                    {formatRelative(act.updatedAt, t)}
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
      {externalLinkDialogOpen ? (
        <ProjectExternalBindingDialog
          projectId={project.id}
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
                {getWorkGraphKindLabel(item.kind, t)}
              </span>
              <span className="projectDetail__itemTitle">{item.title}</span>
              {getWorkGraphAttentionLabel(item.attention, t) ? (
                <span
                  className={`projectDetail__itemAttention projectDetail__itemAttention--${item.attention}`}
                >
                  {getWorkGraphAttentionLabel(item.attention, t)}
                </span>
              ) : null}
              <span className="projectDetail__itemStatus">
                {getWorkObjectStatusLabel(item.status, t)}
              </span>
              {item.ownerRole ? (
                <span className="projectDetail__itemOwner">
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

function ProjectDetailLoading(): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="projectDetail">
      <header className="channelTopBar projectDetailTopBar">
        <div className="channelTopBarStart projectDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="projectDetailTopBar__back"
          >
            <span>{t("workProjectBackArrowLabel")}</span>
          </Link>
        </div>
      </header>
      <main className="projectDetail__main">
        <p className="projectDetail__empty">{t("workProjectLoadingLabel")}</p>
      </main>
    </div>
  );
}

function ProjectNotFound({
  projectId,
}: {
  projectId: string | null;
}): JSX.Element {
  const { t } = useI18n();
  const missingProjectId = projectId ?? t("workProjectMissingIdLabel");

  return (
    <div className="projectDetail">
      <header className="channelTopBar projectDetailTopBar">
        <div className="channelTopBarStart projectDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="projectDetailTopBar__back"
          >
            <span>{t("workProjectBackArrowLabel")}</span>
          </Link>
          <span className="projectDetailTopBar__separator" aria-hidden="true">
            /
          </span>
          <h1 className="channelTopBarTitle projectDetailTopBar__title">
            {t("workProjectNotFoundTitle")}
          </h1>
        </div>
      </header>
      <main className="projectDetail__main">
        <p className="projectDetail__empty">
          {t("workProjectNotFoundPrefix")} <code>{missingProjectId}</code>{" "}
          {t("workProjectNotFoundSuffix")}
        </p>
      </main>
    </div>
  );
}
