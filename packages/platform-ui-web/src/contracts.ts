/** Browser/Node-safe presentation data. No product identity or authority is inferred. */
export interface ConversationBlock {
  id: string;
  index: number;
  kind: 'text' | 'tool' | 'status';
  status: 'streaming' | 'complete' | 'error';
  title: string | null;
  text: string;
  toolName: string | null;
  toolId: string | null;
  /** Sanitized by the product before crossing its host boundary. */
  input?: string;
  result?: string | null;
}

export interface ConversationPresentation {
  version: 1;
  /** Identity is local to the originating product and execution. */
  id: string;
  phase: 'waiting' | 'streaming' | 'sealed';
  blocks: ConversationBlock[];
}

/** Validate untrusted persisted/transport data without recovering hidden raw metadata. */
export function readConversationPresentation(value: unknown): ConversationPresentation | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || typeof data.id !== 'string' || !data.id
    || !['waiting', 'streaming', 'sealed'].includes(String(data.phase))
    || !Array.isArray(data.blocks)) return null;
  const ids = new Set<string>();
  const blocks: ConversationBlock[] = [];
  for (const candidate of data.blocks) {
    if (!candidate || typeof candidate !== 'object') return null;
    const block = candidate as Record<string, unknown>;
    if (typeof block.id !== 'string' || !block.id || ids.has(block.id)
      || !Number.isSafeInteger(block.index) || Number(block.index) < 0
      || !['text', 'tool', 'status'].includes(String(block.kind))
      || !['streaming', 'complete', 'error'].includes(String(block.status))
      || typeof block.text !== 'string'
      || !['title', 'toolName', 'toolId'].every(key => block[key] === null || typeof block[key] === 'string')
      || (block.input !== undefined && typeof block.input !== 'string')
      || (block.result !== undefined && block.result !== null && typeof block.result !== 'string')) return null;
    ids.add(block.id);
    blocks.push({
      id: block.id, index: Number(block.index), kind: block.kind as ConversationBlock['kind'],
      status: block.status as ConversationBlock['status'], text: block.text,
      title: block.title as string | null, toolName: block.toolName as string | null,
      toolId: block.toolId as string | null,
      ...(typeof block.input === 'string' ? { input: block.input } : {}),
      ...(block.result !== undefined ? { result: block.result as string | null } : {}),
    });
  }
  return { version: 1, id: data.id, phase: data.phase as ConversationPresentation['phase'], blocks };
}

export function conversationPlainText(blocks: readonly ConversationBlock[]): string {
  return [...blocks].sort((a, b) => a.index - b.index)
    .filter(block => block.kind === 'text').map(block => block.text).join('');
}

/** Desktop's logical response rule: leading tools/status belong to the next text segment. */
export function groupConversationBlocks<Block extends Pick<ConversationBlock, 'kind' | 'index'>>(blocks: readonly Block[]): Block[][] {
  const groups: Block[][] = [];
  let current: Block[] = [];
  for (const block of [...blocks].sort((a, b) => a.index - b.index)) {
    if (current.some(candidate => candidate.kind === 'text')) { groups.push(current); current = []; }
    current.push(block);
  }
  if (current.length) groups.push(current);
  return groups;
}

export function splitConversationPresentation(response: ConversationPresentation): ConversationPresentation[] {
  const groups = groupConversationBlocks(response.blocks);
  return groups.length ? groups.map((blocks, index) => ({ ...response,
    id: `${response.id}:segment:${blocks[0]!.id}`,
    phase: index === groups.length - 1 ? response.phase : 'sealed', blocks,
  })) : [response];
}
