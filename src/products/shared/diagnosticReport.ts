import type { LiveTraceEntry } from '../../shared/liveTrace.js';

export interface ConversationDiagnosticReport {
  filename: string;
  text: string;
}

/** Best-effort scrubbing of free-text error evidence; never serialize raw payloads. */
export function diagnosticText(value: unknown, limit = 1200): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const redacted = value
    .replace(/\b(?:set-cookie|cookie)\s*:[^\r\n]*/giu, 'Cookie: [redacted]')
    .replace(/\bcats_session\s*=\s*[^\s;,]+/giu, 'cats_session=[redacted]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/gu, '[redacted key]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu, '$1 [redacted]')
    .replace(/((?:[\w-]*(?:token|secret|password|api[_-]?key|authorization|cookie)[\w-]*)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}\r\n]+)/giu, '$1[redacted]')
    .replace(/\b(?:sk-[\w-]{10,}|gh[pousr]_[\w]{10,}|github_pat_[\w_]{10,}|\d{6,}:[\w-]{20,})\b/gu, '[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/giu, '$1[redacted]@')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '');
  return redacted.length > limit ? `${redacted.slice(0, limit)}… [truncated]` : redacted;
}

export function diagnosticTrace(entries: LiveTraceEntry[], channelId: string) {
  return entries.filter(entry => entry.channelId === channelId).slice(-20).map(entry => ({
    at: diagnosticText(entry.at, 80),
    event: diagnosticText(entry.event, 160),
    sessionId: diagnosticText(entry.sessionId, 160),
    reason: diagnosticText(entry.reason, 300),
  }));
}

export async function readDiagnosticWithin<T>(read: () => Promise<T>, timeoutMs = 5500): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read).catch(() => null),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
