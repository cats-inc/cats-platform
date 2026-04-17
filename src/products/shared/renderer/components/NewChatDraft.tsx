import { useState, type ComponentType, type FormEvent, type KeyboardEvent, type RefObject } from 'react';

import { SidePanel, type SidePanelSection } from '../../../../design/components/SidePanel';
import { isComposerBusyForDraft } from '../../../../shared/composer.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import type { ProviderTargetSelection } from '../../../../shared/providerSelection.js';
import type { AppShellPayload } from '../../api/workspaceContracts.js';
import type { BrowseDirectoryEntry } from '../api/index.js';
import { isChatCat, truncatePath } from '../workspaceChatUtils.js';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorValue,
} from './ModelSelector.js';
import { CatAvatarRow } from './CatAvatarRow.js';
import { ComposerCatStack } from './ComposerCatStack.js';
import { WorkspaceNewChatDraftTargetSlot } from './WorkspaceNewChatDraftTargetSlot.js';
import { FolderBrowserContent } from './FolderBrowser.js';
import { ProviderModelFields } from './ProviderModelFields.js';

interface ComposerCatStackProps {
  cats: AppShellPayload['chat']['cats'];
  bossCatId: string | null;
  defaultRecipientCatId: string | null;
  onClick?: () => void;
}

interface ModelSelectorChipProps {
  label: string;
  onClick?: () => void;
}

interface ProviderModelFieldsProps {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ModelSelectorValue['modelSelection'];
  onTargetChange: (target: ProviderTargetSelection) => void;
}

interface CatAvatarRowProps {
  cats: AppShellPayload['chat']['cats'];
  bossCatId: string | null;
  selectedIds: string[];
  highlightedId: string | null;
  defaultRecipientCatId?: string | null;
  toggleable: boolean;
  showLeadBadge?: boolean;
  onToggle: (catId: string) => void;
  onHighlight: (catId: string) => void;
}

interface FolderBrowserContentProps {
  folderBrowsePath: string;
  folderBrowseCurrentPath: string;
  folderBrowseParentPath: string;
  folderBrowseEntries: BrowseDirectoryEntry[];
  folderBrowseLoading: boolean;
  folderBrowseError: string;
  onPathChange: (path: string) => void;
  onBrowse: (path: string) => void;
  onSelect: () => void;
}

interface DraftTargetSlotProps {
  payload: AppShellPayload;
  effectiveDefaultRecipientCat: AppShellPayload['chat']['cats'][number] | null;
  nonLeadDraftCats: AppShellPayload['chat']['cats'];
  activePanelModel: ModelSelectorValue | null;
  isSubmittingFirstTurn: boolean;
  onOpenExecution: () => void;
}

export interface WorkspaceNewChatDraftCopy {
  greeting?: string;
  composerPlaceholder?: string;
  sidePanelTitle?: string;
  participantsSectionTitle?: string;
  executionSectionTitle?: string;
  executionActionLabel?: string;
  executionEmptyState?: string;
  folderSectionTitle?: string;
  folderActionLabel?: string;
  folderEmptyState?: string;
}

const defaultWorkspaceNewChatDraftCopy: Required<WorkspaceNewChatDraftCopy> = {
  greeting: 'Meow. Ready when you are.',
  composerPlaceholder: 'How can I help you today?',
  sidePanelTitle: 'New Chat Setup',
  participantsSectionTitle: 'Cats',
  executionSectionTitle: 'AI Reply',
  executionActionLabel: 'Choose AI reply',
  executionEmptyState: 'No AI reply setup yet.',
  folderSectionTitle: 'Folder',
  folderActionLabel: 'Choose folder',
  folderEmptyState: 'No folder selected yet.',
};

export interface WorkspaceNewChatDraftHeaderAccessoryProps {
  copy: Required<WorkspaceNewChatDraftCopy>;
  draftCwd: string | null;
  selectedModel?: ModelSelectorValue;
  disabled: boolean;
  onOpenSection: (section: string) => void;
}

export interface WorkspaceNewChatDraftProps {
  payload: AppShellPayload;
  composerDraft: string;
  busy: WorkspaceBusyState;
  greeting?: string;
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
  draftDefaultRecipientCatId: string | null;
  onDraftDefaultRecipientChange: (catId: string | null) => void;
  allowAddCat?: boolean;
  selectedModel?: ModelSelectorValue;
  onModelChange?: (value: ModelSelectorValue) => void;
  draftHighlightedCatId: string | null;
  onHighlightDraftCat: (catId: string | null) => void;
  draftCatModelOverrides: Map<string, ModelSelectorValue>;
  onDraftCatModelOverride: (catId: string, value: ModelSelectorValue) => void;
  onDirectLaneModelChange?: (catId: string, value: ModelSelectorValue) => void;
  folderBrowsePath?: string;
  folderBrowseCurrentPath?: string;
  folderBrowseParentPath?: string;
  folderBrowseEntries?: BrowseDirectoryEntry[];
  folderBrowseLoading?: boolean;
  folderBrowseError?: string;
  onFolderBrowsePathChange?: (path: string) => void;
  onFolderBrowse?: (path: string) => void;
  onFolderBrowseSelect?: () => void;
  ComposerCatStackComponent: ComponentType<ComposerCatStackProps>;
  ModelSelectorChipComponent: ComponentType<ModelSelectorChipProps>;
  ProviderModelFieldsComponent: ComponentType<ProviderModelFieldsProps>;
  CatAvatarRowComponent: ComponentType<CatAvatarRowProps>;
  FolderBrowserContentComponent: ComponentType<FolderBrowserContentProps>;
  DraftTargetSlotComponent: ComponentType<DraftTargetSlotProps>;
  HeaderAccessoryComponent?: ComponentType<WorkspaceNewChatDraftHeaderAccessoryProps>;
  copy?: WorkspaceNewChatDraftCopy;
}

