import { useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';

import type { AppShellPayload } from '../../api/contracts';
import { isChatCat, truncatePath } from '../chatUtils';
import { ComposerCatStack } from './ComposerCatStack';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  ModelSelectorPanel,
  type ModelSelectorValue,
} from './ModelSelector';

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
  allowAddCat?: boolean;
  selectedModel?: ModelSelectorValue;
  onModelChange?: (value: ModelSelectorValue) => void;
  draftHighlightedCatId: string | null;
  onHighlightDraftCat: (catId: string | null) => void;
  draftCatModelOverrides: Map<string, ModelSelectorValue>;
  onDraftCatModelOverride: (catId: string, value: ModelSelectorValue) => void;
  onDirectLaneModelChange?: (catId: string, value: ModelSelectorValue) => void;
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
  allowAddCat = true,
  selectedModel,
  onModelChange,
  draftHighlightedCatId,
  onHighlightDraftCat,
  draftCatModelOverrides,
  onDraftCatModelOverride,
  onDirectLaneModelChange,
}: NewChatDraftProps) {
  const chatCats = payload.chat.cats.filter(isChatCat);
  const leadCat = draftLeadCatId
    ? chatCats.find((cat) => cat.id === draftLeadCatId && cat.status === 'active') ?? null
    : null;
  const hasTelegramBinding = Boolean(
    leadCat && payload.chat.botBindings.some((binding) =>
      binding.platform === 'telegram'
      && binding.status === 'active'
      && binding.catId === leadCat.id),
  );
  const draftLeadCat = !leadCat && draftCatIds.length > 0
    ? chatCats.find((c) => c.id === draftCatIds[0] && c.status === 'active') ?? null
    : null;
  const effectiveLeadCat = leadCat ?? draftLeadCat;
  const hasDraftCats = draftCatIds.length > 0;
  const showSoloSelector = !effectiveLeadCat;
  const nonLeadDraftCatIds = draftLeadCat
    ? draftCatIds.filter((id) => id !== draftLeadCat.id)
    : leadCat
      ? draftCatIds.filter((id) => id !== leadCat.id)
      : draftCatIds;
  const visibleDraftCatIds = leadCat
    ? [leadCat.id, ...draftCatIds.filter((id) => id !== leadCat.id)]
    : draftCatIds;
  const totalCats = (showSoloSelector ? 1 : 0) + visibleDraftCatIds.length;
  const [panelOpen, setPanelOpen] = useState(false);
  const hasMultipleCats = chatCats.filter((c) => c.status === 'active').length > 1;
  const isDirectLaneContext = !allowAddCat && Boolean(draftLeadCatId) && Boolean(leadCat);

  const highlightedCat = draftHighlightedCatId && draftCatIds.includes(draftHighlightedCatId)
    ? chatCats.find((c) => c.id === draftHighlightedCatId) ?? null
    : null;
  const activePanelModel: ModelSelectorValue | null = isDirectLaneContext && leadCat
    ? {
        provider: leadCat.defaultExecutionTarget.provider,
        model: leadCat.defaultExecutionTarget.model,
        instance: leadCat.defaultExecutionTarget.instance,
        modelSelection: leadCat.defaultModelSelection ?? null,
      }
    : highlightedCat
      ? (draftCatModelOverrides.get(highlightedCat.id) ?? {
          provider: highlightedCat.defaultExecutionTarget.provider,
          model: highlightedCat.defaultExecutionTarget.model,
          instance: highlightedCat.defaultExecutionTarget.instance,
          modelSelection: highlightedCat.defaultModelSelection ?? null,
        })
      : selectedModel ?? null;
  const chipLabel = selectedModel
    ? buildModelSelectorLabel(selectedModel)
    : '';

  return (
    <div className="viewShell viewShellDraft">
      <section className="draftShell">
        <div className="draftGreeting">
          {leadCat ? (
            <>
              <p className="eyebrow">Private Chat</p>
              <h1>{leadCat.name}</h1>
              <p className="heroNote">
                {hasTelegramBinding ? 'Telegram-bound private lane.' : 'Private lane for this Cat.'}
              </p>
            </>
          ) : (
            <h1>{greeting}</h1>
          )}
        </div>
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
                  </div>
                ) : null}
              </div>
              {draftCwd ? (
                <span
                  className="composerCwdChip"
                  data-tooltip={draftCwd}
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
            </div>
            {effectiveLeadCat ? (
              <ComposerCatStack
                cats={[effectiveLeadCat, ...nonLeadDraftCatIds
                  .map((id) => chatCats.find((c) => c.id === id))
                  .filter((c): c is NonNullable<typeof c> => c != null)]}
                bossCatId={payload.chat.bossCatId}
                leadCatId={effectiveLeadCat.id}
                onClick={() => setPanelOpen(!panelOpen)}
              />
            ) : activePanelModel && chipLabel ? (
              <div style={{ marginRight: 8 }}>
                <ModelSelectorChip
                  label={chipLabel}
                  onClick={() => setPanelOpen(!panelOpen)}
                />
              </div>
            ) : null}
            {panelOpen && activePanelModel ? (
              isDirectLaneContext && leadCat ? (
                <ModelSelectorPanel
                  mode="direct-lane"
                  cats={[leadCat]}
                  bossCatId={payload.chat.bossCatId}
                  selectedCatIds={[leadCat.id]}
                  highlightedCatId={leadCat.id}
                  leadCatId={leadCat.id}
                  modelValue={activePanelModel}
                  onModelChange={(value) => {
                    onDirectLaneModelChange?.(leadCat.id, value);
                  }}
                  onClose={() => setPanelOpen(false)}
                />
              ) : (
                <ModelSelectorPanel
                  mode="draft"
                  cats={chatCats}
                  bossCatId={payload.chat.bossCatId}
                  selectedCatIds={draftCatIds}
                  highlightedCatId={draftHighlightedCatId}
                  leadCatId={effectiveLeadCat?.id ?? null}
                  onToggleCat={onToggleDraftCat}
                  onHighlightCat={(id) => onHighlightDraftCat(id)}
                  modelValue={activePanelModel}
                  onModelChange={(value) => {
                    if (!effectiveLeadCat && onModelChange) {
                      onModelChange(value);
                    }
                  }}
                  fieldsDisabled={Boolean(effectiveLeadCat) && !isDirectLaneContext}
                  onClose={() => setPanelOpen(false)}
                />
              )
            ) : null}
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
