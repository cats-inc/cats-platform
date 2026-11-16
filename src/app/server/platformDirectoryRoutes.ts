import { CoreApiError } from '../../core/errors.js';
import type { ChatApiDependencies } from '../../products/chat/api/routeSupport.js';
import type { DirectorySnapshot } from '../../platform/directory/contracts.js';
import {
  addCatteryMember,
  addClowderMember,
  createCattery,
  createClowder,
  deleteCattery,
  deleteClowder,
  moveClowderMember,
  removeCatteryMember,
  removeClowderMember,
  updateCattery,
  updateClowder,
  updateCatteryMember,
  updateClowderMember,
  type DirectoryMutationContext,
} from '../../platform/directory/model.js';
import { DirectoryFormatError } from '../../platform/directory/snapshot.js';
import { directoryStoreFor } from '../../platform/directory/store.js';
import { buildDirectoryView } from '../../platform/directory/view.js';
import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../shared/http.js';

type DirectoryContext = RouteContext<ChatApiDependencies>;
type Mutation = (snapshot: DirectorySnapshot, context: DirectoryMutationContext) => DirectorySnapshot;

const CLOWDER = /^\/api\/platform\/clowders\/([^/]+)$/u;
const CLOWDER_MEMBERS = /^\/api\/platform\/clowders\/([^/]+)\/members$/u;
const CLOWDER_MEMBER = /^\/api\/platform\/clowders\/([^/]+)\/members\/([^/]+)$/u;
const CLOWDER_MEMBER_MOVE = /^\/api\/platform\/clowders\/([^/]+)\/members\/([^/]+)\/move$/u;
const CATTERY = /^\/api\/platform\/catteries\/([^/]+)$/u;
const CATTERY_MEMBERS = /^\/api\/platform\/catteries\/([^/]+)\/members$/u;
const CATTERY_MEMBER = /^\/api\/platform\/catteries\/([^/]+)\/members\/([^/]+)$/u;

class BadBodyError extends CoreApiError {
  constructor(message: string) {
    super(message, 'bad_request', 400);
  }
}

