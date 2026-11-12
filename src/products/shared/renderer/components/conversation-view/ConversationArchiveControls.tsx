import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import type { useConversationArchive } from '../../hooks/useConversationArchive.js';

type Control = ReturnType<typeof useConversationArchive>;

export function ConversationArchiveControls({ control, disabled = false }: { control: Control; disabled?: boolean }) {
  const { t } = useI18n();
  if (!control.available) return null;
  return <>
    <button type="button" className="transcriptSearchButton" disabled={disabled || Boolean(control.busy) || control.needsRefresh}
      aria-busy={Boolean(control.busy) || undefined} onClick={() => void control.act()}>
      {t(control.busy === 'archive' ? messageKeys.conversationArchiving : control.busy === 'restore' ? messageKeys.conversationRestoring
        : control.archived ? messageKeys.conversationRestore : messageKeys.conversationArchive)}</button>
    {control.needsRefresh ? <button type="button" className="transcriptSearchButton" disabled={Boolean(control.busy)}
      onClick={() => void control.refresh()}>{t(messageKeys.conversationArchiveRefresh)}</button> : null}
  </>;
}

export function ConversationArchiveFeedback({ control }: { control: Control }) {
  const { t } = useI18n();
  if (!control.error) return null;
  const label = control.error === 'archive_refresh_failed' ? messageKeys.conversationArchiveRefreshFailed
    : control.error === 'archive_active' ? messageKeys.conversationArchiveActive
      : ['archive_busy', 'archive_changed', 'stale_message_cursor'].includes(control.error) ? messageKeys.conversationArchiveChanged
        : control.error === 'archive_invalid' ? messageKeys.conversationArchiveInvalid : messageKeys.conversationArchiveFailed;
  return <p role="alert" className="conversationArchiveNotice">{t(label)}</p>;
}
