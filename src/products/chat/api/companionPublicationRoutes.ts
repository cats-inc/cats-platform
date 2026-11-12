import { readConversationCatalog } from './scopedConversationState.js';
import { MEDIA_MAX_BYTES } from '../../../runtime/media.js';
import { MediaImageError } from '../../../platform/multimedia/imageExecution.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { matchRoute, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { requireCat } from '../state/model/index.js';
import { CompanionPostError, CompanionPostService } from '../companion/postService.js';
import { CompanionMediaStore, COMPANION_IMAGE_MAX_BYTES, companionMediaUrl } from '../companion/mediaStore.js';
import { projectCompanionProfile } from '../companion/profileReadModel.js';
import { handleCanonicalCatError, type ChatApiRouteContext } from './routeSupport.js';

async function body(request: IncomingMessage, limit: number): Promise<Buffer> {
  const parts: Buffer[] = []; let bytes = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.length;
    if (bytes > limit) throw new CompanionPostError('request_too_large');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
async function json(request: IncomingMessage) {
  try {
    const value: unknown = JSON.parse((await body(request, 64 * 1024)).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof CompanionPostError) throw error;
    throw new CompanionPostError('invalid_publication_request');
  }
}

/** Both owner previews and shared video players use bounded, single-range responses. */
export function sendCompanionMedia(request: IncomingMessage, response: ServerResponse, data: Buffer, mimeType: string) {
  const range = request.headers.range;
  let start = 0; let end = data.length - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
    if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'content-range': `bytes */${data.length}` }); response.end(); return; }
    start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]));
    end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= data.length) {
      response.writeHead(416, { 'content-range': `bytes */${data.length}` }); response.end(); return;
    }
  }
  response.writeHead(range ? 206 : 200, { 'content-type': mimeType, 'content-length': String(end - start + 1),
    'accept-ranges': 'bytes', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
    ...(range ? { 'content-range': `bytes ${start}-${end}/${data.length}` } : {}) });
  response.end(request.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
}

