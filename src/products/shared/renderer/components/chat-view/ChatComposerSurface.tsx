import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import { ChatComposerArea } from './ChatComposerArea.js';

export interface ChatComposerSurfaceProps {
  hasConversationStarted: boolean;
  payload: AppShellPayload;
  composerDraft: string;
  channelFiles: File[];
  channelPlusMenuOpen: boolean;
  channelPlusMenuRef: RefObject<HTMLDivElement>;
  channelFileInputRef: RefObject<HTMLInputElement>;
  composerBusy: boolean;
  compareBusy?: boolean;
  isCompareGroup?: boolean;
  compareSendScope?: 'all_members' | 'active_only';
  composerWorkspacePath: string | null;
  directLaneExcludedMentionNames: string[];
  composerTargetSlot?: ReactNode;
  composerCardRef: RefCallback<HTMLElement>;
  isNearBottom?: boolean;
  showCancelComposerAction?: boolean;
  showStopComposerAction?: boolean;
  stopBusy?: boolean;
  onOpenSection: (section: string) => void;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleChannelPlusMenu: () => void;
  onChannelFileSelect: () => void;
  onChannelFilesChange: (files: File[]) => void;
  onScrollToBottom?: () => void;
  onCompareSendScopeChange?: (value: 'all_members' | 'active_only') => void;
  onCancelPendingSend?: () => void;
  onStopMessage?: () => void;
  autoResize: (element: HTMLTextAreaElement) => void;
}

export function ChatComposerSurface({
  compareBusy = false,
  isCompareGroup = false,
  compareSendScope = 'active_only',
  isNearBottom = true,
  showCancelComposerAction = false,
  showStopComposerAction = false,
  stopBusy = false,
  onScrollToBottom = () => {},
  ...props
}: ChatComposerSurfaceProps) {
  return (
    <ChatComposerArea
      {...props}
      isCompareGroup={isCompareGroup}
      isNearBottom={isNearBottom}
      compareBusy={compareBusy}
      compareSendScope={compareSendScope}
      stopBusy={stopBusy}
      composerRecipients={[]}
      defaultRecipientParticipantId={null}
      composerStackParticipants={[]}
      isDirectLane={false}
      isSoloComposer
      activeWorkflowShape="sequential"
      activeAudienceKeys={null}
      showCancelComposerAction={showCancelComposerAction}
      showStopComposerAction={showStopComposerAction}
      onScrollToBottom={onScrollToBottom}
    />
  );
}
