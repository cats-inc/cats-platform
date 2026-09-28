import { sendBinary, sendJson, sendMethodNotAllowed, type RouteContext } from '../../shared/http.js';
import type { AppPackageApiDependencies } from './appPackageRoutes.js';
import { appImages, AppImageError } from '../../platform/apps/images.js';
import { RuntimeImageError } from '../../runtime/images.js';

export async function routeAppImages(context: RouteContext<AppPackageApiDependencies>): Promise<boolean> {
  const match = /^\/api\/apps\/([a-z][a-z0-9.-]*)\/images\/(capabilities|jobs|jobs\/([a-f0-9-]+)\/(cancel|refresh|image))$/.exec(context.url.pathname);
  if (!match) return false;
  const action = match[2]; const id = match[3];
  const methods = action === 'jobs' ? ['GET', 'POST'] : ['cancel', 'refresh'].includes(match[4] ?? '') ? ['POST'] : ['GET'];
  if (!methods.includes(context.method)) { sendMethodNotAllowed(context.response, methods); return true; }
  const headers = { 'cache-control': 'no-store' };
  try {
    const { coreStore, runtimeClient, config } = context.dependencies;
    if (!coreStore || !runtimeClient) throw new AppImageError('image_service_unavailable', 503);
    const accountId = context.auth?.principal?.account.id ?? (await coreStore.readCore()).ownerProfile.actorId;
    const scope = { appId: match[1]!, version: context.url.searchParams.get('version') ?? '', accountId };
    const service = appImages({ coreStore, runtimeClient, chatStatePath: config.chatStatePath });
    const digest = await service.authorize(scope);
    if (match[4] === 'image') {
      const bytes = await service.image(scope, id!);
      if (digest !== await service.authorize(scope)) throw new AppImageError('app_context_revoked', 409);
      sendBinary(context.response, 200, bytes, 'image/jpeg', { ...headers, 'x-content-type-options': 'nosniff',
        'content-disposition': `attachment; filename="Studio-${id}.jpg"` });
      return true;
    }
    let result: unknown;
    if (action === 'capabilities') result = await service.capabilities(scope);
    else if (match[4] === 'cancel') result = await service.cancel(scope, id!);
    else if (match[4] === 'refresh') result = await service.recover(scope, id!);
    else if (context.method === 'GET') result = { jobs: await service.list(scope) };
    else {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of context.request) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > 12000) throw new AppImageError('invalid_image_request');
        chunks.push(bytes);
      }
      let input: unknown;
      try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new AppImageError('invalid_image_request'); }
      result = await service.submit(scope, input);
    }
    if (digest !== await service.authorize(scope)) throw new AppImageError('app_context_revoked', 409);
    // Remove host account and package bookkeeping from the renderer projection.
    const publicJob = (value: unknown): unknown => {
      if (!value || typeof value !== 'object') return value;
      const { accountId: _account, appId: _app, appVersion: _version, ...rest } = value as Record<string, unknown>;
      return rest;
    };
    if (action === 'jobs' && context.method === 'GET') result = { jobs: (result as { jobs: unknown[] }).jobs.map(publicJob) };
    else result = publicJob(result);
    sendJson(context.response, context.method === 'POST' && action === 'jobs' ? 202 : 200, result, headers);
  } catch (error) {
    const code = error instanceof AppImageError || error instanceof RuntimeImageError ? error.code : 'image_service_unavailable';
    sendJson(context.response, error instanceof AppImageError ? error.status : 503, { error: { code } }, headers);
  }
  return true;
}
