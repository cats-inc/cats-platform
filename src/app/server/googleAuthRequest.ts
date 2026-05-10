export interface GoogleCredentialRequestPayload {
  credential: string | null;
  csrfToken: string | null;
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
