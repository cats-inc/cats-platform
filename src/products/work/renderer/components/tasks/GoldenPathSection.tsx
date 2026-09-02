import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { messageKeys } from "../../../../../shared/i18n/index.js";
import type { MessageKey } from "../../../../../shared/i18n/index.js";
import type {
  WorkGoldenPathDetailProjection,
  WorkGoldenPathDeliveryAttemptView,
} from "../../../api/goldenPathProjection.js";
import type { TransportWorkStage } from "../../../../../platform/transports/work-delivery/contracts.js";
import {
  applyWorkGoldenPathRunLifecycle,
  retryWorkGoldenPathDelivery,
} from "../../api/workRecords.js";
import {
  TASK_GOLDEN_PATH_QUERY_KEY,
  useTaskGoldenPathQuery,
} from "../../state/queries/taskGoldenPathQuery.js";

const STAGE_LABEL_KEYS: Record<TransportWorkStage, MessageKey> = {
  received: messageKeys.workTaskGoldenPathStageReceived,
  scope_proposed: messageKeys.workTaskGoldenPathStageScopeproposed,
  execution_authorized: messageKeys.workTaskGoldenPathStageExecutionauthorized,
  admitted: messageKeys.workTaskGoldenPathStageAdmitted,
  running: messageKeys.workTaskGoldenPathStageRunning,
  decision_needed: messageKeys.workTaskGoldenPathStageDecisionneeded,
  result_ready: messageKeys.workTaskGoldenPathStageResultready,
  publish_authorized: messageKeys.workTaskGoldenPathStagePublishauthorized,
  delivered: messageKeys.workTaskGoldenPathStageDelivered,
  failed: messageKeys.workTaskGoldenPathStageFailed,
  cancelled: messageKeys.workTaskGoldenPathStageCancelled,
};

