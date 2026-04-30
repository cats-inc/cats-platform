import {
  type EvidenceCounts,
  type WorkGraphIndexes,
} from "./shared";
import { useI18n } from "../../../app/renderer/i18n/index.js";
import type { WorkGraphGateDecorator, WorkGraphObjectSummary } from "./types";

interface WorkObjectCardProps {
  object: WorkGraphObjectSummary;
  evidence: EvidenceCounts;
  gates: WorkGraphGateDecorator[];
  selected: boolean;
  onSelect: (id: string) => void;
}

export function WorkObjectCard({
  object,
  evidence,
  gates,
  selected,
  onSelect,
}: WorkObjectCardProps): JSX.Element {
  const { t } = useI18n();
  const kindLabel = getWorkObjectKindLabel(object.kind, t);
  const attentionTag =
    object.attention === "none"
      ? null
      : getWorkObjectAttentionLabel(object.attention, t);
  const statusLabel = getWorkObjectStatusLabel(object.status, t);
  const parentTaskLabel =
    object.kind === "run"
      ? t("topdown.parentTaskOwningLabel")
      : t("topdown.parentTaskLabel");
  const parentWorkItemTitle =
    object.kind === "work_item" && object.linkedWorkItemTitle
      ? t("topdown.parentWorkItemLabel", {
          parentWorkItemTitle: object.linkedWorkItemTitle,
        })
      : null;
  return (
    <article
      className={
        "topDownCard" +
        ` topDownCard--${object.kind}` +
        ` topDownCard--attention-${object.attention}` +
        (selected ? " topDownCard--selected" : "")
      }
      role="button"
      tabIndex={0}
      onClick={() => onSelect(object.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(object.id);
        }
      }}
    >
      <header className="topDownCard__head">
        <span className="topDownCard__kind">{kindLabel}</span>
        {object.kind === "task" && object.productBinding ? (
          <span
            className={`topDownCard__binding topDownCard__binding--${object.productBinding}`}
            title={t("topdown.taskProductBindingTitle", {
              productBinding: object.productBinding,
            })}
          >
            {object.productBinding}
          </span>
        ) : null}
        {attentionTag ? (
          <span
            className={`topDownCard__attention topDownCard__attention--${object.attention}`}
          >
            {attentionTag}
          </span>
        ) : null}
        <span className="topDownCard__status">{statusLabel}</span>
      </header>
      <h4 className="topDownCard__title">{object.title}</h4>
      {object.summary ? (
        <p className="topDownCard__summary">{object.summary}</p>
      ) : null}
      {object.nextAction ? (
        <p className="topDownCard__next">→ {object.nextAction}</p>
      ) : null}
      {evidence.total > 0 ||
      gates.length > 0 ||
      object.ownerRole ||
      ((object.kind === "run" || object.kind === "task") &&
        object.linkedTaskTitle) ||
      (object.kind === "work_item" && object.linkedWorkItemTitle) ? (
        <footer className="topDownCard__foot">
          {object.ownerRole ? (
            <span className="topDownCard__role">{object.ownerRole}</span>
          ) : null}
          {(object.kind === "run" || object.kind === "task") &&
          object.linkedTaskTitle ? (
            <span
              className="topDownCard__chip topDownCard__chip--parentTask"
              title={t("topdown.parentTaskTooltip", {
                linkedTaskTitle: object.linkedTaskTitle,
                linkType:
                  object.kind === "run"
                    ? t("topdown.parentTaskOwningLabel")
                    : t("topdown.parentTaskLabel"),
              })}
            >
              {parentTaskLabel}: {object.linkedTaskTitle}
            </span>
          ) : null}
          {object.kind === "work_item" && object.linkedWorkItemTitle ? (
            <span
              className="topDownCard__chip topDownCard__chip--parentTask"
              title={t("topdown.parentWorkItemLabel", {
                parentWorkItemTitle: object.linkedWorkItemTitle,
              })}
            >
              {parentWorkItemTitle}
            </span>
          ) : null}
          {evidence.artifact > 0 ? (
            <span className="topDownCard__chip topDownCard__chip--artifact">
              📎 {evidence.artifact}
            </span>
          ) : null}
          {evidence.activity > 0 ? (
            <span className="topDownCard__chip topDownCard__chip--activity">
              📜 {evidence.activity}
            </span>
          ) : null}
          {evidence.outcome > 0 ? (
            <span className="topDownCard__chip topDownCard__chip--outcome">
              🎯 {evidence.outcome}
            </span>
          ) : null}
          {gates.map((g) => (
            <span
              key={g.gateObjectId}
              className={`topDownCard__chip topDownCard__chip--gate-${g.state}`}
            >
              ⊘ {g.state.replace(/_/g, " ")}
            </span>
          ))}
        </footer>
      ) : null}
    </article>
  );
}

export function pickEvidence(
  indexes: WorkGraphIndexes,
  objectId: string,
): EvidenceCounts {
  const list = indexes.evidenceByAnchor.get(objectId);
  const c: EvidenceCounts = { artifact: 0, activity: 0, outcome: 0, total: 0 };
  if (!list) return c;
  for (const a of list) {
    c[a.relation] += 1;
    c.total += 1;
  }
  return c;
}

function getWorkObjectStatusLabel(
  status: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return status === "draft"
    ? t("workObjectStatusDraft")
    : status === "planned"
      ? t("workObjectStatusPlanned")
      : status === "ready"
        ? t("workObjectStatusReady")
        : status === "in_progress"
          ? t("workObjectStatusInProgress")
          : status === "blocked"
            ? t("workObjectStatusBlocked")
            : status === "completed"
              ? t("workObjectStatusCompleted")
              : status === "cancelled"
                ? t("workObjectStatusCancelled")
                : status === "running"
                  ? t("workObjectStatusRunning")
                  : status === "queued"
                    ? t("workObjectStatusQueued")
                    : status.replace(/_/g, " ");
}

function getWorkObjectAttentionLabel(
  attention: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return attention === "decision_needed"
    ? t("workObjectAttentionDecisionNeeded")
    : attention === "blocked"
      ? t("workObjectAttentionBlocked")
      : attention === "failed"
        ? t("workObjectAttentionFailed")
        : attention === "ready_to_review"
          ? t("workObjectAttentionReadyToReview")
          : attention === "recently_shipped"
            ? t("workObjectAttentionRecentlyShipped")
            : attention;
}

function getWorkObjectKindLabel(
  kind: WorkGraphObjectSummary["kind"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  return kind === "agent"
    ? t("workObjectKindAgent")
    : kind === "container"
      ? t("workObjectKindContainer")
      : kind === "conversation"
        ? t("workObjectKindConversation")
        : kind === "turn"
          ? t("workObjectKindTurn")
          : kind === "lane"
            ? t("workObjectKindLane")
            : kind === "project"
              ? t("workObjectKindProject")
              : kind === "work_item"
                ? t("workObjectKindWorkItem")
                : kind === "task"
                  ? t("workObjectKindTask")
                  : kind === "mission"
                    ? t("workObjectKindMission")
                    : kind === "run"
                      ? t("workObjectKindRun")
                      : kind === "artifact"
                        ? t("workObjectKindArtifact")
                        : kind === "activity"
                          ? t("workObjectKindActivity")
                          : kind === "outcome"
                            ? t("workObjectKindOutcome")
                            : kind === "approval_binding"
                              ? t("workObjectKindApprovalBinding")
                              : kind;
}
