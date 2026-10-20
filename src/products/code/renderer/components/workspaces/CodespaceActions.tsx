import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { manageCodespace, type CodeWorkspaceListItemSummary, type CodeWorkspaceDetailResponse } from '../../api/codeTask.js';
import { refreshCodeWorkspaces } from '../../state/codeWorkspacesStore.js';
import { openFolderInExplorer } from '../../../../shared/renderer/api/shell.js';
import { ConfirmDialog, useConfirmDialog } from '../../../../../design/components/ConfirmDialog.js';

export function CodespaceActions({ workspace, onChanged }: {
  workspace: CodeWorkspaceListItemSummary;
  onChanged?: (payload: CodeWorkspaceDetailResponse) => void;
}) {
  const { t } = useI18n();
  const confirmation = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(workspace.title);
  const listing = workspace.management?.listing ?? 'visible';
  async function act(action: string) {
    if (action === 'remove') {
      setBusy(true);
      if (!await confirmation.confirm({ title: workspace.title, message: t('ownerRemoveCodespaceConfirm'), confirmLabel: t('ownerRemoveCodespace'), defaultAction: 'cancel' })) { setBusy(false); return; }
    }
    setBusy(true); setError(null);
    try {
      const next = await manageCodespace(workspace.id, action, workspace.management?.revision ?? 0, label);
      setRenaming(false); onChanged?.(next);
      await refreshCodeWorkspaces({ t });
    } catch (err) { setError(err instanceof Error ? err.message : t('ownerActionFailed')); await refreshCodeWorkspaces({ t }); }
    finally { setBusy(false); }
  }
  return <div className="ownerCodespaceActions">
    <ConfirmDialog dialog={confirmation.dialog} onClose={confirmation.handleClose} />
    <details>
      <summary aria-label={`${t('ownerActions')} · ${workspace.title}`}>{t('ownerActions')}</summary>
      <div className="ownerCodespaceActions__menu">
        {listing === 'visible' ? <>
          <button disabled={busy} onClick={() => void act(workspace.management?.pinned ? 'unpin' : 'pin')}>{t(workspace.management?.pinned ? 'ownerUnpin' : 'ownerPin')}</button>
          <button disabled={busy} onClick={() => void act('archive')}>{t('ownerArchive')}</button>
        </> : <button disabled={busy} onClick={() => void act('restore')}>{t('ownerRestore')}</button>}
        <button disabled={busy} onClick={() => setRenaming(!renaming)}>{t('ownerRename')}</button>
        {renaming ? <form onSubmit={event => { event.preventDefault(); void act('rename'); }}>
          <label>{t('ownerName')}<input autoFocus maxLength={200} value={label} onChange={event => setLabel(event.target.value)} /></label>
          <button disabled={busy || !label.trim()}>{t('ownerSave')}</button>
          <button type="button" onClick={() => setRenaming(false)}>{t('ownerCancel')}</button>
        </form> : null}
        <button disabled={busy} onClick={() => { setError(null); void openFolderInExplorer(workspace.path).catch(() => setError(t('ownerOpenFolderFailed'))); }}>{t('ownerOpenFolder')}</button>
        {listing !== 'removed' ? <Link to={`/code/new?codespace=${encodeURIComponent(workspace.path)}`}>{t('ownerNewCodeHere')}</Link> : null}
        {listing !== 'removed' ? <button disabled={busy} onClick={() => void act('remove')}>{t('ownerRemoveCodespace')}</button> : null}
      </div>
    </details>
    {busy ? <span role="status">{t('ownerWorking')}</span> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
