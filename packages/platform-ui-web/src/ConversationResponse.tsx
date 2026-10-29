import type { ReactNode } from 'react';
import { conversationPlainText, splitConversationPresentation, type ConversationBlock, type ConversationPresentation } from './contracts.js';
import { ConversationMessage } from './ConversationMessage.js';
import { ConversationMarkdown } from './ConversationMarkdown.js';
export interface ConversationLabels {
  tool: string;
  input: string;
  result: string;
  noResult: string;
  error: string;
}

export function TypingDots() { return <span className="typingDots"><span /><span /><span /></span>; }

/** Desktop's ordered text/tool/status layer. It never reads arbitrary Runtime metadata. */
export function ConversationContentBlock({ block, showProgressDetails, renderText, labels }: {
  block: ConversationBlock;
  showProgressDetails: boolean;
  renderText?: (text: string) => ReactNode;
  labels: ConversationLabels;
}) {
  if (block.kind !== 'text' && !showProgressDetails && block.status !== 'error') return null;
  if (block.kind === 'text') {
    const text = block.text.replace(/^(?:[ \t]*\r?\n)+/u, '');
    return text.trim() ? <>{renderText ? renderText(text) : <div className="messageBodyWrapper"><ConversationMarkdown text={text} /></div>}</> : null;
  }
  if (block.kind === 'tool') {
    const chip = <div className={block.status === 'streaming' ? 'toolSegmentChip'
      : block.status === 'error' ? 'toolSegmentChip toolSegmentChipError' : 'toolSegmentChip toolSegmentChipDone'}>
      {block.status === 'error' ? <span role="img" aria-label={labels.error} title={labels.error}>✕</span> : null}
      <span className="toolSegmentChipName">{block.toolName ?? block.title ?? labels.tool}</span>
      {block.text ? <span className="toolSegmentChipDetail">{block.text}</span> : null}
    </div>;
    // Inputs/results are an explicitly sanitized product capability, never reconstructed from text.
    return block.input !== undefined || block.result !== undefined
      ? <details className="conversationToolDetails" data-block-id={block.id}>
          <summary>{chip}</summary>
          {block.input ? <><div className="conversationToolLabel">{labels.input}</div><pre>{block.input}</pre></> : null}
          <div className="conversationToolLabel">{labels.result}</div><pre>{block.result ?? labels.noResult}</pre>
        </details>
      : chip;
  }
  return block.text ? <p className="typingStatusText">{block.text}</p> : null;
}

/** Also used by Desktop's product-owned compare and focus layouts. */
export function ConversationSegmentBody({ phase, blocks, showProgressDetails, labels, renderText,
  progressText = '', renderedBlocks, showTrailingDots,
}: {
  phase: ConversationPresentation['phase'];
  blocks: readonly ConversationBlock[];
  showProgressDetails: boolean;
  labels: ConversationLabels;
  renderText?: (text: string) => ReactNode;
  progressText?: string;
  renderedBlocks?: readonly ReactNode[];
  showTrailingDots?: boolean;
}) {
  if (phase === 'waiting') return <TypingDots />;
  const sorted = [...blocks].sort((a, b) => a.index - b.index);
  const visible = sorted.filter(block => block.kind === 'text' ? block.text.trim()
    : showProgressDetails || block.status === 'error');
  const rendered = renderedBlocks ?? visible.map(block => <ConversationContentBlock key={block.id}
    block={block} showProgressDetails={showProgressDetails} labels={labels} renderText={renderText} />);
  const last = sorted.at(-1);
  const trailing = showTrailingDots ?? (phase === 'streaming' && last?.kind !== 'text' && last?.status === 'streaming');
  if (!rendered.length) {
    if (showProgressDetails && progressText) return <p className="typingStatusText">{progressText}</p>;
    return phase === 'streaming' || trailing ? <TypingDots /> : null;
  }
  return <>{rendered}{trailing ? <TypingDots /> : null}</>;
}

/** Desktop inline response composition, with product-supplied speaker/clipboard/locale callbacks. */
export function ConversationResponse({ response, speaker, copyLabel, onCopy, afterBubble, ...body }: {
  response: ConversationPresentation;
  speaker?: ReactNode;
  copyLabel: string;
  onCopy?: (text: string) => void;
  afterBubble?: ReactNode;
} & Omit<Parameters<typeof ConversationSegmentBody>[0], 'phase' | 'blocks'>) {
  const parts = body.renderedBlocks ? [response] : splitConversationPresentation(response)
    .filter(part => part.phase !== 'sealed' || part.blocks.some(block => block.kind === 'text'
      ? block.text.trim() : body.showProgressDetails || block.status === 'error'));
  return <>{parts.map((part, index) => <ConversationMessage key={part.id} id={part.id} senderKind="agent"
    stackClassName="transcriptMessageStack transcriptMessageStackAgent typingIndicator"
    speaker={index === 0 ? speaker : null} showCopy={part.phase === 'sealed' && !!conversationPlainText(part.blocks).trim()}
    copyLabel={copyLabel} onCopy={() => onCopy?.(conversationPlainText(part.blocks))}
    afterBubble={index === parts.length - 1 ? afterBubble : null}>
    <ConversationSegmentBody phase={part.phase} blocks={part.blocks} {...body} />
  </ConversationMessage>)}</>;
}
