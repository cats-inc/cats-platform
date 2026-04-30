import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from 'react';

import { ToastContainer } from '../../../../../design/components/Toast.js';
import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import { useVoiceInputComposer } from '../../hooks/useVoiceInputComposer.js';
import { truncatePath } from '../../workspaceChatUtils.js';
import { ComposerHighlight } from '../ComposerHighlight.js';
import type { ComposerStackParticipant } from '../ComposerParticipantStack.js';
import type { RecipientChipTarget } from '../ComposerRecipientChip.js';
import { ChatComposerTargetSlot } from './ChatComposerTargetSlot.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

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
  surfaceTag?: ReactNode;
  onOpenSection: (section: string) => void;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleChannelPlusMenu: () => void;
  onChannelFileSelect: () => void;
  onTakeScreenshot?: () => void;
  screenshotCaptureDisabled?: boolean;
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
  surfaceTag,
  onOpenSection,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  onToggleChannelPlusMenu,
  onChannelFileSelect,
  onTakeScreenshot,
  screenshotCaptureDisabled = false,
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
  const hasSendableContent = composerDraft.trim().length > 0 || channelFiles.length > 0;

  const {
    supported: voiceInputSupported,
    listening: voiceInputListening,
    toggle: toggleVoiceInput,
    textareaRef,
    toasts: voiceInputToasts,
    privacyMessage: voiceInputPrivacyMessage,
  } = useVoiceInputComposer({
    value: composerDraft,
    onChange: onComposerChange,
    autoResize,
    disabled: composerBusy,
  });

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
  const { t } = useI18n();
  const composerPlaceholder = compareBusy
    ? t(messageKeys.chatComposerAreaPlaceholderParallelWaiting)
    : hasConversationStarted
      ? t(messageKeys.chatComposerAreaPlaceholderReply)
      : t(messageKeys.chatNewChatDraftComposerPlaceholder);
  const voiceInputLabel = voiceInputListening
    ? t(
      messageKeys.chatNewChatDraftStopVoiceInputAria,
      { privacyMessageSuffix: voiceInputPrivacyMessage ?? '' },
    )
    : t(messageKeys.chatNewChatDraftStartVoiceInputAria);
  const sendLabel = compareSendScope === 'all_members'
    ? t(messageKeys.chatNewChatDraftSendAllChatsAria)
    : t(messageKeys.chatComposerAreaSendToThisChatAria);
  const composerStopLabel = t(messageKeys.chatComposerAreaStopButtonLabel);
  const switchSendModeLabel = t(messageKeys.chatComposerAreaSwitchSendModeLabel);

  return (
    <div className={stackClassName}>
    {(surfaceTag || composerWorkspacePath || composerHeaderAccessory || composerHeaderWhereExtras) ? (
      <div className="composerHeaderRow">
        <div className="composerHeaderLeft">
          {surfaceTag}
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
          aria-label={t(messageKeys.chatComposerAreaScrollToLatestAria)}
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
                  aria-label={t(messageKeys.chatNewChatDraftAttachmentRemoveAria, {
                    fileName: file.name,
                  })}
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
          ref={textareaRef}
          className="composerInput composerInputOverlay"
          rows={1}
          placeholder={composerPlaceholder}
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
              aria-label={t(messageKeys.chatComposerAreaAttachAria)}
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
                  {t(messageKeys.chatNewChatDraftAddPhotosAndFiles)}
                </button>
                {onTakeScreenshot ? (
                  <button
                    className="composerPlusMenuItem"
                    type="button"
                    disabled={composerBusy || screenshotCaptureDisabled}
                    onClick={onTakeScreenshot}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 3.5l1-1h4l1 1h2a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1h2z" />
                      <circle cx="8" cy="8.5" r="2.5" />
                    </svg>
                    {t(messageKeys.chatNewChatDraftTakeScreenshot)}
                  </button>
                ) : null}
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
          {voiceInputSupported ? (
            <button
              className={`composerPlusButton composerVoiceButton${voiceInputListening ? ' composerVoiceButtonActive' : ''}`}
              type="button"
              aria-label={voiceInputLabel}
              aria-pressed={voiceInputListening}
              title={voiceInputPrivacyMessage ?? undefined}
              disabled={composerBusy}
              onClick={toggleVoiceInput}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="6" y="2" width="4" height="8" rx="2" />
                <path d="M3 8a5 5 0 0 0 10 0" />
                <path d="M8 13v2" />
                <path d="M6 15h4" />
              </svg>
              {voiceInputPrivacyMessage ? (
                <span className="composerVoicePrivacyBadge" aria-hidden="true">!</span>
              ) : null}
            </button>
          ) : null}
          {showCancelComposerAction ? (
            <button
              className="composerSendButton composerCancelButton"
              type="button"
              aria-label={t(messageKeys.chatNewChatDraftCancelSendAria)}
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
              aria-label={composerStopLabel}
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
                disabled={!hasSendableContent || composerBusy || compareBusy}
                type="submit"
                aria-label={sendLabel}
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
                aria-label={switchSendModeLabel}
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
              disabled={!hasSendableContent || composerBusy || compareBusy}
              type="submit"
              aria-label={t(messageKeys.chatNewChatDraftSendAria)}
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
    <ToastContainer toasts={voiceInputToasts} />
    </div>
  );
}
