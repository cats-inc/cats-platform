import type { TranscriptHistory, TranscriptHistoryState } from '../../transcriptHistory.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';

export function TranscriptHistoryControls({ history, state }: { history: TranscriptHistory; state: TranscriptHistoryState }) {
  const { t } = useI18n();
  if (!state.nextCursor && !state.expanded && !state.changed && !state.error && !state.loading) return null;
  return <div className="transcriptHistoryControls" aria-busy={state.loading}>
    {state.changed ? <span role="status">{t(messageKeys.transcriptHistoryChanged)}</span> : null}
    {state.error ? <span role="alert">{t(messageKeys.transcriptQueryFailed)}</span> : null}
    {state.nextCursor ? <button type="button" disabled={state.loading} onClick={() => { void history.loadOlder(); }}>
      {t(state.loading ? messageKeys.transcriptLoading : messageKeys.transcriptLoadOlder)}</button> : null}
    {state.expanded || state.changed || state.error ? <button type="button" disabled={state.loading} onClick={() => { void history.reload(); }}>
      {t(messageKeys.transcriptShowLatest)}</button> : null}
    {state.loading && !state.nextCursor ? <span role="status">{t(messageKeys.transcriptLoading)}</span> : null}
  </div>;
}
