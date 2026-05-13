import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import {
  CODE_BUILD_PATH,
  buildCodeArtifactPath,
} from '../codePaths.js';
import {
  fetchCodeTaskDetail,
} from '../api/codeTask.js';
import type { CodeTaskBuilderDetailSummary } from '../../shared/taskDetailSummary.js';
import { CodeExecutionSummaryPanel } from './CodeExecutionSummaryPanel.js';
import { CodeWorkspaceSummaryPanel } from './CodeWorkspaceSummaryPanel.js';
import { LivePreviewPanel } from './LivePreviewPanel.js';

export function CodeTaskDetailPage(): JSX.Element {
  const { taskId } = useParams<{ taskId: string }>();
  const { t } = useI18n();
  const [detail, setDetail] = useState<CodeTaskBuilderDetailSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setError(t(messageKeys.codeArtifactDetailMissingId));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    void fetchCodeTaskDetail(taskId, t(messageKeys.codeBuilderErrorTaskDetailLoad))
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error
            ? fetchError.message
            : t(messageKeys.codeBuilderErrorTaskDetailLoad));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, t]);

  if (loading && !detail) {
    return (
      <div className="codeBuilderView">
        <TaskTopBar title={t(messageKeys.codeArtifactDetailLoadingTitle)} />
        <p className="operatorEmptyState">{t(messageKeys.codeArtifactDetailLoadingBody)}</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="codeBuilderView">
        <TaskTopBar title={t(messageKeys.codeArtifactDetailArtifactUnavailable)} />
        <p className="operatorEmptyState">
          {error ?? t(messageKeys.codeBuilderErrorTaskDetailLoad)}
        </p>
      </div>
    );
  }

  const artifacts = detail.linkedArtifacts
    .map(readLinkedArtifactSummary)
    .filter((artifact): artifact is LinkedArtifactSummary => artifact !== null);
  const livePreviewTaskId = detail.taskId ?? taskId ?? null;

  return (
    <div className="codeBuilderView">
      <TaskTopBar title={detail.title ?? t(messageKeys.codeArtifactDetailTaskLabel)} />
      {detail.workspace ? (
        <CodeWorkspaceSummaryPanel summary={detail.workspace} />
      ) : null}
      <CodeExecutionSummaryPanel
        taskId={detail.taskId}
        taskStatus={detail.taskStatus}
        effectiveStrategy={detail.effectiveStrategy}
        deliveryMode={detail.runtimeDeliveryIntent?.mode ?? null}
        deliveryRequiresOwnerDecision={
          detail.runtimeDeliveryIntent?.requiresOwnerDecision ?? false
        }
        deliveryApprovalPending={detail.runtimeDeliveryIntent?.approvalPending ?? false}
        continuationBlockedReason={detail.workflowContinuation?.blockedReason ?? null}
        continuationTargetNames={detail.workflowContinuation?.targetNames ?? []}
        sessionId={null}
        sessionStatus={null}
        provider={null}
        model={null}
      />
      {livePreviewTaskId ? (
        <LivePreviewPanel surfaceKind="code_task" surfaceId={livePreviewTaskId} />
      ) : null}
      {detail.summary ? (
        <section className="operatorPanel">
          <div className="operatorPanelHeader">
            <div>
              <p className="operatorEyebrow">
                {t(messageKeys.codeArtifactDetailContextEyebrow)}
              </p>
              <h2>{t(messageKeys.codeArtifactDetailContextTitle)}</h2>
            </div>
          </div>
          <p>{detail.summary}</p>
        </section>
      ) : null}
      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">
              {t(messageKeys.codeArtifactDetailRelatedEyebrow)}
            </p>
            <h2>{t(messageKeys.codeWorkspaceDetailArtifactsHeader)}</h2>
          </div>
        </div>
        {artifacts.length === 0 ? (
          <p className="operatorEmptyState">
            {t(messageKeys.codeWorkspaceDetailNoArtifacts)}
          </p>
        ) : (
          <div className="operatorStack">
            {artifacts.map((artifact) => (
              <Link
                key={artifact.id}
                to={buildCodeArtifactPath(artifact.id)}
                className="operatorCard"
              >
                <div className="operatorCardHeader">
                  <strong>{artifact.title}</strong>
                  <span className="operatorStatusBadge isMuted">
                    {artifact.status}
                  </span>
                </div>
                <p>{artifact.kind}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TaskTopBar({ title }: { title: string }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="codeBuilderHeader">
      <div>
        <p className="operatorEyebrow">{t(messageKeys.codeArtifactDetailTaskLabel)}</p>
        <h1 className="codeBuilderTitle">{title}</h1>
      </div>
      <Link to={CODE_BUILD_PATH} className="operatorActionButton">
        {t(messageKeys.codeArtifactDetailBackToBuild)}
      </Link>
    </div>
  );
}

interface LinkedArtifactSummary {
  id: string;
  title: string;
  kind: string;
  status: string;
}

function readLinkedArtifactSummary(value: unknown): LinkedArtifactSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = readNonEmptyString(record.id);
  const title = readNonEmptyString(record.title);
  if (!id || !title) {
    return null;
  }
  return {
    id,
    title,
    kind: readNonEmptyString(record.kind) ?? 'artifact',
    status: readNonEmptyString(record.status) ?? 'unknown',
  };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}
