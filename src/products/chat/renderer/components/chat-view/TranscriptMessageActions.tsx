import type { ParallelChatRelayCommandKind } from '../../../api/contracts.js';

const relayActions: Array<{
  command: ParallelChatRelayCommandKind;
  label: string;
}> = [
  { command: 'check_this', label: 'Check with others' },
  { command: 'synthesize_this', label: 'Synthesize with others' },
  { command: 'improve_this', label: 'Improve in others' },
  { command: 'adopt_this', label: 'Adopt in others' },
  { command: 'counter_this', label: 'Counter with others' },
  { command: 'debate_this', label: 'Debate with others' },
];

export interface TranscriptMessageActionsProps {
  messageId: string;
  messageBody: string;
  senderKind: string;
  compareBusy: boolean;
  isCompareGroup: boolean;
  relayMenuOpen: boolean;
  onCopyMessage: (body: string) => Promise<void>;
  onToggleRelayMenu: () => void;
  onCloseRelayMenu: () => void;
  onRelayMessage?: (messageId: string, command: ParallelChatRelayCommandKind) => Promise<void>;
}

export function TranscriptMessageActions({
  messageId,
  messageBody,
  senderKind,
  compareBusy,
  isCompareGroup,
  relayMenuOpen,
  onCopyMessage,
  onToggleRelayMenu,
  onCloseRelayMenu,
  onRelayMessage,
}: TranscriptMessageActionsProps) {
  if (senderKind === 'system') {
    return null;
  }

  return (
    <div
      className={[
        'messageActions',
        senderKind === 'user'
          ? 'messageActionsHoverOnly'
          : 'messageActionsPersistent',
      ].join(' ')}
    >
      <button
        className="messageActionIcon"
        type="button"
        onClick={() => {
          void onCopyMessage(messageBody);
        }}
        title="Copy message"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      {isCompareGroup && senderKind !== 'user' && onRelayMessage ? (
        <div className="messageActionMenu">
          <button
            className="messageActionIcon"
            type="button"
            disabled={compareBusy}
            title="Relay to others"
            onClick={onToggleRelayMenu}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
          {relayMenuOpen ? (
            <div className="messageActionPopover">
              {relayActions.map((action, index) => (
                <div key={action.command}>
                  {index === 2 || index === 4 ? (
                    <div className="messageActionPopoverDivider" />
                  ) : null}
                  <button
                    type="button"
                    disabled={compareBusy}
                    onClick={() => {
                      onCloseRelayMenu();
                      void onRelayMessage(messageId, action.command);
                    }}
                  >
                    {action.label}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
