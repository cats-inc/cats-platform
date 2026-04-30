import { useCallback, useState } from 'react';
import type {
  CodeDeliveryResult,
  CodeDeliveryResult as DeliveryPreview,
} from '../api/codeTask.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';

export type RepoStatus = CodeDeliveryResult;

export interface DeliveryPanelProps {
  workspacePath: string | null;
  sessionId: string | null;
  repoStatus: RepoStatus | null;
  onRefreshRepoStatus: () => void;
  onPreviewCommit: (message: string) => Promise<CodeDeliveryResult>;
  onApplyCommit: (message: string) => Promise<CodeDeliveryResult>;
  onPreviewPush: () => Promise<CodeDeliveryResult>;
  onApplyPush: () => Promise<CodeDeliveryResult>;
  onExportArtifacts: () => Promise<CodeDeliveryResult>;
}

function PreviewResult({ preview, label }: { preview: DeliveryPreview; label: string }) {
  const { t } = useI18n();
  const blocked = preview.blockedReasons ?? [];
  const warnings = preview.warnings ?? [];
  const repo = preview.repo;
  const stateLabel = preview.state === 'ready'
    ? t(messageKeys.codeDeliveryStatusReady)
    : preview.state === 'blocked'
      ? t(messageKeys.codeDeliveryStatusBlocked)
      : t(messageKeys.codeDeliveryStatusUnknown);

  return (
    <div className="codeDeliveryPreview">
      <div className="codeDeliveryPreviewHeader">
        <strong>{t(messageKeys.codeDeliveryLabelPreview, { label })}</strong>
        <span className={
          preview.state === 'ready'
            ? 'operatorStatusBadge isSuccess'
            : preview.state === 'blocked'
              ? 'operatorStatusBadge isError'
              : 'operatorStatusBadge isMuted'
        }>
          {stateLabel}
        </span>
      </div>

      {blocked.length > 0 ? (
        <div className="codeDeliveryPreviewSection codeDeliveryBlocked">
          <p className="codeDeliveryPreviewLabel">{t(messageKeys.codeDeliveryBlockerLabel)}</p>
          <ul className="codeDeliveryPreviewList">
            {blocked.map((reason, i) => (
              <li key={i}>
                {reason.message ?? reason.code ?? t(messageKeys.codeDeliveryUnknownBlocker)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="codeDeliveryPreviewSection codeDeliveryWarnings">
          <p className="codeDeliveryPreviewLabel">{t(messageKeys.codeDeliveryWarningsLabel)}</p>
          <ul className="codeDeliveryPreviewList">
            {warnings.map((warning, i) => (
              <li key={i}>
                {warning.message ?? warning.code ?? t(messageKeys.codeDeliveryWarningFallback)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {repo ? (
        <div className="codeDeliveryPreviewSection">
          <p className="codeDeliveryPreviewLabel">{t(messageKeys.codeDeliveryRepoStatusHeader)}</p>
          <div className="operatorMetaRow">
            {typeof repo.branch === 'string' ? (
              <span>{t(messageKeys.codeDeliveryMetaBranch, { branch: repo.branch })}</span>
            ) : null}
            {typeof repo.ahead === 'number' ? (
              <span>{t(messageKeys.codeDeliveryMetaAhead, { count: repo.ahead })}</span>
            ) : null}
            {typeof repo.behind === 'number' ? (
              <span>{t(messageKeys.codeDeliveryMetaBehind, { count: repo.behind })}</span>
            ) : null}
            {typeof repo.staged === 'number' ? (
              <span>{t(messageKeys.codeDeliveryMetaStaged, { count: repo.staged })}</span>
            ) : null}
            {typeof repo.unstaged === 'number' ? (
              <span>{t(messageKeys.codeDeliveryMetaUnstaged, { count: repo.unstaged })}</span>
            ) : null}
            {typeof repo.remote === 'string' ? (
              <span>{t(messageKeys.codeDeliveryMetaRemote, { remote: repo.remote })}</span>
            ) : null}
            {typeof repo.clean === 'boolean' ? (
              <span>
                {repo.clean
                  ? t(messageKeys.codeDeliveryRepoClean)
                  : t(messageKeys.codeDeliveryRepoDirty)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {preview.contract ? (
        <div className="codeDeliveryPreviewSection">
          <p className="codeDeliveryPreviewLabel">{t(messageKeys.codeDeliveryContractLabel)}</p>
          <div className="operatorMetaRow">
            <span>
              {t(messageKeys.codeDeliveryMetaMode, { mode: preview.contract.mode ?? '-' })}
            </span>
            <span>
              {t(messageKeys.codeDeliveryMetaDecision, {
                decision: preview.contract.applyDecision ?? '-',
              })}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DeliveryPanel({
  workspacePath,
  repoStatus,
  onRefreshRepoStatus,
  onPreviewCommit,
  onApplyCommit,
  onPreviewPush,
  onApplyPush,
  onExportArtifacts,
}: DeliveryPanelProps) {
  const { t } = useI18n();
  const [commitMessage, setCommitMessage] = useState('');
  const [commitPreview, setCommitPreview] = useState<DeliveryPreview | null>(null);
  const [pushPreview, setPushPreview] = useState<DeliveryPreview | null>(null);
  const [confirmPush, setConfirmPush] = useState(false);
  const [busy, setBusy] = useState(false);

  const handlePreviewCommit = useCallback(async () => {
    if (!commitMessage.trim()) {
      return;
    }
    setBusy(true);
    try {
      const result = await onPreviewCommit(commitMessage);
      setCommitPreview(result);
    } finally {
      setBusy(false);
    }
  }, [commitMessage, onPreviewCommit]);

  const handleApplyCommit = useCallback(async () => {
    if (!commitMessage.trim()) {
      return;
    }
    setBusy(true);
    try {
      await onApplyCommit(commitMessage);
      setCommitMessage('');
      setCommitPreview(null);
      onRefreshRepoStatus();
    } finally {
      setBusy(false);
    }
  }, [commitMessage, onApplyCommit, onRefreshRepoStatus]);

  const handlePreviewPush = useCallback(async () => {
    setBusy(true);
    try {
      const result = await onPreviewPush();
      setPushPreview(result);
    } finally {
      setBusy(false);
    }
  }, [onPreviewPush]);

  const handleApplyPush = useCallback(async () => {
    setBusy(true);
    try {
      await onApplyPush();
      setPushPreview(null);
      setConfirmPush(false);
      onRefreshRepoStatus();
    } finally {
      setBusy(false);
    }
  }, [onApplyPush, onRefreshRepoStatus]);

  if (!workspacePath) {
    return (
      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">{t(messageKeys.codeDeliveryHeader)}</p>
            <h2>{t(messageKeys.codeDeliveryPanelTitle)}</h2>
          </div>
        </div>
        <p className="operatorEmptyState">
          {t(messageKeys.codeDeliveryNoCodespace)}
        </p>
      </section>
    );
  }

  const repo = repoStatus?.repo;

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">{t(messageKeys.codeDeliveryHeader)}</p>
          <h2>{t(messageKeys.codeDeliveryPanelTitle)}</h2>
        </div>
        <button
          type="button"
          className="operatorActionButton"
          onClick={onRefreshRepoStatus}
          disabled={busy}
        >
          {t(messageKeys.codeDeliveryActionRefresh)}
        </button>
      </div>

      {repo ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t(messageKeys.codeDeliveryRepoStatusHeader)}</strong>
            <span
              className={repo.clean
                ? 'operatorStatusBadge isSuccess'
                : 'operatorStatusBadge isAttention'}
            >
              {repo.clean
                ? t(messageKeys.codeDeliveryRepoClean)
                : t(messageKeys.codeDeliveryRepoDirty)}
            </span>
          </div>
          <div className="operatorMetaRow">
            {repo.branch ? (
              <span>{t(messageKeys.codeDeliveryMetaBranch, { branch: String(repo.branch) })}</span>
            ) : null}
            {typeof repo.staged === 'number' ? (
              <span>{t(messageKeys.codeDeliveryMetaStaged, { count: repo.staged })}</span>
            ) : null}
            {typeof repo.unstaged === 'number' ? (
              <span>{t(messageKeys.codeDeliveryMetaUnstaged, { count: repo.unstaged })}</span>
            ) : null}
            {typeof repo.untracked === 'number' ? (
              <span>{t(messageKeys.codeDeliveryMetaUntracked, { count: repo.untracked })}</span>
            ) : null}
          </div>
        </article>
      ) : (
        <p className="operatorEmptyState">{t(messageKeys.codeDeliveryNoRepoStatus)}</p>
      )}

      <div className="operatorStack">
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t(messageKeys.codeDeliveryActionsCommitHeader)}</strong>
          </div>
          <div className="codeDeliveryCommitForm">
            <input
              type="text"
              className="codeDeliveryInput"
              placeholder={t(messageKeys.codeDeliveryActionCommitPlaceholder)}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
            />
            <div className="codeDeliveryActions">
              <button
                type="button"
                className="operatorActionButton"
                onClick={handlePreviewCommit}
                disabled={busy || !commitMessage.trim()}
              >
                {t(messageKeys.codeDeliveryActionPreview)}
              </button>
              {commitPreview && commitPreview.state !== 'blocked' ? (
                <button
                  type="button"
                  className="operatorActionButton operatorActionButtonPrimary"
                  onClick={handleApplyCommit}
                  disabled={busy}
                >
                  {t(messageKeys.codeDeliveryActionCommit)}
                </button>
              ) : null}
            </div>
            {commitPreview ? (
              <PreviewResult
                preview={commitPreview}
                label={t(messageKeys.codeDeliveryActionCommit)}
              />
            ) : null}
          </div>
        </article>

        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t(messageKeys.codeDeliveryActionsPushHeader)}</strong>
          </div>
          <div className="codeDeliveryActions">
            <button
              type="button"
              className="operatorActionButton"
              onClick={handlePreviewPush}
              disabled={busy}
            >
              {t(messageKeys.codeDeliveryActionPushPreview)}
            </button>
          </div>
          {pushPreview ? (
            <>
              <PreviewResult
                preview={pushPreview}
                label={t(messageKeys.codeDeliveryActionsPushHeader)}
              />
              {pushPreview.state !== 'blocked' && !confirmPush ? (
                <div className="codeDeliveryActions">
                  <button
                    type="button"
                    className="operatorActionButton codeBuilderActionButtonDanger"
                    onClick={() => setConfirmPush(true)}
                  >
                    {t(messageKeys.codeDeliveryActionPush)}
                  </button>
                </div>
              ) : null}
              {confirmPush ? (
                <div className="codeDeliveryConfirm">
                  <span>{t(messageKeys.codeDeliveryConfirmationPush)}</span>
                  <button
                    type="button"
                    className="operatorActionButton codeBuilderActionButtonDanger"
                    onClick={handleApplyPush}
                    disabled={busy}
                  >
                    {t(messageKeys.codeDeliveryActionPushConfirm)}
                  </button>
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => setConfirmPush(false)}
                  >
                    {t(messageKeys.codeDeliveryActionPushCancel)}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </article>

        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t(messageKeys.codeDeliveryActionsExportHeader)}</strong>
          </div>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => { onExportArtifacts(); }}
            disabled={busy}
          >
            {t(messageKeys.codeDeliveryActionExport)}
          </button>
        </article>
      </div>
    </section>
  );
}
