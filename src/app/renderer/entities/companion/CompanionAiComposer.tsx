import { useEffect, useRef, useState } from 'react';
import { companionPublicationRequest, getCompanionMedia, type CompanionMediaLibrary } from '../../../../products/chat/renderer/api/companion.js';
import type { CompanionMediaAsset } from '../../../../core/companionPublicationContracts.js';
import { useI18n } from '../../i18n/useI18n.js';
import { messageKeys as keys } from '../../../../shared/i18n/index.js';

export function CompanionAiComposer({ catId, body, onQueued }: { catId: string; body: string; onQueued(): void }) {
  const { t } = useI18n();
  const [library, setLibrary] = useState<CompanionMediaLibrary | null>(null);
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const changed = () => { requestKey.current = crypto.randomUUID(); };
  useEffect(() => { changed(); }, [body]);
  async function load() {
    try { setLibrary(await getCompanionMedia(catId)); } catch { setError(t(keys.postActionFailed)); }
  }
  async function importSource(path: string) {
    if (!path) return; setBusy(true); setError(null);
    try {
      const result = await companionPublicationRequest<{ asset: CompanionMediaAsset }>(catId, 'media-import', 'POST', { path });
      await load(); setSelected([result.asset.id]); changed();
    } catch { setError(t(keys.postUploadFailed)); } finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setError(null);
    try {
      await companionPublicationRequest(catId, 'generations', 'POST', { requestKey: requestKey.current, prompt, body, kind,
        referenceAssetIds: selected, ...(kind === 'video' ? { durationSeconds: 6 } : {}) });
      setPrompt(''); setSelected([]); changed(); onQueued();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(t(message === 'reference_image_required' ? keys.postReferenceRequired
        : ['image_profile_unavailable', 'image_runtime_upgrade_required', 'image_service_unavailable'].includes(message) ? keys.postGenerationUnavailable : keys.postGenerationFailed));
    } finally { setBusy(false); }
  }
  return <details className="companionAiComposer" onToggle={event => { if (event.currentTarget.open) void load(); }}>
    <summary>✧ {t(keys.postCreateAi)}</summary>
    <div className="companionAiFields">
      <label>{t(keys.postAiPrompt)}<textarea value={prompt} maxLength={2000} rows={3} disabled={busy}
        placeholder={t(keys.postAiPromptExample)} onChange={event => { setPrompt(event.target.value); changed(); }} /></label>
      <label>{t(keys.postAiFormat)}<select value={kind} disabled={busy} onChange={event => {
        const next = event.target.value as 'image' | 'video'; setKind(next); if (next === 'video') setSelected(rows => rows.slice(0, 1)); changed();
      }}><option value="image">{t(keys.postAiImage)}</option><option value="video">{t(keys.postAiVideo)}</option></select></label>
      <p className="companionPostMeta">{t(keys.postAiReferenceHint)}</p>
      <div className="companionReferencePicker">{library?.assets.filter(asset => library.settings.useProfileImages || !['avatar', 'cover'].includes(asset.origin)).map(asset =>
        <label key={asset.id} className={selected.includes(asset.id) ? 'selected' : ''}>
          <input type="checkbox" checked={selected.includes(asset.id)} disabled={busy || (!selected.includes(asset.id) && selected.length >= (kind === 'video' ? 1 : 3))}
            onChange={event => { setSelected(rows => event.target.checked ? [...rows, asset.id] : rows.filter(id => id !== asset.id)); changed(); }} />
          {asset.kind === 'image' ? <img src={`/api/cats/${encodeURIComponent(catId)}/companion-box/media/${asset.id}`} alt="" /> : <span aria-hidden="true">▶</span>}
          <span>{t(asset.origin === 'avatar' ? keys.postReferenceAvatar : asset.origin === 'cover' ? keys.postReferenceCover : asset.kind === 'video' ? keys.postReferenceVideo : keys.postReferencePhoto)}</span>
        </label>)}</div>
      {!!library?.sourceFiles.length && <label>{t(keys.postSourceFolder)}<select disabled={busy} value="" onChange={event => void importSource(event.target.value)}>
        <option value="">{t(keys.postChooseSource)}</option>{library.sourceFiles.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}
      </select></label>}
      {error && <p role="alert" className="companionPostError">{error}</p>}
      <button type="button" className="companionHeaderAction companionHeaderActionPrimary" disabled={busy || !prompt.trim()} onClick={() => void generate()}>
        {t(busy ? keys.postPublishing : keys.postGeneratePublish)}</button>
    </div>
  </details>;
}

export function CompanionPendingPosts({ catId, onChanged }: { catId: string; onChanged(): void }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Array<{ id: string; body: string; state: string; error: string | null }>>([]);
  const [cancelError, setCancelError] = useState(false);
  const prior = useRef<string | null>(null); const refresh = useRef(onChanged); refresh.current = onChanged;
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const result = await companionPublicationRequest<{ publications: typeof items }>(catId, 'generations');
        if (!active) return;
        const signature = JSON.stringify(result.publications);
        if (prior.current !== null && signature !== prior.current) refresh.current();
        prior.current = signature; setItems(result.publications);
      } catch { /* Keep pending work visible during temporary loss of connection. */ }
    };
    void poll(); const timer = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [catId]);
  return <>{cancelError && <p role="alert" className="companionPostError">{t(keys.postActionFailed)}</p>}{items.map(item => <article key={item.id} className="companionPendingPost" role="status">
    <strong>✧ {t(item.state === 'failed' ? keys.postGenerationFailed : keys.postGenerationPending)}</strong>
    <p>{item.body}</p><button type="button" onClick={() => { void companionPublicationRequest(catId, `generations/${item.id}`, 'DELETE')
      .then(() => { setCancelError(false); setItems(rows => rows.filter(row => row.id !== item.id)); onChanged(); }).catch(() => setCancelError(true)); }}>{t(keys.postCancel)}</button>
  </article>)}</>;
}
