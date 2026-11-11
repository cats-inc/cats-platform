import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CompanionBoxStore } from '../state/companion-box/storeTypes.js';
import { CompanionPostError, companionPostRevision } from './postService.js';
import { CompanionMediaStore } from './mediaStore.js';
import { projectCompanionProfile } from './profileReadModel.js';
import { sendCompanionMedia } from '../api/companionPublicationRoutes.js';
import type { CompanionSnapshot } from './contracts.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const activePost = (snapshot: CompanionSnapshot, catId: string, postId: string) => {
  const post = snapshot.derived.find(row => `post:${row.id}` === postId && row.catId === catId
    && row.metadata.profileSurface === 'post' && row.metadata.profilePostStatus !== 'removed');
  if (!post) throw new CompanionPostError('companion_post_not_found', 404);
  return post;
};

/** A public grant exposes one post and its attached managed assets, never a source folder. */
export class CompanionShareService {
  constructor(private readonly store: CompanionBoxStore, private readonly media: CompanionMediaStore,
    private readonly origin: () => string | undefined, private readonly author: (catId: string) => Promise<string | null>,
    private readonly now: () => Date = () => new Date()) {}

  private publicOrigin() {
    const origin = this.origin();
    if (!origin) throw new CompanionPostError('remote_access_required', 409);
    return new URL(origin).origin;
  }

  async create(catId: string, postId: string, assertAllowed: (snapshot: CompanionSnapshot) => void = () => {}) {
    return this.store.transaction(snapshot => {
      assertAllowed(snapshot);
      return this.createInSnapshot(snapshot, catId, postId);
    });
  }

  /** Used by notification admission to commit the grant and outbox row together. */
  createInSnapshot(snapshot: CompanionSnapshot, catId: string, postId: string) {
    const origin = this.publicOrigin();
    activePost(snapshot, catId, postId);
    let grant = snapshot.shareGrants.find(row => row.catId === catId && row.postId === postId && !row.revokedAt);
    if (!grant) {
      const token = randomBytes(32).toString('base64url');
      grant = { id: randomUUID(), catId, postId, token, tokenHash: hash(token), createdAt: this.now().toISOString(), revokedAt: null };
      snapshot.shareGrants.push(grant); snapshot.updatedAt = grant.createdAt;
    }
    return { url: `${origin}/s/companion/${grant.token}`, grantId: grant.id };
  }

  async revoke(catId: string, postId: string) {
    return this.store.transaction(snapshot => {
      activePost(snapshot, catId, postId);
      const now = this.now().toISOString();
      for (const row of snapshot.shareGrants.filter(row => row.catId === catId && row.postId === postId)) row.revokedAt ??= now;
      for (const row of snapshot.publicationIntents.filter(row => row.catId === catId && row.postId === postId)) {
        row.followupState = 'complete'; row.error = 'post_share_revoked'; row.updatedAt = now;
      }
      for (const row of snapshot.notificationIntents.filter(row => row.catId === catId && row.postId === postId && ['pending', 'failed'].includes(row.state))) {
        row.state = 'suppressed'; row.updatedAt = now;
      }
      snapshot.updatedAt = now;
      return { revoked: true };
    });
  }

  async link(catId: string, postId: string, revision?: number, grantId?: string) {
    const origin = this.publicOrigin();
    const snapshot = await this.store.readSnapshot();
    const post = activePost(snapshot, catId, postId);
    if (revision !== undefined && companionPostRevision(post) !== revision) throw new CompanionPostError('post_revision_conflict', 409);
    const grant = snapshot.shareGrants.find(row => row.catId === catId && row.postId === postId && !row.revokedAt && (!grantId || row.id === grantId));
    if (!grant) throw new CompanionPostError('post_share_revoked', 409);
    return { url: `${origin}/s/companion/${grant.token}`, post };
  }