function DetailRow({ label, children }: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function AttemptRow({ attempt }: {
  attempt: WorkGoldenPathDeliveryAttemptView;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <li className="taskDetail__goldenPathAttempt">
      <span>
        {t("workTaskGoldenPathAttempt", {
          purpose: attempt.purpose,
          state: attempt.state,
          count: String(attempt.attemptCount),
        })}
      </span>
      {attempt.lastErrorCode ? (
        <span className="taskDetail__goldenPathError">{attempt.lastErrorCode}</span>
      ) : null}
    </li>
  );
}

/**
 * The Desktop view of a transport-originated request (SPEC-114 FR-49).
 *
 * Renders nothing for a Task created in Desktop: there is no source binding,
 * no scope revision, and no receipt to explain, and an empty panel would only
 * suggest something is missing.
 */
export function GoldenPathSection({ taskId }: { taskId: string }): JSX.Element | null {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useTaskGoldenPathQuery(taskId);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const goldenPath: WorkGoldenPathDetailProjection | null = query.data ?? null;

  if (goldenPath === null) {
    return null;
  }

  const canRetryDelivery = goldenPath.recoveryActions.includes("retry_delivery");
  const canRetryRun = goldenPath.recoveryActions.includes("retry_run");
  const canResumeRun = goldenPath.recoveryActions.includes("resume_run");

  /**
   * Retries or resumes the Run.
   *
   * Desktop asks for the transition only; the host drives the Run, so the
   * button returns as soon as the state moved rather than waiting minutes.
   */
  async function onLifecycle(action: "retry" | "resume"): Promise<void> {
    setRetrying(true);
    setRetryError(null);
    try {
      const result = await applyWorkGoldenPathRunLifecycle(taskId, action);
      if (result.status !== "redrivable") {
        setRetryError(
          t("workTaskGoldenPathLifecycleFailed", {
            reason: result.reason ?? result.status,
          }),
        );
      }
      await queryClient.invalidateQueries({ queryKey: TASK_GOLDEN_PATH_QUERY_KEY });
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRetrying(false);
    }
  }

  async function onRetry(): Promise<void> {
    setRetrying(true);
    setRetryError(null);
    try {
      const result = await retryWorkGoldenPathDelivery(taskId);
      if (result.status !== "delivered") {
        setRetryError(
          t("workTaskGoldenPathRetryFailed", {
            reason: result.reason ?? result.status,
          }),
        );
      }
      await queryClient.invalidateQueries({ queryKey: TASK_GOLDEN_PATH_QUERY_KEY });
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRetrying(false);
    }
  }

  const { scope, source, authorization, evidence, delivery } = goldenPath;

  return (
    <section className="taskDetail__section taskDetail__goldenPath">
      <header className="taskDetail__sectionHeader">
        <h2>{t("workTaskGoldenPathTitle")}</h2>
        <span className="taskDetail__sectionCount">
          {t(STAGE_LABEL_KEYS[goldenPath.stage])}
        </span>
      </header>

      <p className="taskDetail__goldenPathRationale">{goldenPath.stageRationale}</p>

      <dl className="taskDetail__overviewList">
        <DetailRow label={t("workTaskGoldenPathBinding")}>
          {source.transport} · {source.bindingId}
          {source.present ? null : (
            <span className="taskDetail__goldenPathError">
              {" "}
              ({t("workTaskGoldenPathBindingMissing")})
            </span>
          )}
        </DetailRow>
        <DetailRow label={t("workTaskGoldenPathRevision")}>
          {scope.revision} · <code>{scope.digest.slice(0, 12)}</code>
        </DetailRow>
        <DetailRow label={t("workTaskGoldenPathTarget")}>{scope.targetLabel}</DetailRow>
        {scope.workspacePath ? (
          <DetailRow label={t("workTaskGoldenPathWorkspace")}>
            <code>{scope.workspacePath}</code>
          </DetailRow>
        ) : null}
        <DetailRow label={t("workTaskGoldenPathDoneWhen")}>
          {scope.acceptanceCriteria.join("; ")}
        </DetailRow>
        <DetailRow label={t("workTaskGoldenPathDelivery")}>{scope.deliveryMode}</DetailRow>
        {goldenPath.outstandingGates.length > 0 ? (
          <DetailRow label={t("workTaskGoldenPathGates")}>
            {goldenPath.outstandingGates.join(", ")}
          </DetailRow>
        ) : null}
        <DetailRow label={t("workTaskGoldenPathAuthorizationTitle")}>
          {authorization.authorizedByActorId && authorization.authorizedAt ? (
            <>
              <span>
                {t("workTaskGoldenPathAuthorizedBy", {
                  actor: authorization.authorizedByActorId,
                  at: authorization.authorizedAt,
                })}
              </span>
              <br />
              <span>
                {t("workTaskGoldenPathAuthorizedFrom", {
                  binding: authorization.bindingId ?? source.bindingId,
                  revision: String(authorization.proposalRevision ?? scope.revision),
                })}
              </span>
            </>
          ) : (
            t("workTaskGoldenPathNotAuthorized")
          )}
        </DetailRow>
      </dl>

      {goldenPath.permissionDenial ? (
        <>
          <h3>{t("workTaskGoldenPathPermissionDenial")}</h3>
          <p className="taskDetail__goldenPathError">
            {t("workTaskGoldenPathPermissionDenialDetail", {
              tool: goldenPath.permissionDenial.toolName,
              code: goldenPath.permissionDenial.code,
            })}
          </p>
        </>
      ) : null}

      {goldenPath.blockers.length > 0 ? (
        <>
          <h3>{t("workTaskGoldenPathBlockers")}</h3>
          <ul className="taskDetail__goldenPathBlockers">
            {goldenPath.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </>
      ) : null}

      <h3>{t("workTaskGoldenPathEvidenceTitle")}</h3>
      {evidence.outcomeStatus === null && evidence.artifacts.length === 0 ? (
        <p className="taskDetail__empty">{t("workTaskGoldenPathNoEvidence")}</p>
      ) : (
        <dl className="taskDetail__overviewList">
          {evidence.commitId ? (
            <DetailRow label={t("workTaskGoldenPathCommit")}>
              <code>{evidence.commitId}</code>
              {evidence.changeSummary ? ` — ${evidence.changeSummary}` : null}
            </DetailRow>
          ) : null}
          {evidence.validation ? (
            <DetailRow label={t("workTaskGoldenPathValidation")}>
              {evidence.validation.command}
              {" — "}
              {evidence.validation.passed
                ? t("workTaskGoldenPathValidationPassed")
                : t("workTaskGoldenPathValidationFailed")}
            </DetailRow>
          ) : null}
          {evidence.artifacts.length > 0 ? (
            <DetailRow label={t("workTaskGoldenPathArtifacts")}>
              {evidence.artifacts
                .map((artifact) => `${artifact.title} (${artifact.status})`)
                .join(", ")}
            </DetailRow>
          ) : null}
          {evidence.unmetCriteria.length > 0 ? (
            <DetailRow label={t("workTaskGoldenPathUnmet")}>
              {evidence.unmetCriteria.join("; ")}
            </DetailRow>
          ) : null}
        </dl>
      )}

      <h3>{t("workTaskGoldenPathDeliveryTitle")}</h3>
      {delivery.attempts.length === 0 ? (
        <p className="taskDetail__empty">{t("workTaskGoldenPathNoAttempts")}</p>
      ) : (
        <ul className="taskDetail__goldenPathAttempts">
          {delivery.attempts.map((attempt) => (
            <AttemptRow key={attempt.idempotencyKey} attempt={attempt} />
          ))}
        </ul>
      )}
      {delivery.receipt?.externalMessageRef && delivery.receipt.sentAt ? (
        <p className="taskDetail__goldenPathReceipt">
          {t("workTaskGoldenPathReceipt", {
            messageId: delivery.receipt.externalMessageRef,
            at: delivery.receipt.sentAt,
          })}
        </p>
      ) : null}

      <div className="taskDetail__goldenPathActions">
        {canRetryDelivery ? (
          <button
            type="button"
            className="taskDetailTopBar__action"
            onClick={() => {
              void onRetry();
            }}
            disabled={retrying}
          >
            {retrying
              ? t("workTaskGoldenPathRetrying")
              : t("workTaskGoldenPathRetryDelivery")}
          </button>
        ) : null}
        {canRetryRun ? (
          <button
            type="button"
            className="taskDetailTopBar__action"
            onClick={() => {
              void onLifecycle("retry");
            }}
            disabled={retrying}
          >
            {t("workTaskGoldenPathRetryRun")}
          </button>
        ) : null}
        {canResumeRun ? (
          <button
            type="button"
            className="taskDetailTopBar__action"
            onClick={() => {
              void onLifecycle("resume");
            }}
            disabled={retrying}
          >
            {t("workTaskGoldenPathResumeRun")}
          </button>
        ) : null}
      </div>
      {retryError ? (
        <p className="taskDetail__error" role="alert">
          {retryError}
        </p>
      ) : null}
    </section>
  );
}
