/**
 * SPEC-136 FR-25: the first model for an Ollama on this computer. Getting a model is a setup
 * step, like installing the tool, so the host owns it (ADR-146 point 10). The endpoint comes
 * from what Runtime has saved, and only a loopback address is accepted, so a page cannot aim
 * this at another machine. Runtime still owns execution and model discovery.
 */

const MODEL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u;
const MODEL_NAME_LIMIT = 200;
const LIST_TIMEOUT_MS = 5_000;

export function isValidOllamaModelName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= MODEL_NAME_LIMIT && MODEL_NAME.test(name);
}

export function isLoopbackEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string') return false;
  try {
    const url = new URL(endpoint);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function apiUrl(endpoint: string, path: string): string {
  if (!isLoopbackEndpoint(endpoint)) throw new Error('Only an Ollama on this computer can be used here.');
  return `${endpoint.replace(/\/+$/u, '')}${path}`;
}

export async function listOllamaModels(
  endpoint: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<string[]> {
  const request = options.fetch ?? fetch;
  const response = await request(apiUrl(endpoint, '/api/tags'), {
    signal: AbortSignal.timeout(options.timeoutMs ?? LIST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Ollama answered ${response.status}.`);
  const body = await response.json() as { models?: Array<{ name?: unknown }> };
  return (body.models ?? [])
    .map((model) => model.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

export interface OllamaPullProgress {
  name: string;
  status: string;
  /** 0 to 100, or null while Ollama reports no sizes. */
  percent: number | null;
}

/**
 * A pull reports many layers one after another, so the overall figure only ever moves forward.
 */
export function createPullProgressTracker(name: string): (line: Record<string, unknown>) => OllamaPullProgress {
  const layers = new Map<string, { completed: number; total: number }>();
  let highest: number | null = null;
  return (line) => {
    const status = typeof line.status === 'string' ? line.status : '';
    const digest = typeof line.digest === 'string' ? line.digest : null;
    if (digest && typeof line.total === 'number' && line.total > 0) {
      layers.set(digest, {
        total: line.total,
        completed: typeof line.completed === 'number' ? Math.min(line.completed, line.total) : 0,
      });
    }
    let total = 0;
    let completed = 0;
    for (const layer of layers.values()) {
      total += layer.total;
      completed += layer.completed;
    }
    if (total > 0) {
      const percent = Math.min(99, Math.floor((completed / total) * 100));
      highest = highest === null ? percent : Math.max(highest, percent);
    }
    if (status === 'success') highest = 100;
    return { name, status, percent: highest };
  };
}

export async function pullOllamaModel(
  endpoint: string,
  name: string,
  options: {
    fetch?: typeof fetch;
    signal?: AbortSignal;
    onProgress?: (progress: OllamaPullProgress) => void;
  } = {},
): Promise<void> {
  if (!isValidOllamaModelName(name)) throw new Error('Enter a model name, such as qwen2.5-coder:7b.');
  const request = options.fetch ?? fetch;
  const response = await request(apiUrl(endpoint, '/api/pull'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: name, stream: true }),
    signal: options.signal,
  });
  if (!response.ok || !response.body) throw new Error(`Ollama answered ${response.status}.`);
  const track = createPullProgressTracker(name);
  const decoder = new TextDecoder();
  let pending = '';
  let succeeded = false;
  const handle = (text: string) => {
    if (!text.trim()) return;
    let line: Record<string, unknown>;
    try { line = JSON.parse(text) as Record<string, unknown>; } catch { return; }
    if (typeof line.error === 'string') throw new Error(line.error);
    if (line.status === 'success') succeeded = true;
    options.onProgress?.(track(line));
  };
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const text of lines) handle(text);
  }
  handle(pending);
  if (!succeeded) throw new Error('Ollama stopped before the model finished downloading.');
}
