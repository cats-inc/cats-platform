import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { LOCAL_KNOWLEDGE_API, type LocalKnowledgeWorkspace,
  type LocalKnowledgeTarget } from '../../../../platform/knowledge/localKnowledgeContracts.js';
import { expectJson } from '../../../shared/renderer/api/http.js';

const copy = {
  en: { title: 'Knowledge contributions', back: 'Artifacts', intro: 'Paste an agent’s proposed text, save a draft, then review and adopt it locally. No model call is made here. Local adoption affects the next Catlas or Orchestrator request; it is not verified publication.',
    target: 'Used by', entry: 'Knowledge entry', source: 'Source / reason (optional)', save: 'Save contribution',
    pending: 'Contributions', before: 'Text when submitted', after: 'Proposed text', empty: 'No contributions yet.',
    review: 'I reviewed both languages and want to use this unverified contribution locally.', adopt: 'Adopt locally',
    revoke: 'Revoke and restore bundled text', active: 'Locally adopted · manually reviewed', draft: 'Draft · not adopted',
    stale: 'Bundled knowledge changed; submit a fresh draft.', refresh: 'Reload', failed: 'Unable to update knowledge.', saved: 'Saved.',
    english: 'English', chinese: 'Traditional Chinese', limits: 'Only this entry’s text changes. Permissions and available operations stay the same.',
  },
  'zh-TW': { title: '知識貢獻', back: '成品', intro: '貼上 agent 提出的內容，儲存草稿，再檢查並採用到本機。這裡不會呼叫模型。採用後會在 Catlas 或 Orchestrator 下次請求生效，並不代表已驗證或發布。',
    target: '使用對象', entry: '知識項目', source: '來源／修改原因（選填）', save: '儲存貢獻',
    pending: '貢獻紀錄', before: '提交時的內容', after: '建議內容', empty: '尚無貢獻。',
    review: '我已檢查兩種語言，願意在本機使用這份未驗證的貢獻。', adopt: '採用到本機',
    revoke: '撤回並恢復隨附知識', active: '本機已採用・人工檢查', draft: '草稿・尚未採用',
    stale: '隨附知識版本已變更，請重新提交草稿。', refresh: '重新載入', failed: '無法更新知識。', saved: '已儲存。',
    english: '英文', chinese: '繁體中文', limits: '只修改這一筆知識的文字，不變更權限或可用操作。',
  },
};
type Draft = LocalKnowledgeWorkspace['drafts'][number];
type Labels = typeof copy.en;
const textStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '18rem', overflow: 'auto' } as const;

function DraftCard({ draft, labels, busy, act }: { draft: Draft; labels: Labels; busy: boolean;
  act: (action: 'adopt' | 'revoke', id: string) => void }) {
  const [reviewed, setReviewed] = useState(false);
  return <article className="operatorCard">
    <h3>{draft.target === 'catlas' ? 'Catlas' : 'Orchestrator'} · {draft.entryId}</h3>
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
  </article>;
}

export function KnowledgeContributionsPage() {
  const { locale } = useI18n(), labels = copy[locale];
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
            <option value="catlas">Catlas</option><option value="orchestrator">Orchestrator</option>
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
        act={(action, id) => void change({ action, id, ...(action === 'adopt' ? { confirm: 'manual-local-unverified' } : {}) })} />)}
    </section>
  </div>;
}
