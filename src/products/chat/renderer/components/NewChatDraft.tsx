import { useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';

import type { AppShellPayload } from '../../api/contracts';
import type { NewChatMode } from '../../shared/channelPaths.js';
import { SidePanel, type SidePanelSection } from '../../../../design/components/SidePanel';
import type { BrowseDirectoryEntry } from '../api';
import { resolveDraftParticipantSelection } from '../draftParticipants';
import { isChatCat, truncatePath } from '../chatUtils';
import { CatAvatarRow } from './CatAvatarRow';
import { ComposerCatStack } from './ComposerCatStack';
import { FolderBrowserContent } from './FolderBrowser';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorValue,
} from './ModelSelector';
import { ProviderModelFields } from './ProviderModelFields';
import { isComposerAckBusy, isComposerBusy } from '../../../../shared/composer';
import type { ProviderTargetSelection } from '../../../../shared/providerSelection';

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
  onCancelPendingSend?: () => void;
  onTogglePlusMenu: () => void;
  onFileSelect: () => void;
  onPickFolder: () => void;
  onOpenAddCat: () => void;
  onDraftFilesChange: (files: File[]) => void;
  onDraftCwdClear: () => void;
  onToggleDraftCat: (catId: string) => void;
  autoResize: (el: HTMLTextAreaElement) => void;
  draftLeadCatId: string | null;
  entryMode?: NewChatMode;
  onDraftLeadCatChange: (catId: string | null) => void;
  allowAddCat?: boolean;
  selectedModel?: ModelSelectorValue;
  onModelChange?: (value: ModelSelectorValue) => void;
  draftHighlightedCatId: string | null;
  onHighlightDraftCat: (catId: string | null) => void;
  draftCatModelOverrides: Map<string, ModelSelectorValue>;
  onDraftCatModelOverride: (catId: string, value: ModelSelectorValue) => void;
  onDirectLaneModelChange?: (catId: string, value: ModelSelectorValue) => void;
  parallelTargets?: ModelSelectorValue[];
  onParallelTargetChange?: (index: number, value: ModelSelectorValue) => void;
  onAddParallelTarget?: () => void;
  onRemoveParallelTarget?: (index: number) => void;
  folderBrowsePath?: string;
  folderBrowseCurrentPath?: string;
  folderBrowseParentPath?: string;
  folderBrowseEntries?: BrowseDirectoryEntry[];
  folderBrowseLoading?: boolean;
  folderBrowseError?: string;
  onFolderBrowsePathChange?: (path: string) => void;
  onFolderBrowse?: (path: string) => void;
  onFolderBrowseSelect?: () => void;
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
  onCancelPendingSend,
  onTogglePlusMenu,
  onFileSelect,
  onPickFolder,
  onOpenAddCat,
  onDraftFilesChange,
  onDraftCwdClear,
  onToggleDraftCat,
  autoResize,
  draftLeadCatId,
  entryMode = 'default',
  onDraftLeadCatChange,
  allowAddCat = true,
  selectedModel,
  onModelChange,
  draftHighlightedCatId,
  onHighlightDraftCat,
  draftCatModelOverrides,
  onDraftCatModelOverride,
  onDirectLaneModelChange,
  parallelTargets,
  onParallelTargetChange,
  onAddParallelTarget,
  onRemoveParallelTarget,
  folderBrowsePath = '',
  folderBrowseCurrentPath = '',
  folderBrowseParentPath = '',
  folderBrowseEntries = [],
  folderBrowseLoading = false,
  folderBrowseError = '',
  onFolderBrowsePathChange,
  onFolderBrowse,
  onFolderBrowseSelect,
}: NewChatDraftProps) {
  const isParallelMode = (parallelTargets?.length ?? 0) >= 2;
  const chatCats = payload.chat.cats.filter(isChatCat);
  const activeChatCats = chatCats.filter((cat) => cat.status === 'active');
  const draftParticipants = resolveDraftParticipantSelection({ draftLeadCatId, draftCatIds });
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
    ? chatCats.find((c) => c.id === draftParticipants.effectiveLeadCatId && c.status === 'active') ?? null
    : null;
  const effectiveLeadCat = leadCat ?? draftLeadCat;
  const draftParticipantCount = draftParticipants.participantCatIds.length;
  const isGroupDraft = entryMode === 'group' || draftParticipantCount > 1;
  const hasDraftCats = draftCatIds.length > 0;
  const showSoloSelector = !effectiveLeadCat;
  const nonLeadDraftCatIds = draftLeadCat
    ? draftCatIds.filter((id) => id !== draftLeadCat.id)
    : leadCat
      ? draftCatIds.filter((id) => id !== leadCat.id)
      : draftCatIds;
  const visibleDraftCatIds = draftParticipants.participantCatIds;
  const totalCats = (showSoloSelector ? 1 : 0) + visibleDraftCatIds.length;
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('cats');
  function openSidePanelTo(section: string): void {
    setSidePanelOpen(true);
    switchSection(section);
  }
  function switchSection(section: string): void {
    setSidePanelSection(section);
    if (section === 'cwd' && !folderBrowseCurrentPath && !folderBrowseLoading) {
      onPickFolder();
    }
  }
  const isDirectLaneContext = !allowAddCat && Boolean(draftLeadCatId) && Boolean(leadCat);
  const isCatLedDraft = !isDirectLaneContext && Boolean(effectiveLeadCat) && !isGroupDraft;
  const groupDraftSelectionLabel = draftParticipantCount === 1
    ? '1 participant selected so far. Add more or send when ready.'
    : draftParticipantCount > 1
      ? `${draftParticipantCount} participants selected for this shared chat.`
      : activeChatCats.length > 0
        ? 'Choose which Cats should join this shared chat.'
        : 'Add Cats in Settings before starting a shared chat.';

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
  const chipLabel = selectedModel ? buildModelSelectorLabel(selectedModel) : '';
  const isAckPending = isComposerAckBusy(busy);
  const isSubmittingFirstTurn = isComposerBusy(busy) || isAckPending;
  const showCancelPendingSend = isAckPending && onCancelPendingSend != null;

  return (
    <div className="viewShell viewShellDraft">
      <section className="draftShell">
        <div className="draftGreeting">
          {isDirectLaneContext && leadCat ? (
            <>
              <p className="eyebrow">Private Chat</p>
              <h1>{leadCat.name}</h1>
              <p className="heroNote">
                {hasTelegramBinding ? 'Telegram-bound private lane.' : 'Private lane for this Cat.'}
              </p>
            </>
          ) : isGroupDraft ? (
            <>
              <p className="eyebrow">Group Chat</p>
              <h1>Start a group chat</h1>
              <p className="heroNote">{groupDraftSelectionLabel}</p>
              {allowAddCat ? (
                <div className="draftGreetingActions">
                  <button
                    className="secondaryButton"
                    type="button"
                    disabled={isSubmittingFirstTurn || activeChatCats.length === 0}
                    onClick={onOpenAddCat}
                  >
                    {draftCatIds.length > 0 ? 'Edit participants' : 'Choose participants'}
                  </button>
                </div>
              ) : null}
            </>
          ) : isCatLedDraft && effectiveLeadCat ? (
            <>
              <p className="eyebrow">Cat-led Chat</p>
              <h1>Start with {effectiveLeadCat.name}</h1>
              <p className="heroNote">
                {effectiveLeadCat.name} will lead this draft. Add more Cats anytime, or keep the thread focused.
              </p>
            </>
          ) : (
            <h1>{greeting}</h1>
          )}
        </div>
        <form className={`composerCard composerCardFresh${parallelTargets ? ' parallelComposerAnchor' : ''}`} onSubmit={(event) => void onSendMessage(event)}>
          {draftFiles.length > 0 ? (
            <div className="composerAttachments">
              {draftFiles.map((file, index) => {
                const isImage = file.type.startsWith('image/');
                return (
                  <div key={`${file.name}-${file.size}-${index}`} className="attachmentCard">
                    <button
                      className="attachmentRemove"
                      type="button"
                      disabled={isSubmittingFirstTurn}
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
            disabled={isSubmittingFirstTurn}
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
                  disabled={isSubmittingFirstTurn}
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
                      disabled={isSubmittingFirstTurn}
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
                      disabled={isSubmittingFirstTurn}
                      onClick={() => {
                        openSidePanelTo('cwd');
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                      </svg>
                      Choose folder
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
                    disabled={isSubmittingFirstTurn}
                    onClick={onDraftCwdClear}
                    aria-label="Remove folder"
                  >
                    &times;
                  </button>
                </span>
              ) : null}
            </div>
            {isParallelMode && parallelTargets?.[0] ? (
              <div style={{ marginRight: 8 }}>
                <ModelSelectorChip
                  label={buildModelSelectorLabel(parallelTargets[0])}
                  onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo('parallel:0')}
                />
              </div>
            ) : effectiveLeadCat ? (
              <ComposerCatStack
                cats={[effectiveLeadCat, ...nonLeadDraftCatIds
                  .map((id) => chatCats.find((c) => c.id === id))
                  .filter((c): c is NonNullable<typeof c> => c != null)]}
                bossCatId={payload.chat.bossCatId}
                leadCatId={effectiveLeadCat.id}
                onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo('execution')}
              />
            ) : activePanelModel && chipLabel ? (
              <div style={{ marginRight: 8 }}>
                <ModelSelectorChip
                  label={chipLabel}
                  onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo('execution')}
                />
              </div>
            ) : null}
            {showCancelPendingSend ? (
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
            ) : (
              <button
                className="composerSendButton"
                disabled={!composerDraft.trim() || isSubmittingFirstTurn}
                type="submit"
                aria-label={isParallelMode ? 'Send to all chats' : 'Send'}
              >
                {isParallelMode ? (
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
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            disabled={isSubmittingFirstTurn}
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
        {isParallelMode && parallelTargets && parallelTargets.length > 1 ? (
          <div className="parallelStubStack">
            {parallelTargets.slice(1).map((target, i, arr) => (
              <div key={i + 1} className="parallelStubCard" style={{ zIndex: arr.length - i }}>
                <ModelSelectorChip
                  label={buildModelSelectorLabel(target)}
                  onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo(`parallel:${i + 1}`)}
                />
                <button
                  type="button"
                  className="parallelStubRemove"
                  disabled={isSubmittingFirstTurn || parallelTargets.length <= 2}
                  onClick={() => onRemoveParallelTarget?.(i + 1)}
                  aria-label="Remove parallel chat"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {parallelTargets && parallelTargets.length < (payload.chat.capabilities.maxParallelChats ?? 5) ? (
          <div className="parallelAddRow">
            <span className="parallelAddHint">Add another model to compare</span>
            <button
              type="button"
              className="parallelAddButton"
              disabled={isSubmittingFirstTurn}
              onClick={onAddParallelTarget}
              aria-label="Add parallel chat"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v10" />
                <path d="M3 8h10" />
              </svg>
            </button>
          </div>
        ) : null}
      </section>
      {sidePanelOpen ? (
        <SidePanel
          title="New Chat Setup"
          activeSection={sidePanelSection}
          onSectionToggle={isSubmittingFirstTurn ? () => {} : switchSection}
          onClose={isSubmittingFirstTurn ? () => {} : () => setSidePanelOpen(false)}
          className="chatPaneSidePanel"
          sections={buildDraftSidePanelSections()}
        />
      ) : null}
    </div>
  );

  function buildDraftSidePanelSections(): SidePanelSection[] {
    const sections: SidePanelSection[] = [];

    sections.push({
      id: 'cats',
      title: 'Cats',
      children: chatCats.filter((c) => c.status === 'active').length > 0 ? (
        <CatAvatarRow
          cats={chatCats}
          bossCatId={payload.chat.bossCatId}
          selectedIds={draftCatIds}
          highlightedId={draftHighlightedCatId}
          leadCatId={effectiveLeadCat?.id ?? null}
          toggleable
          showLeadBadge
          onToggle={onToggleDraftCat}
          onHighlight={(id) => onHighlightDraftCat(id)}
        />
      ) : (
        <p className="operatorEmptyState">No cats are available yet.</p>
      ),
    });

    const executionChildren = (() => {
      if (isDirectLaneContext && leadCat && activePanelModel) {
        return (
          <>
            <CatAvatarRow
              cats={[leadCat]}
              bossCatId={payload.chat.bossCatId}
              selectedIds={[leadCat.id]}
              highlightedId={leadCat.id}
              leadCatId={leadCat.id}
              toggleable={false}
              showLeadBadge
              onToggle={() => {}}
              onHighlight={() => {}}
            />
            <ProviderModelFields
              provider={activePanelModel.provider}
              instance={activePanelModel.instance ?? ''}
              model={activePanelModel.model ?? ''}
              modelSelection={activePanelModel.modelSelection}
              onTargetChange={(target: ProviderTargetSelection) => {
                onDirectLaneModelChange?.(leadCat.id, {
                  provider: target.provider,
                  model: target.model || null,
                  instance: target.instance || null,
                  modelSelection: target.modelSelection ?? null,
                });
              }}
            />
          </>
        );
      }
      if (activePanelModel) {
        return (
          <>
            <div style={effectiveLeadCat && !isDirectLaneContext ? { pointerEvents: 'none', opacity: 0.45 } : undefined}>
              <ProviderModelFields
                provider={activePanelModel.provider}
                instance={activePanelModel.instance ?? ''}
                model={activePanelModel.model ?? ''}
                modelSelection={activePanelModel.modelSelection}
                onTargetChange={(target: ProviderTargetSelection) => {
                  if (!effectiveLeadCat && onModelChange) {
                    onModelChange({
                      provider: target.provider,
                      model: target.model || null,
                      instance: target.instance || null,
                      modelSelection: target.modelSelection ?? null,
                    });
                  }
                }}
              />
            </div>
          </>
        );
      }
      return <p className="operatorEmptyState">No AI reply setup yet.</p>;
    })();
    sections.push({ id: 'execution', title: 'AI Reply', children: executionChildren });

    if (isParallelMode && parallelTargets) {
      parallelTargets.forEach((target, index) => {
        sections.push({
          id: `parallel:${index}`,
          title: buildModelSelectorLabel(target),
          children: (
            <ProviderModelFields
              provider={target.provider}
              instance={target.instance ?? ''}
              model={target.model ?? ''}
              modelSelection={target.modelSelection}
              onTargetChange={(next: ProviderTargetSelection) => {
                onParallelTargetChange?.(index, {
                  provider: next.provider,
                  model: next.model || null,
                  instance: next.instance || null,
                  modelSelection: next.modelSelection ?? null,
                });
              }}
            />
          ),
        });
      });
    }

    sections.push({
      id: 'cwd',
      title: 'Folder',
      children: onFolderBrowsePathChange && onFolderBrowse && onFolderBrowseSelect ? (
        <FolderBrowserContent
          folderBrowsePath={folderBrowsePath}
          folderBrowseCurrentPath={folderBrowseCurrentPath}
          folderBrowseParentPath={folderBrowseParentPath}
          folderBrowseEntries={folderBrowseEntries}
          folderBrowseLoading={folderBrowseLoading}
          folderBrowseError={folderBrowseError}
          onPathChange={onFolderBrowsePathChange}
          onBrowse={onFolderBrowse}
          onSelect={() => {
            onFolderBrowseSelect();
            setSidePanelOpen(false);
          }}
        />
      ) : (
        draftCwd ? (
          <p style={{ margin: 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>{draftCwd}</p>
        ) : (
          <p className="operatorEmptyState">No folder selected yet.</p>
        )
      ),
    });

    return sections;
  }
}
