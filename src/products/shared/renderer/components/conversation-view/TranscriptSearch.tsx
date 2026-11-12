import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { MessageSearchHit } from '../../../../chat/shared/transcript.js';
import { searchConversationMessages } from '../../api/transcript.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';

export function TranscriptSearch({ channelId, titles, onClose, onSelect }: {
  channelId: string; titles: ReadonlyMap<string, string>; onClose(): void; onSelect?(id: string): void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null); const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [text, setText] = useState(''); const [all, setAll] = useState(false);
  const [hits, setHits] = useState<MessageSearchHit[] | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(false);
  useEffect(() => {
    const element = dialog.current; element?.showModal(); input.current?.focus();
    return () => { request.current?.abort(); element?.close(); };
  }, []);
  useEffect(() => { request.current?.abort(); request.current = null; setText(''); setHits(null); setLoading(false); setError(false); }, [channelId]);
  const clear = () => { request.current?.abort(); request.current = null; setHits(null); setLoading(false); setError(false); };
  async function submit(event: FormEvent) {
    event.preventDefault(); clear(); if (!text.trim()) return;
    const controller = new AbortController(); request.current = controller; setLoading(true);
    try {
      const result = await searchConversationMessages(text, { channelId: all ? undefined : channelId, limit: 50 }, controller.signal);
      if (request.current === controller && !controller.signal.aborted) setHits(result.hits);
    } catch { if (request.current === controller && !controller.signal.aborted) setError(true); }
    finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }
  return <dialog ref={dialog} className="transcriptSearchDialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id={titleId}>{t(messageKeys.transcriptSearch)}</h2>
      <button type="button" onClick={onClose} aria-label={t(messageKeys.transcriptSearchClose)}>×</button></header>
    <p>{t(messageKeys.conversationArchiveSearchNote)}</p>
    <form onSubmit={submit}>
      <label>{t(messageKeys.transcriptSearch)}<input ref={input} value={text} maxLength={200}
        onChange={event => { clear(); setText(event.target.value); }} type="search" /></label>
      <select aria-label={t(messageKeys.transcriptSearchScope)} value={all ? 'all' : 'current'}
        onChange={event => { clear(); setAll(event.target.value === 'all'); }}>
        <option value="current">{t(messageKeys.transcriptSearchCurrent)}</option>
        <option value="all">{t(messageKeys.transcriptSearchAll)}</option>
      </select>
      <button type="submit" disabled={loading || !text.trim()}>{t(loading ? messageKeys.transcriptLoading : messageKeys.transcriptSearch)}</button>
    </form>
    {error ? <p role="alert">{t(messageKeys.transcriptQueryFailed)}</p> : null}
    {hits?.length === 0 ? <p role="status">{t(messageKeys.transcriptSearchEmpty)}</p> : null}
    {hits ? <ol className="transcriptSearchResults">{hits.map(hit => <li key={`${hit.channelId}/${hit.message.id}`}>
      <div><strong>{titles.get(hit.channelId) ?? t(messageKeys.transcriptSearchConversation)}</strong>{' '}
        <time dateTime={hit.message.createdAt}>{new Date(hit.message.createdAt).toLocaleString()}</time>
        {onSelect && hit.channelId !== channelId ? <button type="button" onClick={() => { onSelect(hit.channelId); onClose(); }}>
          {t(messageKeys.transcriptSearchOpen)}</button> : null}</div>
      <p>{hit.message.body.slice(0, 400)}</p>
      {hit.message.body.length > 400 ? <details><summary>{t(messageKeys.transcriptSearchReadMore)}</summary><pre>{hit.message.body}</pre></details> : null}
    </li>)}</ol> : null}
  </dialog>;
}
