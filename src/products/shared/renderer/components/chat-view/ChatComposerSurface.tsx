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

export interface ChatComposerSurfaceProps {
  hasConversationStarted: boolean;
  payload: AppShellPayload;
  composerDraft: string;
  channelFiles: File[];
  channelPlusMenuOpen: boolean;
  channelPlusMenuRef: RefObject<HTMLDivElement>;
  channelFileInputRef: RefObject<HTMLInputElement>;
  composerBusy: boolean;
  composerWorkspacePath: string | null;
  directLaneExcludedMentionNames: string[];
  composerTargetSlot?: ReactNode;
  composerCardRef: RefCallback<HTMLElement>;
  onOpenSection: (section: string) => void;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleChannelPlusMenu: () => void;
  onChannelFileSelect: () => void;
  onChannelFilesChange: (files: File[]) => void;
  autoResize: (element: HTMLTextAreaElement) => void;
}

export function ChatComposerSurface({
  hasConversationStarted,
  payload,
  composerDraft,
  channelFiles,
  channelPlusMenuOpen,
  channelPlusMenuRef,
  channelFileInputRef,
  composerBusy,
  composerWorkspacePath,
  directLaneExcludedMentionNames,
  composerTargetSlot,
  composerCardRef,
  onOpenSection,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  onToggleChannelPlusMenu,
  onChannelFileSelect,
  onChannelFilesChange,
  autoResize,
}: ChatComposerSurfaceProps) {
  return (
    <form
      ref={composerCardRef}
      className={`${
        hasConversationStarted
          ? 'composerCard composerCardDocked'
          : 'composerCard composerCardFresh'
      }${channelPlusMenuOpen ? ' composerCardMenuOpen' : ''}`}
      onSubmit={(event) => void onSendMessage(event)}
    >
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
          placeholder="How can I help you today?"
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
          {(() => {
            if (!composerWorkspacePath) return null;
            return (
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
            );
          })()}
        </div>
        {composerTargetSlot ?? null}
        <button
          className="composerSendButton"
          disabled={!composerDraft.trim() || composerBusy}
          type="submit"
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 13V3" />
            <path d="M3 7l5-5 5 5" />
          </svg>
        </button>
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
  );
}
