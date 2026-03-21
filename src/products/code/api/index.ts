import type { ServerResponse } from 'node:http';

import type { CatsCoreState } from '../../../core/types.js';
import {
  buildCodePlaceholderProjection,
  type CodePlaceholderProjection,
} from './projection.js';

export const CODE_API_SLICE = 'code';

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
  });
  response.end(body);
}

export function createCodePlaceholderPayload(core: CatsCoreState): CodePlaceholderProjection {
  return buildCodePlaceholderProjection(core);
}

export function handleCodePlaceholder(
  response: ServerResponse,
  core: CatsCoreState,
): void {
  sendJson(response, 200, createCodePlaceholderPayload(core));
}
