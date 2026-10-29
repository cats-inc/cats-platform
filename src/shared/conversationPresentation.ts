import { readConversationPresentation, type ConversationBlock, type ConversationPresentation } from '@cats-inc/platform-ui-web/contracts';
import { normalizeRuntimeContentBlock } from './runtimeContentBlocks.js';

const DESKTOP_TOOLS = new Set(['request_app_access', 'list_windows', 'screenshot_window', 'read_ui', 'open_app',
  'click', 'drag', 'scroll', 'type_text', 'press_key', 'clipboard_read', 'clipboard_write']);
function desktopTool(name: string | null): boolean {
  return !!name && (DESKTOP_TOOLS.has(name) || /(?:cats-desktop|cats_desktop|desktop-control|desktop_control)/iu.test(name));
}
function clip(text: string): string { return text.length > 2000 ? `${text.slice(0, 2000)}…` : text; }
function toolText(name: string | null, text: string): string {
  return desktopTool(name) ? 'Desktop control details are private.' : clip(text);
}

export function sanitizeConversationBlock(block: ConversationBlock): ConversationBlock {
  if (block.kind === 'text') return { ...block };
  return { ...block, text: toolText(block.toolName, block.text),
    title: desktopTool(block.toolName) ? block.toolName : block.title,
    ...(block.input !== undefined ? { input: toolText(block.toolName, block.input) } : {}),
    ...(block.result != null ? { result: toolText(block.toolName, block.result) } : {}) };
}

