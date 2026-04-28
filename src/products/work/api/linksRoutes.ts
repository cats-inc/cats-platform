import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import {
  listCoreWorkGraphLinks,
  removeCoreWorkGraphLink,
  upsertCoreWorkGraphLink,
} from '../../../core/model/index.js';
import type {
  CoreWorkGraphLinkEndpointKind,
  CoreWorkGraphLinkKind,
  CoreWorkGraphLinkRecord,
} from '../../../core/types.js';
import { handleCoreError } from '../../../core/api/shared.js';
import {
  WORK_API_LINK_DETAIL_PATTERN,
  WORK_API_LINKS_PATH,
} from '../shared/apiPaths.js';
import type { WorkApiDependencies } from './index.js';

const ENDPOINT_KINDS: ReadonlySet<CoreWorkGraphLinkEndpointKind> = new Set([
  'project',
  'work_item',
  'task',
]);

const SUBMITTABLE_KINDS: ReadonlySet<CoreWorkGraphLinkKind | 'blocked_by'> = new Set([
  'blocks',
  'blocked_by',
  'related_to',
  'duplicate_of',
  'follows',
]);

interface LinkCreatePayload {
  kind: CoreWorkGraphLinkKind | 'blocked_by';
  source: { recordFamily: CoreWorkGraphLinkEndpointKind; recordId: string };
  target: { recordFamily: CoreWorkGraphLinkEndpointKind; recordId: string };
  note?: string | null;
  createdByActorId?: string | null;
}

export async function routeWorkLinksApi(
  context: RouteContext<WorkApiDependencies>,
): Promise<boolean> {
  if (context.url.pathname === WORK_API_LINKS_PATH) {
    if (context.method === 'GET') {
      const query = parseListQuery(context.url.searchParams);
      if (query.error) {
        sendJson(context.response, 400, {
          error: { code: 'invalid_link_query', message: query.error },
        });
        return true;
      }
      const core = await context.dependencies.coreStore.readCore();
      const links = listCoreWorkGraphLinks(core, query.filters);
      sendJson(context.response, 200, { links });
      return true;
    }
    if (context.method === 'POST') {
      const body = await readJsonBody<Record<string, unknown>>(context.request);
      const validation = validateCreatePayload(body);
      if (validation.error !== null || !validation.payload) {
        sendJson(context.response, 400, {
          error: { code: 'invalid_link_input', message: validation.error ?? 'Invalid input' },
        });
        return true;
      }
      try {
        const now = context.dependencies.now?.() ?? new Date();
        const core = await context.dependencies.coreStore.readCore();
        const result = upsertCoreWorkGraphLink(
          core,
          {
            kind: validation.payload.kind,
            sourceRecordFamily: validation.payload.source.recordFamily,
            sourceRecordId: validation.payload.source.recordId,
            targetRecordFamily: validation.payload.target.recordFamily,
            targetRecordId: validation.payload.target.recordId,
            note: validation.payload.note ?? null,
            createdByActorId: validation.payload.createdByActorId ?? null,
          },
          now,
        );
        if (result.created) {
          await context.dependencies.coreStore.writeCore(result.core);
        }
        sendJson(context.response, result.created ? 201 : 200, {
          link: result.link,
          created: result.created,
        });
      } catch (error) {
        handleCoreError(context, error);
      }
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const detailMatch = matchRoute(context.url.pathname, WORK_API_LINK_DETAIL_PATTERN);
  if (detailMatch) {
    const linkId = detailMatch[0];
    if (!linkId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_link_id', message: 'Link id is required.' },
      });
      return true;
    }
    if (context.method !== 'DELETE') {
      sendMethodNotAllowed(context.response, ['DELETE']);
      return true;
    }
    const now = context.dependencies.now?.() ?? new Date();
    const core = await context.dependencies.coreStore.readCore();
    const result = removeCoreWorkGraphLink(core, linkId, now);
    if (!result.removed) {
      sendJson(context.response, 404, {
        error: { code: 'link_not_found', message: `No link with id ${linkId}.` },
      });
      return true;
    }
    await context.dependencies.coreStore.writeCore(result.core);
    sendJson(context.response, 200, { removed: true, linkId });
    return true;
  }

  return false;
}

