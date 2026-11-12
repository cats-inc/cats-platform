import { fetchMessagePage } from './api/transcript.js';
import { TranscriptHistory, type TranscriptWindow } from './transcriptHistory.js';

const entries = new Map<string, TranscriptHistory>();
const epochListeners = new Set<() => void>();
let epoch = 0;
export const transcriptHistoryEpoch = () => epoch;
export const subscribeTranscriptHistoryEpoch = (listener: () => void) => {
  epochListeners.add(listener); return () => { epochListeners.delete(listener); };
};
export function getTranscriptHistory(scope: string, id: string, initial: TranscriptWindow, onCreate?: () => void): TranscriptHistory {
  const key = JSON.stringify([scope, id]);
  const existing = entries.get(key);
  if (existing) { entries.delete(key); entries.set(key, existing); return existing; }
  const entry = new TranscriptHistory(initial, (before, signal) => fetchMessagePage(id, { before }, signal));
  onCreate?.();
  entries.set(key, entry);
  while (entries.size > 24) {
    const oldest = [...entries].find(([, value]) => !value.isObserved && value !== entry)?.[0];
    if (!oldest) break;
    entries.get(oldest)?.cancel(); entries.delete(oldest);
  }
  return entry;
}
export function clearTranscriptHistory(): void {
  for (const entry of entries.values()) entry.cancel(); entries.clear(); epoch++;
  for (const listener of epochListeners) listener();
}
export function pruneTranscriptHistory(scope: string, ids: ReadonlySet<string>): void {
  for (const [key, entry] of entries) {
    const [entryScope, id] = JSON.parse(key) as [string, string];
    if (entryScope === scope && !ids.has(id)) { entry.cancel(); entries.delete(key); }
  }
}