async function readBody(context: DirectoryContext): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await readJsonBody<unknown>(context.request);
  } catch (error) {
    throw new BadBodyError(error instanceof Error ? error.message : 'Invalid request body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadBodyError('The request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

async function readCatIds(context: DirectoryContext): Promise<Set<string>> {
  const chat = await context.dependencies.chatStore.read();
  return new Set(chat.cats.map((cat) => cat.id));
}

function sendError(context: DirectoryContext, error: unknown): void {
  if (error instanceof CoreApiError) {
    sendJson(context.response, error.statusCode, { error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof DirectoryFormatError) {
    sendJson(context.response, 500, { error: { code: error.code, message: error.message } });
    return;
  }
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-platform-directory] route: ${message}\n`);
  sendJson(context.response, 500, {
    error: { code: 'internal_error', message: 'The Clowder and Cattery change could not be saved.' },
  });
}

/** Applies one change and answers with the whole directory, which the canvas renders as is. */
async function mutate(context: DirectoryContext, mutation: Mutation, status = 200): Promise<void> {
  const catIds = await readCatIds(context);
  const now = context.dependencies.now?.() ?? new Date();
  const { snapshot } = await directoryStoreFor(context.dependencies.config.chatStatePath)
    .update((current) => ({ snapshot: mutation(current, { now, catIds }), result: null }));
  sendJson(context.response, status, { directory: buildDirectoryView(snapshot, catIds) });
}

async function readDirectory(context: DirectoryContext): Promise<void> {
  const catIds = await readCatIds(context);
  const snapshot = await directoryStoreFor(context.dependencies.config.chatStatePath).read();
  sendJson(context.response, 200, { directory: buildDirectoryView(snapshot, catIds) });
}

function methodNotAllowed(context: DirectoryContext, allowed: string[]): true {
  sendMethodNotAllowed(context.response, allowed);
  return true;
}

async function routeClowders(context: DirectoryContext): Promise<boolean> {
  const { pathname } = context.url;
  const { method } = context;

  if (pathname === '/api/platform/clowders') {
    if (method !== 'POST') return methodNotAllowed(context, ['POST']);
    const body = await readBody(context);
    await mutate(context, (snapshot, ctx) => createClowder(snapshot, body, ctx).snapshot, 201);
    return true;
  }

  const move = matchRoute(pathname, CLOWDER_MEMBER_MOVE);
  if (move) {
    if (method !== 'POST') return methodNotAllowed(context, ['POST']);
    const [clowderId, catId] = move as [string, string];
    const body = await readBody(context);
    if (typeof body.toClowderId !== 'string') throw new BadBodyError('toClowderId is required.');
    const toClowderId = body.toClowderId;
    await mutate(context, (snapshot, ctx) =>
      moveClowderMember(snapshot, { catId, fromClowderId: clowderId, toClowderId }, ctx).snapshot);
    return true;
  }

  const member = matchRoute(pathname, CLOWDER_MEMBER);
  if (member) {
    const [clowderId, catId] = member as [string, string];
    if (method === 'PATCH') {
      const body = await readBody(context);
      await mutate(context, (snapshot, ctx) => updateClowderMember(snapshot, clowderId, catId, body, ctx).snapshot);
      return true;
    }
    if (method === 'DELETE') {
      await mutate(context, (snapshot, ctx) => removeClowderMember(snapshot, clowderId, catId, ctx));
      return true;
    }
    return methodNotAllowed(context, ['PATCH', 'DELETE']);
  }

  const members = matchRoute(pathname, CLOWDER_MEMBERS);
  if (members) {
    if (method !== 'POST') return methodNotAllowed(context, ['POST']);
    const [clowderId] = members as [string];
    const body = await readBody(context);
    await mutate(context, (snapshot, ctx) => addClowderMember(snapshot, clowderId, body, ctx).snapshot);
    return true;
  }

  const clowder = matchRoute(pathname, CLOWDER);
  if (clowder) {
    const [clowderId] = clowder as [string];
    if (method === 'PATCH') {
      const body = await readBody(context);
      await mutate(context, (snapshot, ctx) => updateClowder(snapshot, clowderId, body, ctx).snapshot);
      return true;
    }
    if (method === 'DELETE') {
      await mutate(context, (snapshot, ctx) => deleteClowder(snapshot, clowderId, ctx));
      return true;
    }
    return methodNotAllowed(context, ['PATCH', 'DELETE']);
  }

  return false;
}

async function routeCatteries(context: DirectoryContext): Promise<boolean> {
  const { pathname } = context.url;
  const { method } = context;

  if (pathname === '/api/platform/catteries') {
    if (method !== 'POST') return methodNotAllowed(context, ['POST']);
    const body = await readBody(context);
    await mutate(context, (snapshot, ctx) => createCattery(snapshot, body, ctx).snapshot, 201);
    return true;
  }

  const member = matchRoute(pathname, CATTERY_MEMBER);
  if (member) {
    const [catteryId, catId] = member as [string, string];
    if (method === 'PATCH') {
      const body = await readBody(context);
      await mutate(context, (snapshot, ctx) => updateCatteryMember(snapshot, catteryId, catId, body, ctx).snapshot);
      return true;
    }
    if (method === 'DELETE') {
      await mutate(context, (snapshot, ctx) => removeCatteryMember(snapshot, catteryId, catId, ctx));
      return true;
    }
    return methodNotAllowed(context, ['PATCH', 'DELETE']);
  }

  const members = matchRoute(pathname, CATTERY_MEMBERS);
  if (members) {
    if (method !== 'POST') return methodNotAllowed(context, ['POST']);
    const [catteryId] = members as [string];
    const body = await readBody(context);
    await mutate(context, (snapshot, ctx) => addCatteryMember(snapshot, catteryId, body, ctx).snapshot);
    return true;
  }

  const cattery = matchRoute(pathname, CATTERY);
  if (cattery) {
    const [catteryId] = cattery as [string];
    if (method === 'PATCH') {
      const body = await readBody(context);
      await mutate(context, (snapshot, ctx) => updateCattery(snapshot, catteryId, body, ctx).snapshot);
      return true;
    }
    if (method === 'DELETE') {
      await mutate(context, (snapshot, ctx) => deleteCattery(snapshot, catteryId, ctx));
      return true;
    }
    return methodNotAllowed(context, ['PATCH', 'DELETE']);
  }

  return false;
}

/**
 * SPEC-103 Clowder (貓群) and Cattery (貓窩) API. Every route sits behind the
 * Platform auth gate; none is public before setup.
 */
export async function routePlatformDirectoryApi(context: DirectoryContext): Promise<boolean> {
  const { pathname } = context.url;
  if (pathname !== '/api/platform/directory'
    && !pathname.startsWith('/api/platform/clowders')
    && !pathname.startsWith('/api/platform/catteries')) {
    return false;
  }
  try {
    if (pathname === '/api/platform/directory') {
      if (context.method !== 'GET') return methodNotAllowed(context, ['GET']);
      await readDirectory(context);
      return true;
    }
    return await routeClowders(context) || await routeCatteries(context);
  } catch (error) {
    sendError(context, error);
    return true;
  }
}
