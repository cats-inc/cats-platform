import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RouteContext<TDependencies> {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  method: string;
  dependencies: TDependencies;
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
    ...headers,
  });
  response.end(body);
}

export function sendBinary(
  response: ServerResponse,
  statusCode: number,
  body: Buffer,
  contentType: string,
): void {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'content-length': body.byteLength.toString(),
  });
  response.end(body);
}

export function sendMethodNotAllowed(
  response: ServerResponse,
  allowedMethods: string[],
): void {
  sendJson(
    response,
    405,
    { error: { code: 'method_not_allowed', message: 'Method not allowed' } },
    { Allow: allowedMethods.join(', ') },
  );
}

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf-8').trim();
  if (!rawBody) {
    throw new Error('Request body is required');
  }

  return JSON.parse(rawBody) as T;
}

export function matchRoute(pathname: string, pattern: RegExp): string[] | null {
  const match = pattern.exec(pathname);
  if (!match) {
    return null;
  }

  return match.slice(1).map((value) => decodeURIComponent(value));
}
