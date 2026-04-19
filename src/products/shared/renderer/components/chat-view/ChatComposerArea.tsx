import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import { truncatePath } from '../../workspaceChatUtils.js';
import { ComposerHighlight } from '../ComposerHighlight.js';
import type { ComposerStackParticipant } from '../ComposerParticipantStack.js';
import type { RecipientChipTarget } from '../ComposerRecipientChip.js';
import { ChatComposerTargetSlot } from './ChatComposerTargetSlot.js';

export interface ChatComposerAreaProps {
  hasConversationStarted: boolean;
  isCompareGroup: boolean;
  isNearBottom: boolean;
  payload: AppShellPayload;
  composerDraft: string;
  channelFiles: File[];
  channelPlusMenuOpen: boolean;
  channelPlusMenuRef: RefObject<HTMLDivElement>;
  channelFileInputRef: RefObject<HTMLInputElement>;
  composerBusy: boolean;
  compareBusy: boolean;
  stopBusy: boolean;
  composerWorkspacePath: string | null;
  directLaneExcludedMentionNames: string[];
  composerRecipients: RecipientChipTarget[];
  defaultRecipientParticipantId: string | null;
  composerStackParticipants: ComposerStackParticipant[];
  isDirectLane: boolean;
  isSoloComposer: boolean;
  activeWorkflowShape: 'sequential' | 'concurrent';
  onToggleActiveWorkflowShape?: () => void;
  activeAudienceKeys: string[] | null;
  onSetActiveAudienceKeys?: (keys: string[]) => void;
  compareSendScope: 'all_members' | 'active_only';
  showCancelComposerAction: boolean;
  showStopComposerAction: boolean;
  composerCardRef: RefCallback<HTMLElement>;
  composerTargetSlot?: ReactNode;
  composerHeaderAccessory?: ReactNode;
  composerHeaderWhereExtras?: ReactNode;
  composerFooterAccessory?: ReactNode;
  modeTag?: ReactNode;
  onOpenSection: (section: string) => void;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleChannelPlusMenu: () => void;
  onChannelFileSelect: () => void;
  onChannelFilesChange: (files: File[]) => void;
  onScrollToBottom: () => void;
  onCompareSendScopeChange?: (value: 'all_members' | 'active_only') => void;
  onCancelPendingSend?: () => void;
  onStopMessage?: () => void;
  autoResize: (element: HTMLTextAreaElement) => void;
}

