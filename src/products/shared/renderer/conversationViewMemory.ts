import { useCallback, useSyncExternalStore, type SetStateAction } from 'react';
import { onProviderClientInvalidation } from '../../../app/renderer/providerClientInvalidation.js';

interface ComposerMemory { text: string; files: File[] }
export interface ConversationScrollMemory { top: number; nearBottom: boolean }
const emptyComposer: ComposerMemory = { text: '', files: [] };
const drafts = new Map<string, ComposerMemory>();
const scrolls = new Map<string, ConversationScrollMemory>();
const listeners = new Set<() => void>();
let generation = 0;
const keyFor = (scope: string, id: string) => JSON.stringify([scope, id]);
const notify = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function clearConversationViewMemory(): void {
  generation += 1;
  drafts.clear();
  scrolls.clear();
  notify();
}
onProviderClientInvalidation(clearConversationViewMemory);

export function pruneConversationViewMemory(scope: string, channelIds: ReadonlySet<string>): void {
  for (const entries of [drafts, scrolls]) {
    for (const key of entries.keys()) {
      const [entryScope, identity] = JSON.parse(key) as [string, string];
      if (entryScope === scope && identity.startsWith('channel:') && !channelIds.has(identity.slice(8))) {
        entries.delete(key);
      }
    }
  }
}

export function writeConversationComposer(scope: string, identity: string, value: ComposerMemory, expectedGeneration = generation): void {
  if (expectedGeneration !== generation) return;
  drafts.set(keyFor(scope, identity), value);
  notify();
}

export function readConversationScroll(scope: string, channelId: string) {
  return scrolls.get(keyFor(scope, `channel:${channelId}`));
}

export function rememberConversationScroll(
  scope: string, channelId: string, scroll: ConversationScrollMemory,
): void {
  scrolls.set(keyFor(scope, `channel:${channelId}`), scroll);
  // Scroll positions are disposable; unsent drafts are not.
  if (scrolls.size > 100) scrolls.delete(scrolls.keys().next().value!);
}

export function useConversationComposerState(scope: string, identity: string) {
  const epoch = useSyncExternalStore(subscribe, () => generation, () => generation);
  const key = keyFor(scope, identity);
  const read = useCallback(() => drafts.get(key) ?? emptyComposer, [key]);
  const value = useSyncExternalStore(subscribe, read, read);
  const setComposerDraft = useCallback((action: SetStateAction<string>) => {
    if (epoch !== generation) return;
    const current = drafts.get(key) ?? emptyComposer;
    const text = typeof action === 'function' ? action(current.text) : action;
    drafts.set(key, { ...current, text });
    notify();
  }, [epoch, key]);
  const setChannelFiles = useCallback((action: SetStateAction<File[]>) => {
    if (epoch !== generation) return;
    const current = drafts.get(key) ?? emptyComposer;
    const files = typeof action === 'function' ? action(current.files) : action;
    drafts.set(key, { ...current, files });
    notify();
  }, [epoch, key]);
  return { composerDraft: value.text, channelFiles: value.files, setComposerDraft, setChannelFiles, generation: epoch };
}
