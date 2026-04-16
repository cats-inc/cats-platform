import type { ParallelChatRelayCommandKind } from '../../../api/contracts.js';
import {
  RelayActionIcon,
  RetryActionIcon,
  TranscriptMessageActions as SharedTranscriptMessageActions,
  type TranscriptMessageActionDescriptor,
} from '../../../../shared/renderer/components/chat-view/TranscriptMessageActions.js';

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
  showRetryAction?: boolean;
  retryBusy?: boolean;
  onRetryMessage?: (messageId: string) => Promise<void>;
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
  showRetryAction = false,
  retryBusy = false,
  onRetryMessage,
  onCopyMessage,
  onToggleRelayMenu,
  onCloseRelayMenu,
  onRelayMessage,
}: TranscriptMessageActionsProps) {
  const extraActions: TranscriptMessageActionDescriptor[] = [];

  if (senderKind === 'user' && showRetryAction && onRetryMessage) {
    extraActions.push({
      key: `retry:${messageId}`,
      title: 'Retry response',
      icon: <RetryActionIcon />,
      disabled: retryBusy,
      onSelect: () => {
        void onRetryMessage(messageId);
      },
    });
  }

  if (isCompareGroup && senderKind !== 'user' && onRelayMessage) {
    extraActions.push({
      key: `relay:${messageId}`,
      kind: 'menu',
      title: 'Relay to others',
      icon: <RelayActionIcon />,
      disabled: compareBusy,
      open: relayMenuOpen,
      onToggle: onToggleRelayMenu,
      items: relayActions.map((action, index) => ({
        key: action.command,
        label: action.label,
        disabled: compareBusy,
        dividerBefore: index === 2 || index === 4,
        onSelect: () => {
          onCloseRelayMenu();
          void onRelayMessage(messageId, action.command);
        },
      })),
    });
  }

  return (
    <SharedTranscriptMessageActions
      senderKind={senderKind}
      showDefaultCopyAction={messageBody.trim().length > 0}
      onCopyMessage={() => {
        void onCopyMessage(messageBody);
      }}
      extraActions={extraActions}
    />
  );
}
