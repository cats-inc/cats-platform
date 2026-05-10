import type { IncomingMessage } from 'node:http';

export interface GoogleCredentialRequestPayload {
  credential: string | null;
  csrfToken: string | null;
}

export async function readGoogleCredentialRequestPayload(
  request: IncomingMessage,
): Promise<GoogleCredentialRequestPayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf-8').trim();
  if (!rawBody) {
    throw new Error('Request body is required.');
  }
  return parseGoogleCredentialRequestPayload({
    contentType: request.headers['content-type'],
    rawBody,
  });
}

export function parseGoogleCredentialRequestPayload(input: {
  contentType: string | string[] | undefined;
  rawBody: string;
}): GoogleCredentialRequestPayload {
  const contentType = readHeaderValue(input.contentType)?.toLowerCase() ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(input.rawBody);
    return {
      credential: readOptionalString(params.get('credential')),
      csrfToken: readOptionalString(params.get('g_csrf_token')),
    };
  }

  const parsed = JSON.parse(input.rawBody) as Record<string, unknown>;
  return {
    credential: readOptionalString(parsed.credential),
    csrfToken: readOptionalString(parsed.g_csrf_token ?? parsed.csrfToken),
  };
}

function readHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