function parseListQuery(params: URLSearchParams): {
  filters: {
    recordFamily?: CoreWorkGraphLinkEndpointKind;
    recordId?: string;
    kind?: CoreWorkGraphLinkKind;
  };
  error: string | null;
} {
  const filters: {
    recordFamily?: CoreWorkGraphLinkEndpointKind;
    recordId?: string;
    kind?: CoreWorkGraphLinkKind;
  } = {};
  const family = params.get('recordFamily');
  if (family !== null) {
    if (!ENDPOINT_KINDS.has(family as CoreWorkGraphLinkEndpointKind)) {
      return { filters, error: `recordFamily must be one of project / work_item / task.` };
    }
    filters.recordFamily = family as CoreWorkGraphLinkEndpointKind;
  }
  const id = params.get('recordId');
  if (id !== null) {
    if (!id.trim()) {
      return { filters, error: 'recordId must be non-empty.' };
    }
    filters.recordId = id;
  }
  const kind = params.get('kind');
  if (kind !== null) {
    if (kind === 'blocked_by') {
      return {
        filters,
        error: 'kind=blocked_by is a derived view; query with kind=blocks instead.',
      };
    }
    if (!['blocks', 'related_to', 'duplicate_of', 'follows'].includes(kind)) {
      return { filters, error: 'kind must be blocks / related_to / duplicate_of / follows.' };
    }
    filters.kind = kind as CoreWorkGraphLinkKind;
  }
  return { filters, error: null };
}

function validateCreatePayload(
  body: Record<string, unknown>,
): { payload: LinkCreatePayload; error: null } | { payload: null; error: string } {
  const kind = body.kind;
  if (typeof kind !== 'string' || !SUBMITTABLE_KINDS.has(kind as CoreWorkGraphLinkKind | 'blocked_by')) {
    return {
      payload: null,
      error: 'kind must be blocks / blocked_by / related_to / duplicate_of / follows.',
    };
  }
  const source = parseEndpoint(body.source);
  if ('error' in source) return { payload: null, error: `source: ${source.error}` };
  const target = parseEndpoint(body.target);
  if ('error' in target) return { payload: null, error: `target: ${target.error}` };

  const note = body.note;
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return { payload: null, error: 'note must be a string when provided.' };
  }
  const createdByActorId = body.createdByActorId;
  if (createdByActorId !== undefined && createdByActorId !== null && typeof createdByActorId !== 'string') {
    return { payload: null, error: 'createdByActorId must be a string when provided.' };
  }

  return {
    payload: {
      kind: kind as CoreWorkGraphLinkKind | 'blocked_by',
      source: source.value,
      target: target.value,
      note: typeof note === 'string' ? note : null,
      createdByActorId: typeof createdByActorId === 'string' ? createdByActorId : null,
    },
    error: null,
  };
}

function parseEndpoint(value: unknown):
  | { value: { recordFamily: CoreWorkGraphLinkEndpointKind; recordId: string } }
  | { error: string } {
  if (!value || typeof value !== 'object') {
    return { error: 'must be { recordFamily, recordId }.' };
  }
  const record = value as Record<string, unknown>;
  const family = record.recordFamily;
  if (typeof family !== 'string' || !ENDPOINT_KINDS.has(family as CoreWorkGraphLinkEndpointKind)) {
    return { error: 'recordFamily must be project / work_item / task.' };
  }
  const id = record.recordId;
  if (typeof id !== 'string' || !id.trim()) {
    return { error: 'recordId must be a non-empty string.' };
  }
  return {
    value: {
      recordFamily: family as CoreWorkGraphLinkEndpointKind,
      recordId: id.trim(),
    },
  };
}

export type WorkLinkRecord = CoreWorkGraphLinkRecord;
