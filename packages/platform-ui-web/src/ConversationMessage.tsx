import type { ReactNode } from 'react';
import { TranscriptMessageActions, type TranscriptMessageActionDescriptor } from './TranscriptMessageActions.js';

/** Extracted from Desktop TranscriptMessageItem. Product adapters supply all policy and body slots. */
export function ConversationMessage({ senderKind, stackClassName, bubbleClassName, speaker, children,
  afterBubble, actions, copyLabel, onCopy, showCopy = false, id,
}: {
  senderKind: string;
  stackClassName?: string;
  bubbleClassName?: string;
  speaker?: ReactNode;
  children?: ReactNode;
  afterBubble?: ReactNode;
  actions?: ReadonlyArray<TranscriptMessageActionDescriptor>;
  copyLabel: string;
  onCopy?: () => void;
  showCopy?: boolean;
  id?: string;
}) {
  const tone = senderKind === 'user' ? 'User' : senderKind === 'system' ? 'System' : 'Agent';
  return <article className={stackClassName ?? `transcriptMessageStack transcriptMessageStack${tone}`}
    data-response-id={id}>
    <div className={bubbleClassName ?? `transcriptMessage transcriptMessage${tone}`}>
      {speaker}{children}
    </div>
    <TranscriptMessageActions senderKind={senderKind} showDefaultCopyAction={showCopy}
      copyActionLabel={copyLabel} onCopyMessage={onCopy} extraActions={actions} />
    {afterBubble}
  </article>;
}
