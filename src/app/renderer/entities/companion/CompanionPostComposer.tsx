import { CompanionAiComposer } from './CompanionAiComposer.js';
import { useRef, useState } from 'react';
import type { ChatCat } from '../../../../products/chat/api/contracts.js';
import { createCompanionPost, uploadCompanionMedia } from '../../../../products/chat/renderer/api/companion.js';
import { useI18n } from '../../i18n/useI18n.js';
import { messageKeys as keys } from '../../../../shared/i18n/index.js';

export function CompanionPostComposer({ cat, onPublished }: { cat: ChatCat; onPublished(): void }) {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<Array<{ assetId: string; alt: string; url: string; kind: 'image' | 'video' }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const changed = () => { requestKey.current = crypto.randomUUID(); };
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try {
      for (const file of Array.from(files).slice(0, 10 - attachments.length)) {
        const result = await uploadCompanionMedia(cat.id, file);
        setAttachments(rows => rows.some(row => row.assetId === result.asset.id) ? rows : [...rows, { assetId: result.asset.id, alt: file.name, url: result.url, kind: result.asset.kind }]);
        changed();
      }
    } catch { setError(t(keys.postUploadFailed)); }
    finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true); setError(null);
    try {
      await createCompanionPost(cat.id, { requestKey: requestKey.current, body,
        attachments: attachments.map(({ assetId, alt }) => ({ assetId, alt })) });
      setBody(''); setAttachments([]); changed(); onPublished();
    } catch { setError(t(keys.postActionFailed)); }
    finally { setBusy(false); }
  }
  return <section className="companionPostComposer" aria-label={t(keys.postComposeTitle)}>
    <div className="companionComposerIdentity">
      {cat.avatarUrl ? <img className="companionPostAvatar" src={cat.avatarUrl} alt="" />
        : <span className="companionPostAvatar companionPostInitial" style={{ background: cat.avatarColor ?? undefined }}>{cat.name.slice(0, 1)}</span>}
      <label className="companionComposerField">
        <span className="companionComposerLabel">{t(keys.postComposeTitle)}</span>
        <textarea value={body} disabled={busy} maxLength={4000} rows={3}
          placeholder={t(keys.postComposePlaceholder, { name: cat.name })}
          onChange={event => { setBody(event.target.value); changed(); }} />
      </label>
    </div>
    {attachments.length > 0 && <div className="companionComposerPreviews">{attachments.map(item => <div key={item.assetId}>
      {item.kind === 'video' ? <video src={item.url} controls preload="metadata" /> : <img src={item.url} alt={item.alt} />}
      <button type="button" disabled={busy} aria-label={t(keys.postRemoveMedia)} onClick={() => {
        setAttachments(rows => rows.filter(row => row.assetId !== item.assetId)); changed();
      }}>×</button>
    </div>)}</div>}
    {error && <p role="alert" className="companionPostError">{error}</p>}
    <footer className="companionComposerActions">
      <label className="companionPhotoButton" aria-disabled={busy || attachments.length >= 10}>
        <span aria-hidden="true">▧</span> {t(keys.postPhoto)}
        <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple disabled={busy || attachments.length >= 10}
          onChange={event => { void upload(event.target.files); event.target.value = ''; }} />
      </label>
      <button type="button" className="companionHeaderAction companionHeaderActionPrimary"
        disabled={busy || (!body.trim() && attachments.length === 0)} onClick={() => void publish()}>
        {t(busy ? keys.postPublishing : keys.postPublish)}
      </button>
    </footer>
    <CompanionAiComposer catId={cat.id} body={body} onQueued={() => { setBody(''); setAttachments([]); changed(); onPublished(); }} />
  </section>;
}
