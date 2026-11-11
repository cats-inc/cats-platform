import { useEffect, useRef, useState } from 'react';
import type { ChatCat } from '../../../../products/chat/api/contracts.js';
import type { CompanionProfilePost } from '../../../../products/chat/companion/profileReadModel.js';
import { companionPublicationRequest, updateCompanionPost } from '../../../../products/chat/renderer/api/companion.js';
import { useI18n } from '../../i18n/useI18n.js';
import { messageKeys as keys } from '../../../../shared/i18n/index.js';

function PhotoViewer({ url, alt, onClose }: { url: string; alt: string; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="companionPhotoViewer" onCancel={onClose} onClick={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <button type="button" autoFocus onClick={onClose} aria-label={t(keys.postCloseMedia)}>×</button>
    <img src={url} alt={alt} />
  </dialog>;
}

export function CompanionPostCard({ cat, post, onChanged, onRemove }: {
  cat: ChatCat; post: CompanionProfilePost; onChanged?(): void; onRemove?(post: CompanionProfilePost): void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(post.body);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ url: string; alt: string } | null>(null);
  const mutationKey = useRef(crypto.randomUUID());
  async function save() {
    setBusy(true); setNotice(null);
    try {
      await updateCompanionPost(cat.id, post.id, { requestKey: mutationKey.current, expectedRevision: post.revision ?? 1, body });
      setEditing(false); onChanged?.();
    } catch { setNotice(t(keys.postActionFailed)); }
    finally { setBusy(false); }
  }
  async function share(revoke = false) {
    setBusy(true); setNotice(null);
    try {
      const result = await companionPublicationRequest<{ url: string }>(cat.id, `posts/${encodeURIComponent(post.id)}/share`, revoke ? 'DELETE' : 'POST', revoke ? undefined : {});
      setShareUrl(revoke ? null : result.url);
      if (revoke) setNotice(t(keys.postRevokeDone));
      onChanged?.();
    } catch (error) {
      setNotice(t(error instanceof Error && error.message === 'remote_access_required' ? keys.postRemoteRequired : keys.postActionFailed));
    } finally { setBusy(false); }
  }
  async function notify(destination: 'dm' | 'telegram') {
    setBusy(true); setNotice(null);
    try {
      const result = await companionPublicationRequest<{ notification: { state: string } }>(cat.id, `posts/${encodeURIComponent(post.id)}/notify`, 'POST', { destination, retry: true });
      setNotice(t(result.notification.state === 'sent' ? keys.postNotifySent : result.notification.state === 'uncertain' ? keys.postNotifyUncertain : ['failed', 'suppressed'].includes(result.notification.state) ? keys.postNotifyFailed : keys.postNotifyQueued));
    } catch { setNotice(t(keys.postActionFailed)); }
    finally { setBusy(false); }
  }
  const date = new Date(post.publishedAt);
  return <article className="companionProfilePostCard" data-post-id={post.id}>
    <header className="companionProfilePostHeader">
      {cat.avatarUrl ? <img src={cat.avatarUrl} className="companionPostAvatar" alt="" />
        : <span className="companionPostAvatar companionPostInitial" style={{ background: cat.avatarColor ?? undefined }}>{cat.name.slice(0, 1)}</span>}
      <div className="companionPostIdentity"><strong>{cat.name}</strong>
        <div className="companionPostMeta"><time dateTime={post.publishedAt} title={date.toLocaleString()}>
          {date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </time><span aria-hidden="true"> · </span><span>{t((shareUrl || post.shared) ? keys.postSharedVisibility : keys.postOwnerOnly)}</span>
          {(post.revision ?? 1) > 1 && <span> · {t(keys.postEdited)}</span>}</div>
      </div>
      {post.aiGenerated && <span className="companionPostAi">✧ {t(keys.postAi)}</span>}
      {(onRemove || onChanged) && <details className="companionPostMenu">
        <summary aria-label={t(keys.postMore)}>•••</summary>
        <div>{onChanged && <button type="button" onClick={() => {
          setBody(post.body); setEditing(true); mutationKey.current = crypto.randomUUID();
        }}>{t(keys.postEdit)}</button>}
          {onRemove && <button type="button" className="companionActionButton companionActionSecondary" onClick={() => onRemove(post)}>
            {t(keys.chatCompanionPostRemoveAction)}</button>}
          {onChanged && <button type="button" disabled={busy} onClick={() => void share(true)}>{t(keys.postRevoke)}</button>}
        </div>
      </details>}
    </header>
    {editing ? <div className="companionPostEditor">
      <textarea value={body} maxLength={4000} rows={4} disabled={busy} aria-label={t(keys.postEdit)}
        onChange={event => { setBody(event.target.value); mutationKey.current = crypto.randomUUID(); }} />
      <div><button type="button" disabled={busy} onClick={() => setEditing(false)}>{t(keys.postCancel)}</button>
        <button type="button" disabled={busy} onClick={() => void save()}>{t(keys.postSave)}</button></div>
    </div> : <div className="companionPostText">
      {post.title && post.title !== '(Untitled post)' && <h3 className="companionProfilePostTitle">{post.title}</h3>}
      {post.body && <p className="companionProfilePostBody">{post.body}</p>}
    </div>}
    {(post.attachments?.length ?? 0) > 0 && <div className="companionProfilePostMediaGrid" data-count={Math.min(post.attachments!.length, 3)}>
      {post.attachments!.map(item => item.kind === 'video'
        ? <video key={item.assetId} src={item.url} controls playsInline preload="metadata" aria-label={item.alt} />
        : <button type="button" key={item.assetId} onClick={() => setPhoto(item)} aria-label={item.alt || t(keys.postPreview)}>
          <img src={item.url} alt={item.alt} loading="lazy" width={item.width} height={item.height} />
        </button>)}
    </div>}
    {post.mediaRefs.length > 0 && !post.attachments?.length && <p className="companionPostMeta companionPostText">{t(keys.postMediaUnavailable)}</p>}
    {post.tags.length > 0 && <div className="companionProfilePostTags">{post.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
    {onChanged && <footer className="companionPostActions">
      <button type="button" disabled={busy} onClick={() => void share()}>↗ {t(keys.postShare)}</button>
      <button type="button" disabled={busy} onClick={() => void notify('dm')}>{t(keys.postNotifyDm)}</button>
      <button type="button" disabled={busy} onClick={() => void notify('telegram')}>{t(keys.postNotifyTelegram)}</button>
    </footer>}
    {shareUrl && <div className="companionPostShare"><a href={shareUrl} target="_blank" rel="noreferrer">{t(keys.postShared)}</a>
      <input value={shareUrl} readOnly aria-label={t(keys.postShared)} onFocus={event => event.target.select()} />
      <button type="button" onClick={() => { void navigator.clipboard.writeText(shareUrl)
        .then(() => setNotice(t(keys.postLinkCopied))).catch(() => setNotice(t(keys.postActionFailed))); }}>{t(keys.postCopyLink)}</button>
    </div>}
    {notice && <p className="companionPostNotice" role="status">{notice}</p>}
    {photo && <PhotoViewer {...photo} onClose={() => setPhoto(null)} />}
  </article>;
}