export async function routeCompanionPublicationApi(context: ChatApiRouteContext): Promise<boolean> {
  const match = matchRoute(context.url.pathname, /^\/api\/cats\/([^/]+)\/companion-box\/(media-settings|media|media-import|posts|generations)(?:\/([^/]+))?(?:\/(share|notify))?$/u);
  if (!match) return false;
  const [catId, section, id] = match as [string, string, string | undefined];
  const action = match[3];
  // Existing DELETE owns the activity event and canonical-memory receipt.
  if (section === 'posts' && id && !action && context.method === 'DELETE') return false;
  try {
    const cat = requireCat(await readConversationCatalog(context.dependencies.chatStore), catId);
    const store = context.dependencies.companionStore;
    const media = new CompanionMediaStore(store, context.dependencies.config.chatStatePath, context.dependencies.now, context.dependencies.runtimeClient);
    const posts = new CompanionPostService(store, context.dependencies.now);
    if (action) {
      const publications = context.dependencies.companionPublications;
      if (!publications || section !== 'posts' || !id) throw new CompanionPostError('publication_service_unavailable', 409);
      if (action === 'share' && context.method === 'POST') sendJson(context.response, 200, await publications.shares.create(catId, id));
      else if (action === 'share' && context.method === 'DELETE') sendJson(context.response, 200, await publications.shares.revoke(catId, id));
      else if (action === 'notify' && context.method === 'POST') {
        const input = await json(context.request);
        const notification = await publications.notifications.enqueue(catId, id, input.destination as 'dm' | 'telegram', { retryFailed: input.retry === true });
        sendJson(context.response, 202, { notification });
      } else sendMethodNotAllowed(context.response, action === 'share' ? ['POST', 'DELETE'] : ['POST']);
      return true;
    }
    if (section === 'generations') {
      const publications = context.dependencies.companionPublications;
      if (!publications) throw new CompanionPostError('publication_service_unavailable', 409);
      if (!id && context.method === 'POST') sendJson(context.response, 202, await publications.generation.ownerGenerate(catId, await json(context.request)));
      else if (!id && context.method === 'GET') sendJson(context.response, 200, { publications: (await store.readSnapshot()).publicationIntents
        .filter(row => row.catId === catId && ['waiting_for_media', 'failed'].includes(row.state)).map(row => ({ id: row.id, body: row.body, state: row.state, error: row.error })) });
      else if (id && context.method === 'DELETE') sendJson(context.response, 200, await publications.generation.cancel(catId, id));
      else sendMethodNotAllowed(context.response, id ? ['DELETE'] : ['GET', 'POST']);
      return true;
    }
    if (section === 'media-settings' && !id) {
      if (context.method === 'GET') sendJson(context.response, 200, { settings: await media.settings(catId) });
      else if (context.method === 'PATCH') sendJson(context.response, 200, { settings: await media.updateSettings(catId, await json(context.request)) });
      else sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
      return true;
    }
    if (section === 'media-import' && !id) {
      if (context.method !== 'POST') sendMethodNotAllowed(context.response, ['POST']);
      else {
        const input = await json(context.request);
        if (typeof input.path !== 'string') throw new CompanionPostError('invalid_source_file');
        const asset = await media.importSource(catId, input.path);
        sendJson(context.response, 201, { asset, url: companionMediaUrl(catId, asset.id) });
      }
      return true;
    }
    if (section === 'media') {
      if (id && ['GET', 'HEAD'].includes(context.method)) {
        const result = await media.read(catId, id);
        sendCompanionMedia(context.request, context.response, result.data, result.asset.mimeType);
      } else if (!id && context.method === 'GET') {
        const settings = await media.settings(catId);
        if (settings.useProfileImages && cat.avatarUrl?.startsWith('data:image/')) await media.dataUrl(catId, cat.avatarUrl, 'avatar');
        sendJson(context.response, 200, { assets: await media.list(catId), settings,
          sourceFiles: await media.sourceFiles(catId).catch(() => []),
          coverUrl: settings.coverAssetId ? companionMediaUrl(catId, settings.coverAssetId) : null });
      } else if (!id && context.method === 'POST') {
        const origin = context.url.searchParams.get('origin') === 'cover' ? 'cover' : 'source';
        const asset = await media.ingest(catId, await body(context.request, MEDIA_MAX_BYTES), origin);
        if (origin === 'cover') {
          await media.updateSettings(catId, { coverAssetId: asset.id }, context.url.searchParams.get('ifEmpty') === 'true');
        }
        sendJson(context.response, 201, { asset, url: companionMediaUrl(catId, asset.id) });
      } else sendMethodNotAllowed(context.response, id ? ['GET', 'HEAD'] : ['GET', 'POST']);
      return true;
    }
    if (section === 'posts') {
      const project = async (records: Awaited<ReturnType<typeof posts.get>>[]) => projectCompanionProfile({
        derived: records, mediaAssets: await media.list(catId),
      }).posts;
      if (!id && context.method === 'GET') {
        const page = await posts.list(catId, context.url.searchParams.get('cursor') ?? undefined);
        sendJson(context.response, 200, { posts: await project(page.items), nextCursor: page.nextCursor });
      } else if (!id && context.method === 'POST') {
        const input = await json(context.request);
        const post = await posts.create(catId, input as unknown as Parameters<typeof posts.create>[1]);
        sendJson(context.response, 201, { post: (await project([post]))[0] });
      } else if (id && context.method === 'GET') sendJson(context.response, 200, { post: (await project([await posts.get(catId, id)]))[0] });
      else if (id && context.method === 'PATCH') {
        const input = await json(context.request);
        const post = await posts.update(catId, id, input as unknown as Parameters<typeof posts.update>[2]);
        sendJson(context.response, 200, { post: (await project([post]))[0] });
      } else sendMethodNotAllowed(context.response, id ? ['GET', 'PATCH', 'DELETE'] : ['GET', 'POST']);
      return true;
    }
  } catch (error) {
    if (error instanceof CompanionPostError || error instanceof MediaImageError) sendJson(context.response, error.status, { error: { code: error.code, message: error.code } });
    else handleCanonicalCatError(context, error);
  }
  return true;
}
