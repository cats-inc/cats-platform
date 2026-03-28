export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string | { code?: string; message?: string };
    };
    if (typeof payload.error === 'string') {
      return payload.error || fallback;
    }
    if (payload.error && typeof payload.error === 'object' && typeof payload.error.message === 'string') {
      return payload.error.message || fallback;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export async function expectJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallback));
  }

  return (await response.json()) as T;
}
