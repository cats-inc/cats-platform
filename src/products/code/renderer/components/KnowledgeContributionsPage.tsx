import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { LOCAL_KNOWLEDGE_API, type LocalKnowledgeWorkspace,
  type LocalKnowledgeTarget } from '../../../../platform/knowledge/localKnowledgeContracts.js';
import { expectJson } from '../../../shared/renderer/api/http.js';

function useKnowledgeLabels() {
  const { t } = useI18n();
  return {
    title: t(messageKeys.codeKnowledgeContributionsTitle),
    back: t(messageKeys.codeKnowledgeContributionsBack),
    intro: t(messageKeys.codeKnowledgeContributionsIntro),
    target: t(messageKeys.codeKnowledgeContributionsTarget),
    entry: t(messageKeys.codeKnowledgeContributionsEntry),
    source: t(messageKeys.codeKnowledgeContributionsSource),
    save: t(messageKeys.codeKnowledgeContributionsSave),
    pending: t(messageKeys.codeKnowledgeContributionsPending),
    before: t(messageKeys.codeKnowledgeContributionsBefore),
    after: t(messageKeys.codeKnowledgeContributionsAfter),
    empty: t(messageKeys.codeKnowledgeContributionsEmpty),
    review: t(messageKeys.codeKnowledgeContributionsReview),
    adopt: t(messageKeys.codeKnowledgeContributionsAdopt),
    revoke: t(messageKeys.codeKnowledgeContributionsRevoke),
    delete: t(messageKeys.codeKnowledgeContributionsDelete),
    deleteNotice: t(messageKeys.codeKnowledgeContributionsDeleteNotice),
    deleteConfirm: t(messageKeys.codeKnowledgeContributionsDeleteConfirm),
    deleteCancel: t(messageKeys.codeKnowledgeContributionsDeleteCancel),
    active: t(messageKeys.codeKnowledgeContributionsActive),
    draft: t(messageKeys.codeKnowledgeContributionsDraft),
    stale: t(messageKeys.codeKnowledgeContributionsStale),
    refresh: t(messageKeys.codeKnowledgeContributionsRefresh),
    failed: t(messageKeys.codeKnowledgeContributionsFailed),
    saved: t(messageKeys.codeKnowledgeContributionsSaved),
    english: t(messageKeys.codeKnowledgeLanguageEnglish),
    chinese: t(messageKeys.codeKnowledgeLanguageChinese),
    limits: t(messageKeys.codeKnowledgeContributionsLimits),
    catlas: t(messageKeys.codeKnowledgeTargetCatlas),
    orchestrator: t(messageKeys.codeKnowledgeTargetOrchestrator),
  };
}
type Draft = LocalKnowledgeWorkspace['drafts'][number];
type Labels = ReturnType<typeof useKnowledgeLabels>;
const textStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '18rem', overflow: 'auto' } as const;

