import type { ServerResponse } from 'node:http';

import type { CatsCoreState } from '../../../core/types.js';
import {
  buildWorkPlaceholderProjection,
  type WorkPlaceholderProjection,
} from './projection.js';

export const WORK_API_SLICE = 'work';

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
  });
  response.end(body);
}

export function createWorkPlaceholderPayload(core: CatsCoreState): WorkPlaceholderProjection {
  return buildWorkPlaceholderProjection(core);
}

export function handleWorkPlaceholder(
  response: ServerResponse,
  core: CatsCoreState,
): void {
  sendJson(response, 200, createWorkPlaceholderPayload(core));
}