export function ChatComposerArea({
  hasConversationStarted,
  isCompareGroup,
  isNearBottom,
  payload,
  composerDraft,
  channelFiles,
  channelPlusMenuOpen,
  channelPlusMenuRef,
  channelFileInputRef,
  composerBusy,
  compareBusy,
  stopBusy,
  composerWorkspacePath,
  directLaneExcludedMentionNames,
  composerRecipients,
  defaultRecipientParticipantId,
  composerStackParticipants,
  isDirectLane,
  isSoloComposer,
  activeWorkflowShape,
  onToggleActiveWorkflowShape,
  activeAudienceKeys,
  onSetActiveAudienceKeys,
  compareSendScope,
  showCancelComposerAction,
  showStopComposerAction,
  composerCardRef,
  composerTargetSlot,
  composerHeaderAccessory,
  composerHeaderWhereExtras,
  composerFooterAccessory,
  modeTag,
  onOpenSection,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  onToggleChannelPlusMenu,
  onChannelFileSelect,
  onChannelFilesChange,
  onScrollToBottom,
  onCompareSendScopeChange,
  onCancelPendingSend,
  onStopMessage,
  autoResize,
}: ChatComposerAreaProps) {
  const directLaneRecipient =
    isDirectLane && composerRecipients.length === 1 && composerRecipients[0]?.kind === 'named'
      ? composerRecipients[0]
      : null;
  const directLaneCat =
    directLaneRecipient?.catId
      ? payload.chat.cats.find((cat) => cat.id === directLaneRecipient.catId) ?? null
      : null;

  const stackClassName = (() => {
    const classes = ['composerAreaStack'];
    if (hasConversationStarted) {
      classes.push('composerAreaStackDocked');
      if (isCompareGroup) {
        classes.push('composerAreaStackDockedParallel');
      }
    } else {
      classes.push('composerAreaStackFresh');
    }
    if (channelPlusMenuOpen) {
      classes.push('composerAreaStackMenuOpen');
    }
    return classes.join(' ');
  })();

  return (
    <div className={stackClassName}>
    {(modeTag || composerWorkspacePath || composerHeaderAccessory || composerHeaderWhereExtras) ? (
      <div className="composerHeaderRow">
        <div className="composerHeaderLeft">
          {modeTag}
          {composerWorkspacePath ? (
            <span
              className="composerCwdChip composerCwdClickable"
              data-tooltip={composerWorkspacePath}
              role="button"
              tabIndex={0}
              onClick={() => onOpenSection('cwd')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
              </svg>
              <span>{truncatePath(composerWorkspacePath)}</span>
            </span>
          ) : null}
          {composerHeaderWhereExtras}
        </div>
        {composerHeaderAccessory ? (
          <div className="composerHeaderRight">{composerHeaderAccessory}</div>
        ) : null}
      </div>
    ) : null}
    <form
      ref={composerCardRef}
      className={`${
        hasConversationStarted
          ? isCompareGroup
            ? 'composerCard composerCardDocked composerCardDockedParallel'
            : 'composerCard composerCardDocked'
          : 'composerCard composerCardFresh'
      }${channelPlusMenuOpen ? ' composerCardMenuOpen' : ''}`}
      onSubmit={(event) => void onSendMessage(event)}
    >
      {hasConversationStarted && !isNearBottom ? (
        <button
          className="scrollToBottomButton"
          type="button"
          aria-label="Scroll to latest"
          onClick={onScrollToBottom}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v10" />
            <path d="M3 9l5 5 5-5" />
          </svg>
        </button>
      ) : null}
      {channelFiles.length > 0 ? (
        <div className="composerAttachments">
          {channelFiles.map((file, index) => {
            const isImage = file.type.startsWith('image/');
            return (
              <div key={`${file.name}-${file.size}-${index}`} className="attachmentCard">
                <button
                  className="attachmentRemove"
                  type="button"
                  disabled={composerBusy}
                  onClick={() => onChannelFilesChange(channelFiles.filter((_, i) => i !== index))}
                  aria-label={`Remove ${file.name}`}
                >
                  &times;
                </button>
                {isImage ? (
                  <img
                    className="attachmentPreview"
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    onLoad={(event) => URL.revokeObjectURL((event.target as HTMLImageElement).src)}
                  />
                ) : (
                  <div className="attachmentFileIcon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </div>
                )}
                <span className="attachmentName">{file.name}</span>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="composerInputWrapper">
        <ComposerHighlight
          text={composerDraft}
          cats={payload.chat.cats}
          excludedMentionNames={directLaneExcludedMentionNames}
        />
        <textarea
          className="composerInput composerInputOverlay"
          rows={1}
          placeholder={compareBusy ? 'Waiting for parallel replies...' : hasConversationStarted ? 'Reply...' : 'How can I help you today?'}
          value={composerDraft}
          disabled={composerBusy}
          onChange={(event) => {
            onComposerChange(event.target.value);
            autoResize(event.target);
          }}
          onKeyDown={(event) => void onComposerKeyDown(event)}
        />
      </div>
      <div className="composerBottomRow">
        <div className="composerLeftGroup">
          <div className="composerPlusWrapper" ref={channelPlusMenuRef}>
            <button
              className="composerPlusButton"
              type="button"
              aria-label="Attach"
              disabled={composerBusy}
              onClick={onToggleChannelPlusMenu}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v10" />
                <path d="M3 8h10" />
              </svg>
            </button>
            {channelPlusMenuOpen ? (
              <div className="composerPlusMenu">
                <button
                  className="composerPlusMenuItem"
                  type="button"
                  disabled={composerBusy}
                  onClick={onChannelFileSelect}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
                    <path d="M8 2v8" />
                    <path d="M4 6l4-4 4 4" />
                  </svg>
                  Add photos and files
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="composerRightGroup">
          {composerTargetSlot ?? (
            <ChatComposerTargetSlot
              payload={payload}
              composerBusy={composerBusy}
              composerRecipients={composerRecipients}
              defaultRecipientParticipantId={defaultRecipientParticipantId}
              composerStackParticipants={composerStackParticipants}
              directLaneCat={directLaneCat}
              isDirectLane={isDirectLane}
              isSoloComposer={isSoloComposer}
              activeWorkflowShape={activeWorkflowShape}
              onToggleActiveWorkflowShape={onToggleActiveWorkflowShape}
              activeAudienceKeys={activeAudienceKeys}
              onSetActiveAudienceKeys={onSetActiveAudienceKeys}
              onOpenSection={onOpenSection}
            />
          )}
          {showCancelComposerAction ? (
            <button
              className="composerSendButton composerCancelButton"
              type="button"
              aria-label="Cancel send"
              onClick={() => onCancelPendingSend?.()}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M4 4l6 6" />
                <path d="M10 4l-6 6" />
              </svg>
            </button>
          ) : showStopComposerAction ? (
            <button
              className="composerSendButton composerStopButton"
              disabled={stopBusy}
              type="button"
              aria-label="Stop"
              onClick={() => void onStopMessage?.()}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="3" y="3" width="8" height="8" rx="1.6" />
              </svg>
            </button>
          ) : isCompareGroup ? (
            <div className="composerSplitSend">
              <button
                className="composerSplitSendMain"
                disabled={!composerDraft.trim() || composerBusy || compareBusy}
                type="submit"
                aria-label={compareSendScope === 'all_members' ? 'Send to all chats' : 'Send to this chat'}
              >
                {compareSendScope === 'all_members' ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 13V6" /><path d="M1 9l3-3 3 3" />
                    <path d="M12 13V6" /><path d="M9 9l3-3 3 3" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 13V3" />
                    <path d="M3 7l5-5 5 5" />
                  </svg>
                )}
              </button>
              <button
                className="composerSplitSendToggle"
                type="button"
                aria-label="Switch send mode"
                onClick={() => onCompareSendScopeChange?.(compareSendScope === 'all_members' ? 'active_only' : 'all_members')}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 3l3 3 3-3" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              className="composerSendButton"
              disabled={!composerDraft.trim() || composerBusy || compareBusy}
              type="submit"
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 13V3" />
                <path d="M3 7l5-5 5 5" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <input
        ref={channelFileInputRef}
        type="file"
        multiple
        disabled={composerBusy}
        style={{ display: 'none' }}
        onChange={(event) => {
          const input = event.currentTarget;
          if (input.files && input.files.length > 0) {
            const selected = Array.from(input.files);
            onChannelFilesChange([...channelFiles, ...selected]);
          }
          input.value = '';
        }}
      />
    </form>
    {composerFooterAccessory ? (
      <div className="composerFooterRow">{composerFooterAccessory}</div>
    ) : null}
    </div>
  );
}