/** One execution's sanitized projection; content_block events are cumulative snapshots. */
export class ConversationPresentationReducer {
  readonly id: string;
  private blocks: ConversationBlock[] = [];
  private usesSnapshots = false;
  private readonly tools = new Map<string, { name: string | null; input?: string; result?: string | null }>();
  private phase: ConversationPresentation['phase'] = 'streaming';
  private textBoundary = false;
  constructor(id: string) { this.id = id; }
  private add(kind: ConversationBlock['kind'], text: string): ConversationBlock {
    const block: ConversationBlock = { id: `${this.id}:${this.blocks.length}`, index: this.blocks.length,
      kind, text, status: 'streaming', title: null, toolName: null, toolId: null };
    this.blocks.push(block);
    return block;
  }
  accept(event: Record<string, unknown>): void {
    const metadata = event.metadata as Record<string, unknown> | undefined;
    if (metadata?.kind === 'interaction_requested' || metadata?.kind === 'interaction_updated') return;
    const text = typeof event.text === 'string' ? event.text : '';
    const toolId = typeof event.toolId === 'string' ? event.toolId : null;
    const toolName = typeof event.toolName === 'string' ? event.toolName : null;
    if (event.type === 'tool_use') {
      this.textBoundary = true;
      const rawInput = text || (event.toolArgs === undefined ? '' : JSON.stringify(event.toolArgs));
      if (toolId) this.tools.set(toolId, { name: toolName, input: toolText(toolName, rawInput) });
    }
    if (event.type === 'tool_result') this.textBoundary = true;
    if (event.type === 'tool_result' && toolId) {
      const tool = this.tools.get(toolId) ?? { name: toolName };
      tool.result = toolText(tool.name, text);
      this.tools.set(toolId, tool);
    }
    if (event.type === 'content_block') {
      const block = normalizeRuntimeContentBlock(event);
      if (!block) return;
      const kind = block.metadata?.kind;
      if (kind === 'interaction_requested' || kind === 'interaction_updated') return;
      if (block.kind === 'status' && block.status !== 'error'
        && !['finalizing', 'finishing'].includes(String(kind))) return;
      if (!this.usesSnapshots) { this.usesSnapshots = true; this.blocks = []; }
      const tool = block.toolId ? this.tools.get(block.toolId) : undefined;
      const name = block.toolName ?? tool?.name ?? null;
      const safe = sanitizeConversationBlock({ id: block.id, index: block.index, kind: block.kind, status: block.status,
        title: block.title, toolName: name, toolId: block.toolId,
        text: block.kind === 'text' ? block.text : toolText(name, block.text),
        ...(tool?.input !== undefined ? { input: tool.input } : {}),
        ...(tool?.result !== undefined ? { result: tool.result } : {}),
      });
      const index = this.blocks.findIndex(value => value.id === safe.id);
      if (index < 0) this.blocks.push(safe); else this.blocks[index] = safe;
      return;
    }
    if (event.type === 'error') {
      const block = this.add('status', clip(text)); block.status = 'error';
      return;
    }
    if (this.usesSnapshots) return;
    if (event.type === 'text' && text) {
      const last = this.blocks.at(-1);
      if (last?.kind === 'text' && !this.textBoundary) last.text += text; else this.add('text', text);
      this.textBoundary = false;
    } else if (event.type === 'tool_use') {
      const block = this.add('tool', toolText(toolName, text));
      block.toolName = toolName; block.toolId = toolId;
      block.input = toolId ? this.tools.get(toolId)?.input : toolText(toolName, text);
      block.result = null;
    } else if (event.type === 'tool_result') {
      const block = (toolId ? [...this.blocks].reverse().find(value => value.kind === 'tool' && value.toolId === toolId && value.status === 'streaming') : undefined)
        ?? this.add('tool', '');
      block.toolName ??= toolId ? this.tools.get(toolId)?.name ?? toolName : toolName;
      block.toolId = toolId;
      block.result = toolText(block.toolName, text); block.text = block.result;
      block.status = event.isError ? 'error' : 'complete';
    } else if (event.type === 'progress' && ['finalizing', 'finishing'].includes(String(metadata?.kind))) {
      const block = this.add('status', clip(text)); block.status = 'complete';
    }
  }
  /** Product-owned final text transforms (routing directives/attachments) preserve block order. */
  replaceText(texts: readonly string[], finalSegments?: readonly { kind: string; text: string; toolName: string | null; toolId: string | null }[]): void {
    const blocks = this.blocks.filter(block => block.kind === 'text');
    if (blocks.length === texts.length) {
      blocks.forEach((block, index) => { block.text = texts[index]!; });
    } else if (finalSegments) {
      // Runtime snapshots can merge text across a tool_result while its NDJSON
      // result segments retain the raw boundary. Reconcile from that authoritative
      // observed order so routing/photo transforms cannot silently disappear.
      const rebuilt = new ConversationPresentationReducer(this.id);
      let textIndex = 0;
      for (const segment of finalSegments) rebuilt.accept({ ...segment, type: segment.kind,
        text: segment.kind === 'text' ? texts[textIndex++] ?? '' : segment.text });
      const unmatchedTools = this.blocks.filter(block => block.kind === 'tool');
      let finalTextIndex = 0;
      for (const block of rebuilt.blocks) {
        // Preserve distinct observations in order, including repeated ids. Null
        // ids alone are not an identity and cannot share another tool's input.
        if (block.kind === 'tool') {
          const index = unmatchedTools.findIndex(prior => block.toolId !== null
            ? prior.toolId === block.toolId
            : prior.toolId === null && block.toolName !== null && prior.toolName === block.toolName);
          const prior = index < 0 ? undefined : unmatchedTools.splice(index, 1)[0];
          block.id = prior?.id ?? `${this.id}:final-tool:${block.index}`;
          if (prior?.input !== undefined) block.input = prior.input;
          if (prior?.status === 'error') block.status = 'error';
        } else if (block.kind === 'text') {
          block.id = blocks[finalTextIndex]?.id ?? `${this.id}:final-text:${finalTextIndex}`;
          finalTextIndex++;
        }
      }
      for (const status of this.blocks.filter(block => block.kind === 'status')) {
        rebuilt.blocks.push({ ...status, id: `${this.id}:status:${rebuilt.blocks.length}`, index: rebuilt.blocks.length });
      }
      this.blocks = rebuilt.blocks;
    } else if (!blocks.length) {
      for (const text of texts) this.add('text', text);
    }
  }
  seal(failed = false): void {
    this.phase = 'sealed';
    this.blocks = this.blocks.map(block => block.status === 'streaming'
      ? { ...block, status: failed ? 'error' : 'complete' } : block);
  }
  snapshot(): ConversationPresentation {
    return readConversationPresentation({ version: 1, id: this.id, phase: this.phase, blocks: this.blocks })!;
  }
}