function DraftCard({ draft, labels, busy, act }: { draft: Draft; labels: Labels; busy: boolean;
  act: (action: 'adopt' | 'revoke' | 'delete', id: string) => void }) {
  const [reviewed, setReviewed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return <article className="operatorCard">
    <h3>{labels[draft.target]} · {draft.entryId}</h3>
    <p>{draft.active ? labels.active : labels.draft}</p>
    {draft.note && <p>{draft.note}</p>}
    {draft.stale && <p role="status">{labels.stale}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
      {(['before', 'content'] as const).map(field => <div key={field}>
        <h4>{field === 'before' ? labels.before : labels.after}</h4>
        <p lang="zh-TW" style={textStyle}>{draft[field]['zh-TW']}</p>
        <details><summary>{labels.english}</summary><p lang="en" style={textStyle}>{draft[field].en}</p></details>
      </div>)}
    </div>
    {draft.active ? <button className="operatorActionButton" disabled={busy} onClick={() => act('revoke', draft.id)}>{labels.revoke}</button>
      : !draft.stale && <div>
        <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} /> {labels.review}</label>
        <p><button className="operatorActionButton" disabled={busy || !reviewed} onClick={() => act('adopt', draft.id)}>{labels.adopt}</button></p>
      </div>}
    {deleting ? <div>
      <p>{labels.deleteNotice}</p>
      <button className="operatorActionButton" disabled={busy} onClick={() => act('delete', draft.id)}>{labels.deleteConfirm}</button>{' '}
      <button className="operatorActionButton" disabled={busy} onClick={() => setDeleting(false)}>{labels.deleteCancel}</button>
    </div> : <button className="operatorActionButton" disabled={busy} onClick={() => setDeleting(true)}>{labels.delete}</button>}
  </article>;
}

export function KnowledgeContributionsPage() {
  const labels = useKnowledgeLabels();
  const [data, setData] = useState<LocalKnowledgeWorkspace | null>(null);
  const [target, setTarget] = useState<LocalKnowledgeTarget>('catlas');
  const [entryId, setEntryId] = useState('');
  const [en, setEn] = useState(''), [zh, setZh] = useState(''), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function reload() {
    setBusy(true); setError('');
    try { setData(await expectJson<LocalKnowledgeWorkspace>(await fetch(LOCAL_KNOWLEDGE_API, { cache: 'no-store' }), labels.failed)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : labels.failed); }
    finally { setBusy(false); }
  }
  useEffect(() => { void reload(); }, []);
  const entries = data?.targets.find(row => row.target === target)?.entries ?? [];
  const selected = entries.find(row => row.id === entryId) ?? entries[0];
  useEffect(() => {
    setEn(selected?.content.en ?? ''); setZh(selected?.content['zh-TW'] ?? '');
  }, [target, selected?.id, data?.revision]);
  async function change(action: Record<string, unknown>) {
    if (!data || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await expectJson<LocalKnowledgeWorkspace>(await fetch(LOCAL_KNOWLEDGE_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, revision: data.revision }),
      }), labels.failed);
      setData(next); setNote(''); setMessage(labels.saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : labels.failed); }
    finally { setBusy(false); }
  }
  return <div className="codeArtifactDetailView">
    <section className="operatorPanel">
      <div className="operatorPanelHeader"><h2>{labels.title}</h2><Link to="/code/artifacts">{labels.back}</Link></div>
      <p>{labels.intro}</p><p>{labels.limits}</p>
      <button className="operatorActionButton" disabled={busy} onClick={() => void reload()}>{labels.refresh}</button>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <form onSubmit={event => { event.preventDefault(); void change({ action: 'submit', target, entryId: selected?.id, content: { en, 'zh-TW': zh }, note }); }}>
        <fieldset disabled={busy || !selected} style={{ border: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
          <label>{labels.target} <select value={target} onChange={event => { setTarget(event.target.value as LocalKnowledgeTarget); setEntryId(''); }}>
            <option value="catlas">{labels.catlas}</option><option value="orchestrator">{labels.orchestrator}</option>
          </select></label>
          <label>{labels.entry} <select value={selected?.id ?? ''} onChange={event => setEntryId(event.target.value)}>
            {entries.map(entry => <option key={entry.id} value={entry.id}>{entry.id}</option>)}
          </select></label>
          <label>{labels.chinese}<textarea aria-label={labels.chinese} value={zh} required maxLength={4000} rows={5} style={{ width: '100%' }} onChange={event => setZh(event.target.value)} /></label>
          <label>{labels.english}<textarea aria-label={labels.english} value={en} required maxLength={4000} rows={5} style={{ width: '100%' }} onChange={event => setEn(event.target.value)} /></label>
          <label>{labels.source}<textarea value={note} maxLength={1000} rows={2} style={{ width: '100%' }} onChange={event => setNote(event.target.value)} /></label>
          <button className="operatorActionButton" type="submit">{labels.save}</button>
        </fieldset>
      </form>
    </section>
    <section className="operatorPanel"><h2>{labels.pending}</h2>
      {!data?.drafts.length && <p>{labels.empty}</p>}
      {data?.drafts.map(draft => <DraftCard key={`${draft.id}:${data.revision}`} draft={draft} labels={labels} busy={busy}
        act={(action, id) => void change({ action, id, ...(action === 'adopt' ? { confirm: 'manual-local-unverified' }
          : action === 'delete' ? { confirm: 'delete-local-contribution' } : {}) })} />)}
    </section>
  </div>;
}
