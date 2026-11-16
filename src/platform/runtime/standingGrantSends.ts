/**
 * ADR-155: which owner messages may use Runtime's standing grants (Runtime ADR-055).
 *
 * The channel route marks a message while the local owner's own request dispatches it, a send or a
 * retry, and unmarks it when that dispatch ends. A send is flagged only while its source message is
 * marked and also bears both server stamps. Anything else asks: a dispatch that starts later from a
 * queue, a retry from mobile, every turn after a Platform restart. While a Stop is ending grants,
 * nothing is flagged.
 */
const marked = new Map<string, number>();
let stopping = 0;

export const standingGrantSends = {
  mark(messageId: string): () => void {
    marked.set(messageId, (marked.get(messageId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (marked.get(messageId) ?? 1) - 1;
      if (left > 0) marked.set(messageId, left); else marked.delete(messageId);
    };
  },
  allows(message: { id: string; senderKind?: string; metadata?: Record<string, unknown> | null; choiceResponse?: unknown } | null | undefined): boolean {
    return Boolean(message && stopping === 0 && marked.has(message.id) && message.senderKind === 'user' && !message.choiceResponse
      && message.metadata?.ownerStarted === 'desktop' && message.metadata?.desktopControlEntry === 'local');
  },
  async whileStopping<T>(stop: () => Promise<T>): Promise<T> {
    stopping++;
    try { return await stop(); } finally { stopping--; }
  },
};
