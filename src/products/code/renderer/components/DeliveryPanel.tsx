import { useCallback, useState } from 'react';

export interface RepoStatus {
  action: string;
  state: string;
  repo?: {
    branch?: string;
    clean?: boolean;
    staged?: number;
    unstaged?: number;
    untracked?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface DeliveryPreview {
  action?: string;
  state?: string;
  contract?: { mode?: string; applyRequested?: boolean; applyDecision?: string };
  warnings?: Array<{ code?: string; message?: string }>;
  blockedReasons?: Array<{ code?: string; message?: string }>;
  capabilities?: Record<string, { state?: string }>;
  repo?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DeliveryPanelProps {
  workspacePath: string | null;
  sessionId: string | null;
  repoStatus: RepoStatus | null;
  onRefreshRepoStatus: () => void;
  onPreviewCommit: (message: string) => Promise<unknown>;
  onApplyCommit: (message: string) => Promise<unknown>;
  onPreviewPush: () => Promise<unknown>;
  onApplyPush: () => Promise<unknown>;
  onExportArtifacts: () => Promise<unknown>;
}

function PreviewResult({ preview, label }: { preview: DeliveryPreview; label: string }) {
  const blocked = preview.blockedReasons ?? [];
  const warnings = preview.warnings ?? [];
  const repo = preview.repo;

  return (
    <div className="codeDeliveryPreview">
      <div className="codeDeliveryPreviewHeader">
        <strong>{label} Preview</strong>
        <span className={
          preview.state === 'ready'
            ? 'operatorStatusBadge isSuccess'
            : preview.state === 'blocked'
              ? 'operatorStatusBadge isError'
              : 'operatorStatusBadge isMuted'
        }>
          {preview.state ?? 'unknown'}
        </span>
      </div>

      {blocked.length > 0 ? (
        <div className="codeDeliveryPreviewSection codeDeliveryBlocked">
          <p className="codeDeliveryPreviewLabel">Blocked</p>
          <ul className="codeDeliveryPreviewList">
            {blocked.map((reason, i) => (
              <li key={i}>{reason.message ?? reason.code ?? 'Unknown blocker'}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="codeDeliveryPreviewSection codeDeliveryWarnings">
          <p className="codeDeliveryPreviewLabel">Warnings</p>
          <ul className="codeDeliveryPreviewList">
            {warnings.map((warning, i) => (
              <li key={i}>{warning.message ?? warning.code ?? 'Warning'}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {repo ? (
        <div className="codeDeliveryPreviewSection">
          <p className="codeDeliveryPreviewLabel">Repo</p>
          <div className="operatorMetaRow">
            {typeof repo.branch === 'string' ? <span>Branch: {repo.branch}</span> : null}
            {typeof repo.ahead === 'number' ? <span>Ahead: {String(repo.ahead)}</span> : null}
            {typeof repo.behind === 'number' ? <span>Behind: {String(repo.behind)}</span> : null}
            {typeof repo.staged === 'number' ? <span>Staged: {String(repo.staged)}</span> : null}
            {typeof repo.unstaged === 'number' ? <span>Unstaged: {String(repo.unstaged)}</span> : null}
            {typeof repo.remote === 'string' ? <span>Remote: {repo.remote}</span> : null}
            {typeof repo.clean === 'boolean' ? (
              <span>{repo.clean ? 'Working tree clean' : 'Working tree dirty'}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {preview.contract ? (
        <div className="codeDeliveryPreviewSection">
          <p className="codeDeliveryPreviewLabel">Contract</p>
          <div className="operatorMetaRow">
            <span>Mode: {preview.contract.mode ?? '—'}</span>
            <span>Decision: {preview.contract.applyDecision ?? '—'}</span>
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
      const result = (await onPreviewCommit(commitMessage)) as DeliveryPreview;
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
      const result = (await onPreviewPush()) as DeliveryPreview;
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
            <p className="operatorEyebrow">Delivery</p>
            <h2>Repo Actions</h2>
          </div>
        </div>
        <p className="operatorEmptyState">
          No workspace bound. Resolve a workspace to see repo actions.
        </p>
      </section>
    );
  }

  const repo = repoStatus?.repo;

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Delivery</p>
          <h2>Repo Actions</h2>
        </div>
        <button
          type="button"
          className="operatorActionButton"
          onClick={onRefreshRepoStatus}
          disabled={busy}
        >
          Refresh
        </button>
      </div>

      {repo ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>Repo Status</strong>
            <span className={repo.clean ? 'operatorStatusBadge isSuccess' : 'operatorStatusBadge isAttention'}>
              {repo.clean ? 'Clean' : 'Dirty'}
            </span>
          </div>
          <div className="operatorMetaRow">
            {repo.branch ? <span>Branch: {String(repo.branch)}</span> : null}
            {typeof repo.staged === 'number' ? <span>Staged: {repo.staged}</span> : null}
            {typeof repo.unstaged === 'number' ? <span>Unstaged: {repo.unstaged}</span> : null}
            {typeof repo.untracked === 'number' ? <span>Untracked: {repo.untracked}</span> : null}
          </div>
        </article>
      ) : (
        <p className="operatorEmptyState">No repo status loaded.</p>
      )}

      <div className="operatorStack">
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>Commit</strong>
          </div>
          <div className="codeDeliveryCommitForm">
            <input
              type="text"
              className="codeDeliveryInput"
              placeholder="Commit message..."
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
                Preview
              </button>
              {commitPreview && commitPreview.state !== 'blocked' ? (
                <button
                  type="button"
                  className="operatorActionButton operatorActionButtonPrimary"
                  onClick={handleApplyCommit}
                  disabled={busy}
                >
                  Commit
                </button>
              ) : null}
            </div>
            {commitPreview ? (
              <PreviewResult preview={commitPreview} label="Commit" />
            ) : null}
          </div>
        </article>

        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>Push</strong>
          </div>
          <div className="codeDeliveryActions">
            <button
              type="button"
              className="operatorActionButton"
              onClick={handlePreviewPush}
              disabled={busy}
            >
              Preview Push
            </button>
          </div>
          {pushPreview ? (
            <>
              <PreviewResult preview={pushPreview} label="Push" />
              {pushPreview.state !== 'blocked' && !confirmPush ? (
                <div className="codeDeliveryActions">
                  <button
                    type="button"
                    className="operatorActionButton codeBuilderActionButtonDanger"
                    onClick={() => setConfirmPush(true)}
                  >
                    Push...
                  </button>
                </div>
              ) : null}
              {confirmPush ? (
                <div className="codeDeliveryConfirm">
                  <span>Push to remote? This is externally visible.</span>
                  <button
                    type="button"
                    className="operatorActionButton codeBuilderActionButtonDanger"
                    onClick={handleApplyPush}
                    disabled={busy}
                  >
                    Confirm Push
                  </button>
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => setConfirmPush(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </article>

        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>Export</strong>
          </div>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => { onExportArtifacts(); }}
            disabled={busy}
          >
            Export Artifacts
          </button>
        </article>
      </div>
    </section>
  );
}
