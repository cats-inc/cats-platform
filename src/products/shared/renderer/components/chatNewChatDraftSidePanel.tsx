import type { AppShellPayload } from '../../api/workspaceContracts.js';
import type { BrowseDirectoryEntry } from '../api/index.js';
import {
  buildDraftParticipantExecutionLabel,
  createDraftTemporaryParticipantFromAssistantPreset,
  draftHasAssistantPresetParticipant,
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import { CatAvatarRow } from './CatAvatarRow.js';
import { FolderBrowserContent } from './FolderBrowser.js';
import {
  buildExecutionTargetLabel,
  type ExecutionTargetValue,
} from './ExecutionTarget.js';
import { ProviderModelFields } from './ProviderModelFields.js';
import { type SidePanelSection } from '../../../../design/components/SidePanel.js';
import type { ProviderTargetSelection } from '../../../../shared/providerSelection.js';

export interface ChatNewChatTemporaryParticipantFormState {
  roleHint: string;
  provider: string;
  instance: string;
  model: string;
  modelSelection: ExecutionTargetValue['modelSelection'];
}

export interface BuildChatNewChatDraftSidePanelSectionsInput {
  payload: AppShellPayload;
  chatCats: AppShellPayload['chat']['cats'];
  draftCatIds: string[];
  draftHighlightedCatId: string | null;
  effectiveDefaultRecipientCat: AppShellPayload['chat']['cats'][number] | null;
  isGroupDraft: boolean;
  isDirectLaneContext: boolean;
  isParallelMode: boolean;
  groupDraftSelectionLabel: string;
  assistantPresets: NonNullable<AppShellPayload['assistantPresets']>;
  draftTemporaryParticipants: DraftTemporaryParticipant[];
  editingTemporaryParticipantId: string | null;
  editingTemporaryParticipantName: string;
  temporaryParticipantFormOpen: boolean;
  temporaryParticipantForm: ChatNewChatTemporaryParticipantFormState;
  hasReachedGroupParticipantLimit: boolean;
  isSubmittingFirstTurn: boolean;
  defaultRecipientCat: AppShellPayload['chat']['cats'][number] | null;
  activePanelExecutionTarget: ExecutionTargetValue | null;
  onToggleDraftCat: (catId: string) => void;
  onHighlightDraftCat: (catId: string | null) => void;
  onAddDraftTemporaryParticipant: (
    participant: Omit<DraftTemporaryParticipant, 'participantId'> & {
      participantId?: string | null;
    },
  ) => void;
  onRemoveDraftTemporaryParticipant: (participantId: string) => void;
  onBeginTemporaryParticipantRename: (participant: DraftTemporaryParticipant) => void;
  onCancelTemporaryParticipantRename: () => void;
  onSubmitTemporaryParticipantRename: (participantId: string) => void;
  onEditingTemporaryParticipantNameChange: (value: string) => void;
  onTemporaryParticipantFormChange: (
    updater: (current: ChatNewChatTemporaryParticipantFormState) =>
      ChatNewChatTemporaryParticipantFormState,
  ) => void;
  createTemporaryParticipantFormValue: () => ChatNewChatTemporaryParticipantFormState;
  onTemporaryParticipantFormOpenChange: (open: boolean) => void;
  onSubmitTemporaryParticipant: () => void;
  selectedExecutionTarget?: ExecutionTargetValue;
  onExecutionTargetChange?: (value: ExecutionTargetValue) => void;
  onDirectLaneExecutionTargetChange?: (catId: string, value: ExecutionTargetValue) => void;
  parallelTargets?: ExecutionTargetValue[];
  onParallelTargetChange?: (index: number, value: ExecutionTargetValue) => void;
  folderBrowsePath?: string;
  folderBrowseCurrentPath?: string;
  folderBrowseParentPath?: string;
  folderBrowseEntries?: BrowseDirectoryEntry[];
  folderBrowseLoading?: boolean;
  folderBrowseError?: string;
  draftCwd: string | null;
  onFolderBrowsePathChange?: (path: string) => void;
  onFolderBrowse?: (path: string) => void;
  onFolderBrowseSelect?: () => void;
  onCloseSidePanel: () => void;
}

export function buildChatNewChatDraftSidePanelSections(
  input: BuildChatNewChatDraftSidePanelSectionsInput,
): SidePanelSection[] {
  const sections: SidePanelSection[] = [];

  sections.push({
    id: 'cats',
    title: input.isGroupDraft ? 'Participants' : 'Cats',
    children: (
      <div className="sidePanelSectionStack">
        {input.isGroupDraft ? (
          <p className="operatorEmptyState" style={{ margin: 0 }}>
            {input.groupDraftSelectionLabel}
          </p>
        ) : null}
        {input.chatCats.filter((c) => c.status === 'active').length > 0 ? (
          <CatAvatarRow
            cats={input.chatCats}
            bossCatId={input.payload.chat.bossCatId}
            selectedIds={input.draftCatIds}
            highlightedId={input.draftHighlightedCatId}
            defaultRecipientCatId={input.effectiveDefaultRecipientCat?.id ?? null}
            toggleable
            onToggle={input.onToggleDraftCat}
            onHighlight={(id) => input.onHighlightDraftCat(id)}
          />
        ) : (
          <p className="operatorEmptyState">No cats are available yet.</p>
        )}
        {input.isGroupDraft ? (
          <>
            {input.assistantPresets.length > 0 ? (
              <div className="addCatList">
                {input.assistantPresets.map((assistantPreset) => {
                  const alreadyAdded = draftHasAssistantPresetParticipant(
                    input.draftTemporaryParticipants,
                    assistantPreset.id,
                  );
                  return (
                    <div key={assistantPreset.id} className="addCatItem">
                      <div>
                        <strong>{assistantPreset.name}</strong>
                        <p>{buildDraftParticipantExecutionLabel({
                          provider: assistantPreset.executionTarget.provider,
                          instance: assistantPreset.executionTarget.instance,
                          model: assistantPreset.executionTarget.model,
                        })}</p>
                        {assistantPreset.roleHint ? <p>{assistantPreset.roleHint}</p> : null}
                      </div>
                      <button
                        className="addCatAssignButton"
                        type="button"
                        disabled={
                          input.isSubmittingFirstTurn
                          || alreadyAdded
                          || input.hasReachedGroupParticipantLimit
                        }
                        onClick={() =>
                          input.onAddDraftTemporaryParticipant(
                            createDraftTemporaryParticipantFromAssistantPreset(assistantPreset),
                          )}
                      >
                        {alreadyAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {input.draftTemporaryParticipants.length > 0 ? (
              <div className="addCatList">
                {input.draftTemporaryParticipants.map((participant) => (
                  <div key={participant.participantId} className="addCatItem">
                    <div>
                      <strong>{participant.name}</strong>
                      <p>{buildDraftParticipantExecutionLabel(participant)}</p>
                      {participant.roleHint ? <p>{participant.roleHint}</p> : null}
                      {input.editingTemporaryParticipantId === participant.participantId ? (
                        <form
                          className="stackForm"
                          onSubmit={(event) => {
                            event.preventDefault();
                            input.onSubmitTemporaryParticipantRename(participant.participantId);
                          }}
                        >
                          <label className="fieldLabel">
                            <span>Name</span>
                            <input
                              className="textInput"
                              value={input.editingTemporaryParticipantName}
                              onChange={(event) =>
                                input.onEditingTemporaryParticipantNameChange(event.target.value)}
                              placeholder="Participant name"
                            />
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className="operatorActionButton"
                              onClick={input.onCancelTemporaryParticipantRename}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="primaryButton"
                              disabled={!input.editingTemporaryParticipantName.trim()}
                            >
                              Save name
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="addCatAssignButton"
                        type="button"
                        disabled={input.isSubmittingFirstTurn}
                        onClick={() => input.onBeginTemporaryParticipantRename(participant)}
                      >
                        Rename
                      </button>
                      <button
                        className="addCatAssignButton addCatRemoveButton"
                        type="button"
                        disabled={input.isSubmittingFirstTurn}
                        onClick={() => {
                          if (input.editingTemporaryParticipantId === participant.participantId) {
                            input.onCancelTemporaryParticipantRename();
                          }
                          input.onRemoveDraftTemporaryParticipant(participant.participantId);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {input.temporaryParticipantFormOpen && !input.hasReachedGroupParticipantLimit ? (
              <form
                className="stackForm"
                onSubmit={(event) => {
                  event.preventDefault();
                  input.onSubmitTemporaryParticipant();
                }}
              >
                <p className="operatorEmptyState" style={{ margin: 0 }}>
                  Name will be assigned automatically from the provider. You can rename it after adding.
                </p>
                <label className="fieldLabel">
                  <span>Role Hint</span>
                  <input
                    className="textInput"
                    value={input.temporaryParticipantForm.roleHint}
                    onChange={(event) =>
                      input.onTemporaryParticipantFormChange((current) => ({
                        ...current,
                        roleHint: event.target.value,
                      }))}
                    placeholder="Optional one-line role"
                  />
                </label>
                <ProviderModelFields
                  provider={input.temporaryParticipantForm.provider}
                  instance={input.temporaryParticipantForm.instance}
                  model={input.temporaryParticipantForm.model}
                  modelSelection={input.temporaryParticipantForm.modelSelection}
                  onTargetChange={(target: ProviderTargetSelection) => {
                    input.onTemporaryParticipantFormChange((current) => ({
                      ...current,
                      provider: target.provider,
                      instance: target.instance,
                      model: target.model,
                      modelSelection: target.modelSelection ?? null,
                    }));
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => {
                      input.onTemporaryParticipantFormChange(input.createTemporaryParticipantFormValue);
                      input.onTemporaryParticipantFormOpenChange(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primaryButton"
                    disabled={
                      input.hasReachedGroupParticipantLimit
                      || !input.temporaryParticipantForm.provider.trim()
                    }
                  >
                    Add participant
                  </button>
                </div>
              </form>
            ) : !input.hasReachedGroupParticipantLimit ? (
              <button
                type="button"
                className="operatorActionButton"
                disabled={input.isSubmittingFirstTurn}
                onClick={() => input.onTemporaryParticipantFormOpenChange(true)}
              >
                Add temporary participant
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    ),
  });

  const executionChildren = (() => {
    if (input.isDirectLaneContext && input.defaultRecipientCat && input.activePanelExecutionTarget) {
      return (
        <>
          <CatAvatarRow
            cats={[input.defaultRecipientCat]}
            bossCatId={input.payload.chat.bossCatId}
            selectedIds={[input.defaultRecipientCat.id]}
            highlightedId={input.defaultRecipientCat.id}
            defaultRecipientCatId={input.defaultRecipientCat.id}
            toggleable={false}
            onToggle={() => {}}
            onHighlight={() => {}}
          />
          <ProviderModelFields
            provider={input.activePanelExecutionTarget.provider}
            instance={input.activePanelExecutionTarget.instance ?? ''}
            model={input.activePanelExecutionTarget.model ?? ''}
            modelSelection={input.activePanelExecutionTarget.modelSelection}
            onTargetChange={(target: ProviderTargetSelection) => {
              input.onDirectLaneExecutionTargetChange?.(input.defaultRecipientCat!.id, {
                provider: target.provider,
                model: target.model || null,
                instance: target.instance || null,
                modelSelection: target.modelSelection ?? null,
                executionLabel: target.executionLabel ?? null,
              });
            }}
          />
        </>
      );
    }
    if (input.activePanelExecutionTarget) {
      return (
        <div
          style={input.effectiveDefaultRecipientCat && !input.isDirectLaneContext
            ? { pointerEvents: 'none', opacity: 0.45 }
            : undefined}
        >
          <ProviderModelFields
            provider={input.activePanelExecutionTarget.provider}
            instance={input.activePanelExecutionTarget.instance ?? ''}
            model={input.activePanelExecutionTarget.model ?? ''}
            modelSelection={input.activePanelExecutionTarget.modelSelection}
            onTargetChange={(target: ProviderTargetSelection) => {
              if (!input.effectiveDefaultRecipientCat && input.onExecutionTargetChange) {
                input.onExecutionTargetChange({
                  provider: target.provider,
                  model: target.model || null,
                  instance: target.instance || null,
                  modelSelection: target.modelSelection ?? null,
                  executionLabel: target.executionLabel ?? null,
                });
              }
            }}
          />
        </div>
      );
    }
    return <p className="operatorEmptyState">No AI reply setup yet.</p>;
  })();
  sections.push({ id: 'execution', title: 'AI Reply', children: executionChildren });

  if (input.isParallelMode && input.parallelTargets) {
    input.parallelTargets.forEach((target, index) => {
      sections.push({
        id: `parallel:${index}`,
        title: buildExecutionTargetLabel(target),
        children: (
          <ProviderModelFields
            provider={target.provider}
            instance={target.instance ?? ''}
            model={target.model ?? ''}
            modelSelection={target.modelSelection}
            onTargetChange={(next: ProviderTargetSelection) => {
              input.onParallelTargetChange?.(index, {
                provider: next.provider,
                model: next.model || null,
                instance: next.instance || null,
                modelSelection: next.modelSelection ?? null,
                executionLabel: next.executionLabel ?? null,
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
    children: input.onFolderBrowsePathChange && input.onFolderBrowse && input.onFolderBrowseSelect ? (
      <FolderBrowserContent
        folderBrowsePath={input.folderBrowsePath ?? ''}
        folderBrowseCurrentPath={input.folderBrowseCurrentPath ?? ''}
        folderBrowseParentPath={input.folderBrowseParentPath ?? ''}
        folderBrowseEntries={input.folderBrowseEntries ?? []}
        folderBrowseLoading={input.folderBrowseLoading ?? false}
        folderBrowseError={input.folderBrowseError ?? ''}
        onPathChange={input.onFolderBrowsePathChange}
        onBrowse={input.onFolderBrowse}
        onSelect={() => {
          input.onFolderBrowseSelect?.();
          input.onCloseSidePanel();
        }}
      />
    ) : (
      input.draftCwd ? (
        <p style={{ margin: 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>
          {input.draftCwd}
        </p>
      ) : (
        <p className="operatorEmptyState">No folder selected yet.</p>
      )
    ),
  });

  return sections;
}