  async route(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!pathname.startsWith('/s/companion/')) return false;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-robots-tag', 'noindex, nofollow, noarchive');
    const missing = () => { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end(request.method === 'HEAD' ? undefined : 'This post is unavailable.'); };
    if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405, { allow: 'GET, HEAD' }); response.end(); return true; }
    const match = /^\/s\/companion\/([A-Za-z0-9_-]{43})(?:\/media\/([a-f0-9-]{36}))?$/u.exec(pathname);
    if (!match) { missing(); return true; }
    try {
      const snapshot = await this.store.readSnapshot();
      const grant = snapshot.shareGrants.find(row => row.tokenHash === hash(match[1]!) && !row.revokedAt);
      if (!grant) { missing(); return true; }
      const record = activePost(snapshot, grant.catId, grant.postId);
      const post = projectCompanionProfile({ derived: [record], mediaAssets: snapshot.mediaAssets }).posts[0]!;
      const author = await this.author(grant.catId);
      if (!author) { missing(); return true; }
      if (match[2]) {
        if (!post.attachments?.some(row => row.assetId === match[2])) { missing(); return true; }
        const media = await this.media.read(grant.catId, match[2]);
        // Recheck after reading the file; deletion/revocation must not reveal its bytes.
        await this.assertGrant(grant.id, companionPostRevision(record), match[2]);
        sendCompanionMedia(request, response, media.data, media.asset.mimeType);
        return true;
      }
      const prefix = `/s/companion/${grant.token}`;
      const publicOrigin = this.origin();
      const image = post.attachments?.find(row => row.kind === 'image');
      const mediaHtml = (post.attachments ?? []).map(item => item.kind === 'image'
        ? `<img src="${prefix}/media/${item.assetId}" alt="${escapeHtml(item.alt)}" width="${item.width}" height="${item.height}">`
        : `<video src="${prefix}/media/${item.assetId}" controls playsinline preload="metadata" aria-label="${escapeHtml(item.alt)}"></video>`).join('');
      const title = `${author} · Cats`;
      const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(post.body.slice(0, 200))}">
${image && publicOrigin ? `<meta property="og:image" content="${escapeHtml(new URL(`${prefix}/media/${image.assetId}`, publicOrigin).href)}">` : ''}
<style>body{margin:0;background:#f3f1ed;color:#302c29;font:16px system-ui,sans-serif}main{max-width:660px;margin:40px auto;border:1px solid #e7e2db;background:#fff;border-radius:18px;overflow:hidden}header{padding:24px 28px 10px;display:flex;gap:12px;align-items:center}header b{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#efe6da;color:#806644}h1{font-size:16px;margin:0 0 5px}time,small{font-size:12px;color:#8b8178}.text{padding:10px 28px 24px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}img,video{display:block;width:100%;height:auto;max-height:85vh;object-fit:contain;background:#eee}footer{padding:20px 28px;font-size:12px;color:#8b8178}@media(max-width:680px){main{margin:0;border-radius:0;min-height:100vh;border:0}}</style>
<main><header><b>${escapeHtml(author.slice(0, 1))}</b><div><h1>${escapeHtml(author)}</h1><time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(post.publishedAt.slice(0, 16).replace('T', ' '))}</time>${post.aiGenerated ? ' · <small>AI 創作 · AI created</small>' : ''}</div></header>
<div class="text">${escapeHtml(post.body)}</div>${mediaHtml}<footer>Shared from Cats</footer></main></html>`;
      await this.assertGrant(grant.id, companionPostRevision(record));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': String(Buffer.byteLength(html)),
        'content-security-policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
      response.end(request.method === 'HEAD' ? undefined : html);
    } catch { missing(); }
    return true;
  }

  private async assertGrant(id: string, revision: number, assetId?: string) {
    const snapshot = await this.store.readSnapshot();
    const grant = snapshot.shareGrants.find(row => row.id === id && !row.revokedAt);
    if (!grant) throw new CompanionPostError('post_share_revoked', 404);
    const post = activePost(snapshot, grant.catId, grant.postId);
    if (companionPostRevision(post) !== revision) throw new CompanionPostError('post_revision_conflict', 409);
    if (assetId && (!Array.isArray(post.metadata.profilePostAttachments)
      || !post.metadata.profilePostAttachments.some(item => item?.assetId === assetId))) throw new CompanionPostError('companion_media_not_found', 404);
  }
}
