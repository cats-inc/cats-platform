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
  const [commitPreview, setCommitPreview] = useState<unknown>(null);
  const [pushPreview, setPushPreview] = useState<unknown>(null);
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
          className="operatorAction"
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
            <span className={repo.clean ? 'operatorBadgePositive' : 'operatorBadge'}>
              {repo.clean ? 'Clean' : 'Dirty'}
            </span>
          </div>
          <div className="operatorCardMeta">
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
                className="operatorAction"
                onClick={handlePreviewCommit}
                disabled={busy || !commitMessage.trim()}
              >
                Preview
              </button>
              {commitPreview ? (
                <button
                  type="button"
                  className="operatorAction operatorActionPrimary"
                  onClick={handleApplyCommit}
                  disabled={busy}
                >
                  Commit
                </button>
              ) : null}
            </div>
          </div>
        </article>

        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>Push</strong>
          </div>
          <div className="codeDeliveryActions">
            <button
              type="button"
              className="operatorAction"
              onClick={handlePreviewPush}
              disabled={busy}
            >
              Preview Push
            </button>
            {pushPreview && !confirmPush ? (
              <button
                type="button"
                className="operatorAction operatorActionDanger"
                onClick={() => setConfirmPush(true)}
              >
                Push...
              </button>
            ) : null}
            {confirmPush ? (
              <div className="codeDeliveryConfirm">
                <span>Push to remote? This is externally visible.</span>
                <button
                  type="button"
                  className="operatorAction operatorActionDanger"
                  onClick={handleApplyPush}
                  disabled={busy}
                >
                  Confirm Push
                </button>
                <button
                  type="button"
                  className="operatorAction"
                  onClick={() => setConfirmPush(false)}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </article>

        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>Export</strong>
          </div>
          <button
            type="button"
            className="operatorAction"
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