export function WorkspaceNewChatDraft({
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
  draftDefaultRecipientCatId,
  onDraftDefaultRecipientChange,
  allowAddCat = true,
  selectedModel,
  onModelChange,
  draftHighlightedCatId,
  onHighlightDraftCat,
  draftCatModelOverrides,
  onDraftCatModelOverride,
  onDirectLaneModelChange,
  folderBrowsePath = '',
  folderBrowseCurrentPath = '',
  folderBrowseParentPath = '',
  folderBrowseEntries = [],
  folderBrowseLoading = false,
  folderBrowseError = '',
  onFolderBrowsePathChange,
  onFolderBrowse,
  onFolderBrowseSelect,
  ComposerCatStackComponent,
  ModelSelectorChipComponent,
  ProviderModelFieldsComponent,
  CatAvatarRowComponent,
  FolderBrowserContentComponent,
  DraftTargetSlotComponent,
  HeaderAccessoryComponent,
  copy,
}: WorkspaceNewChatDraftProps) {
  void bossCatName;
  void bossCatAvatarColor;
  const resolvedCopy = { ...defaultWorkspaceNewChatDraftCopy, ...copy };
  const resolvedGreeting = greeting ?? resolvedCopy.greeting;

  const chatCats = payload.chat.cats.filter(isChatCat);
  const defaultRecipientCat = draftDefaultRecipientCatId
    ? chatCats.find((cat) => cat.id === draftDefaultRecipientCatId && cat.status === 'active') ?? null
    : null;
  const hasTelegramBinding = Boolean(
    defaultRecipientCat && payload.chat.botBindings.some((binding) =>
      binding.platform === 'telegram'
      && binding.status === 'active'
      && binding.catId === defaultRecipientCat.id),
  );
  const draftDefaultRecipientCat = !defaultRecipientCat && draftCatIds.length > 0
    ? chatCats.find((cat) => cat.id === draftCatIds[0] && cat.status === 'active') ?? null
    : null;
  const effectiveDefaultRecipientCat = defaultRecipientCat ?? draftDefaultRecipientCat;
  const showSoloSelector = !effectiveDefaultRecipientCat;
  const nonLeadDraftCatIds = draftDefaultRecipientCat
    ? draftCatIds.filter((id) => id !== draftDefaultRecipientCat.id)
    : defaultRecipientCat
      ? draftCatIds.filter((id) => id !== defaultRecipientCat.id)
      : draftCatIds;
  const visibleDraftCatIds = defaultRecipientCat
    ? [defaultRecipientCat.id, ...draftCatIds.filter((id) => id !== defaultRecipientCat.id)]
    : draftCatIds;
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

  const isDirectLaneContext = !allowAddCat && Boolean(draftDefaultRecipientCatId) && Boolean(defaultRecipientCat);
  const highlightedCat = draftHighlightedCatId && draftCatIds.includes(draftHighlightedCatId)
    ? chatCats.find((cat) => cat.id === draftHighlightedCatId) ?? null
    : null;
  const activePanelModel: ModelSelectorValue | null = isDirectLaneContext && defaultRecipientCat
    ? {
        provider: defaultRecipientCat.defaultExecutionTarget.provider,
        model: defaultRecipientCat.defaultExecutionTarget.model,
        instance: defaultRecipientCat.defaultExecutionTarget.instance,
        modelSelection: defaultRecipientCat.defaultModelSelection ?? null,
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
  const isSubmittingFirstTurn = isComposerBusyForDraft(busy);

  return (
    <div className="viewShell viewShellDraft">
      <section className="draftShell">
        <div className="draftGreeting">
          {defaultRecipientCat ? (
            <>
              <p className="eyebrow">Private Chat</p>
              <h1>{defaultRecipientCat.name}</h1>
              <p className="heroNote">
                {hasTelegramBinding ? 'Telegram-bound private lane.' : 'Private lane for this Cat.'}
              </p>
            </>
          ) : (
            <h1>{resolvedGreeting}</h1>
          )}
        </div>
        {HeaderAccessoryComponent ? (
          <div className="draftHeaderAccessory">
            <HeaderAccessoryComponent
              copy={resolvedCopy}
              draftCwd={draftCwd}
              selectedModel={selectedModel}
              disabled={isSubmittingFirstTurn}
              onOpenSection={openSidePanelTo}
            />
          </div>
        ) : null}
        <form
          className={`composerCard composerCardFresh${plusMenuOpen ? ' composerCardMenuOpen' : ''}`}
          onSubmit={(event) => void onSendMessage(event)}
        >
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
          <textarea
            className="composerInput"
            rows={1}
            placeholder={resolvedCopy.composerPlaceholder}
            value={composerDraft}
            disabled={isSubmittingFirstTurn}
            onChange={(event) => {
              onComposerChange(event.target.value);
              autoResize(event.target);
            }}
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
                      {resolvedCopy.folderActionLabel}
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
            <DraftTargetSlotComponent
              payload={payload}
              effectiveDefaultRecipientCat={effectiveDefaultRecipientCat}
              nonLeadDraftCats={nonLeadDraftCatIds
                .map((id) => chatCats.find((cat) => cat.id === id))
                .filter((cat): cat is NonNullable<typeof cat> => cat != null)}
              activePanelModel={activePanelModel}
              isSubmittingFirstTurn={isSubmittingFirstTurn}
              onOpenExecution={() => openSidePanelTo('execution')}
            />
            <button
              className="composerSendButton"
              disabled={!composerDraft.trim() || isSubmittingFirstTurn}
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
      </section>
      {sidePanelOpen ? (
        <SidePanel
          title={resolvedCopy.sidePanelTitle}
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
      title: resolvedCopy.participantsSectionTitle,
      children: chatCats.filter((cat) => cat.status === 'active').length > 0 ? (
        <CatAvatarRowComponent
          cats={chatCats}
          bossCatId={payload.chat.bossCatId}
          selectedIds={draftCatIds}
          highlightedId={draftHighlightedCatId}
          defaultRecipientCatId={effectiveDefaultRecipientCat?.id ?? null}
          toggleable
          showLeadBadge
          onToggle={onToggleDraftCat}
          onHighlight={(catId) => onHighlightDraftCat(catId)}
        />
      ) : (
        <p className="operatorEmptyState">No cats are available yet.</p>
      ),
    });

    const executionChildren = (() => {
      if (isDirectLaneContext && defaultRecipientCat && activePanelModel) {
        return (
          <>
            <CatAvatarRowComponent
              cats={[defaultRecipientCat]}
              bossCatId={payload.chat.bossCatId}
              selectedIds={[defaultRecipientCat.id]}
              highlightedId={defaultRecipientCat.id}
              defaultRecipientCatId={defaultRecipientCat.id}
              toggleable={false}
              showLeadBadge
              onToggle={() => {}}
              onHighlight={() => {}}
            />
            <ProviderModelFieldsComponent
              provider={activePanelModel.provider}
              instance={activePanelModel.instance ?? ''}
              model={activePanelModel.model ?? ''}
              modelSelection={activePanelModel.modelSelection}
              onTargetChange={(target: ProviderTargetSelection) => {
                onDirectLaneModelChange?.(defaultRecipientCat.id, {
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
          <div style={effectiveDefaultRecipientCat && !isDirectLaneContext ? { pointerEvents: 'none', opacity: 0.45 } : undefined}>
            <ProviderModelFieldsComponent
              provider={activePanelModel.provider}
              instance={activePanelModel.instance ?? ''}
              model={activePanelModel.model ?? ''}
              modelSelection={activePanelModel.modelSelection}
              onTargetChange={(target: ProviderTargetSelection) => {
                if (!effectiveDefaultRecipientCat && onModelChange) {
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
        );
      }
      return <p className="operatorEmptyState">{resolvedCopy.executionEmptyState}</p>;
    })();
    sections.push({
      id: 'execution',
      title: resolvedCopy.executionSectionTitle,
      children: executionChildren,
    });

    sections.push({
      id: 'cwd',
      title: resolvedCopy.folderSectionTitle,
      children: onFolderBrowsePathChange && onFolderBrowse && onFolderBrowseSelect ? (
        <FolderBrowserContentComponent
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
          <p className="operatorEmptyState">{resolvedCopy.folderEmptyState}</p>
        )
      ),
    });

    return sections;
  }
}

export interface NewChatDraftProps extends Omit<
  WorkspaceNewChatDraftProps,
  | 'ComposerCatStackComponent'
  | 'DraftTargetSlotComponent'
  | 'ModelSelectorChipComponent'
  | 'ProviderModelFieldsComponent'
  | 'CatAvatarRowComponent'
  | 'FolderBrowserContentComponent'
> {
  DraftTargetSlotComponent?: ComponentType<DraftTargetSlotProps>;
}

export function NewChatDraft({
  DraftTargetSlotComponent = WorkspaceNewChatDraftTargetSlot,
  ...props
}: NewChatDraftProps) {
  return (
    <WorkspaceNewChatDraft
      {...props}
      ComposerCatStackComponent={ComposerCatStack}
      DraftTargetSlotComponent={DraftTargetSlotComponent}
      ModelSelectorChipComponent={ModelSelectorChip}
      ProviderModelFieldsComponent={ProviderModelFields}
      CatAvatarRowComponent={CatAvatarRow}
      FolderBrowserContentComponent={FolderBrowserContent}
    />
  );
}
