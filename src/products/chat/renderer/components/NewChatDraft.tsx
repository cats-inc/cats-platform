import type { FormEvent, KeyboardEvent, RefObject } from 'react';

import type { AppShellPayload } from '../../../../shared/app-shell';
import { catInitials, truncatePath } from '../chatUtils';

export interface NewChatDraftProps {
  payload: AppShellPayload;
  composerDraft: string;
  busy: string;
  greeting: string;
  draftFiles: File[];
  draftCwd: string | null;
  draftCatIds: string[];
  plusMenuOpen: boolean;
  plusMenuRef: RefObject<HTMLDivElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  bossCatName: string;
  bossCatAvatarColor: string | null;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onTogglePlusMenu: () => void;
  onFileSelect: () => void;
  onPickFolder: () => void;
  onOpenAddCat: () => void;
  onDraftFilesChange: (files: File[]) => void;
  onDraftCwdClear: () => void;
  onToggleDraftCat: (catId: string) => void;
  autoResize: (el: HTMLTextAreaElement) => void;
  draftLeadCatId: string | null;
  onDraftLeadCatChange: (catId: string | null) => void;
}

export function NewChatDraft({
  payload,
  composerDraft,
  busy,
  greeting,
  draftFiles,
  draftCwd,
  draftCatIds,
  plusMenuOpen,
  plusMenuRef,
  fileInputRef,
  bossCatName,
  bossCatAvatarColor,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  onTogglePlusMenu,
  onFileSelect,
  onPickFolder,
  onOpenAddCat,
  onDraftFilesChange,
  onDraftCwdClear,
  onToggleDraftCat,
  autoResize,
  draftLeadCatId,
  onDraftLeadCatChange,
}: NewChatDraftProps) {
  const showBoss = Boolean(payload.chat.bossCatId);
  const totalCats = (showBoss ? 1 : 0) + draftCatIds.length;
  const hasMultipleCats = payload.chat.cats.filter((c) => c.status === 'active').length > 1;

  return (
    <div className="viewShell viewShellDraft">
      <section className="draftShell">
        <div className="draftGreeting"><h1>{greeting}</h1></div>
        {hasMultipleCats ? (
          <div className="draftLeadSelector">
            <span className="draftLeadLabel">Chat with:</span>
            <div className="draftLeadPills">
              <button
                className={!draftLeadCatId ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
                type="button"
                onClick={() => onDraftLeadCatChange(null)}
              >
                {bossCatName}
              </button>
              {payload.chat.cats
                .filter((c) => c.status === 'active' && c.id !== payload.chat.bossCatId)
                .map((cat) => (
                  <button
                    key={cat.id}
                    className={draftLeadCatId === cat.id ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
                    type="button"
                    onClick={() => onDraftLeadCatChange(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
            </div>
          </div>
        ) : null}
        <form className="composerCard composerCardFresh" onSubmit={(event) => void onSendMessage(event)}>
          {draftFiles.length > 0 ? (
            <div className="composerAttachments">
              {draftFiles.map((file, index) => {
                const isImage = file.type.startsWith('image/');
                return (
                  <div key={`${file.name}-${file.size}-${index}`} className="attachmentCard">
                    <button
                      className="attachmentRemove"
                      type="button"
                      onClick={() => onDraftFilesChange(draftFiles.filter((_, i) => i !== index))}
                      aria-label={`Remove ${file.name}`}
                    >
                      &times;
                    </button>
                    {isImage ? (
                      <img
                        className="attachmentPreview"
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
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
          <textarea
            className="composerInput"
            rows={1}
            placeholder="How can I help you today?"
            value={composerDraft}
            onChange={(event) => { onComposerChange(event.target.value); autoResize(event.target); }}
            onKeyDown={(event) => void onComposerKeyDown(event)}
          />
          <div className="composerBottomRow">
            <div className="composerLeftGroup">
              <div className="composerPlusWrapper" ref={plusMenuRef}>
                <button
                  className="composerPlusButton"
                  type="button"
                  aria-label="Attach"
                  onClick={onTogglePlusMenu}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v10" />
                    <path d="M3 8h10" />
                  </svg>
                </button>
                {plusMenuOpen ? (
                  <div className="composerPlusMenu">
                    <button
                      className="composerPlusMenuItem"
                      type="button"
                      onClick={onFileSelect}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
                        <path d="M8 2v8" />
                        <path d="M4 6l4-4 4 4" />
                      </svg>
                      Add photos and files
                    </button>
                    <button
                      className="composerPlusMenuItem"
                      type="button"
                      onClick={onPickFolder}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                      </svg>
                      Set working directory
                    </button>
                    <button
                      className="composerPlusMenuItem"
                      type="button"
                      onClick={onOpenAddCat}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="5" r="3" />
                        <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" />
                      </svg>
                      Add cat to chat
                    </button>
                  </div>
                ) : null}
              </div>
              {draftCwd ? (
                <span
                  className="composerCwdChip"
                  title={draftCwd}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                  </svg>
                  <span>{truncatePath(draftCwd)}</span>
                  <button
                    className="composerChipClose"
                    type="button"
                    onClick={onDraftCwdClear}
                    aria-label="Remove folder"
                  >
                    &times;
                  </button>
                </span>
              ) : null}
              {totalCats > 0 ? (
                <div className="composerAvatarStack">
                  {showBoss ? (
                    <div className="composerStackItem">
                      <div
                        className="catAvatar composerStackAvatar catAvatarBoss"
                        title={bossCatName}
                        style={bossCatAvatarColor ? { background: bossCatAvatarColor } : undefined}
                      >
                        {catInitials(bossCatName)}
                      </div>
                    </div>
                  ) : null}
                  {draftCatIds.map((id) => {
                    const cat = payload.chat.cats.find((p) => p.id === id);
                    if (!cat) return null;
                    return (
                      <div key={id} className="composerStackItem">
                        <div
                          className="catAvatar composerStackAvatar"
                          title={cat.name}
                          style={cat.avatarColor ? { background: cat.avatarColor } : undefined}
                        >
                          {catInitials(cat.name)}
                        </div>
                        {totalCats > 1 ? (
                          <button
                            className="composerStackRemove"
                            type="button"
                            onClick={() => onToggleDraftCat(id)}
                            aria-label={`Remove ${cat.name}`}
                          >
                            &times;
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <button
              className="composerSendButton"
              disabled={!composerDraft.trim() || busy === 'message:send'}
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
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(event) => {
              const input = event.currentTarget;
              if (input.files && input.files.length > 0) {
                const selected = Array.from(input.files);
                onDraftFilesChange([...draftFiles, ...selected]);
              }
              input.value = '';
            }}
          />
        </form>
      </section>
    </div>
  );
}
