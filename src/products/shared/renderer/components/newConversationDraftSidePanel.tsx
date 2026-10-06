import type { AppShellPayload } from '../../api/workspaceContracts.js';
import type { BrowseDirectoryEntry } from '../api/index.js';
import {
  buildDraftParticipantCapabilityReview,
  buildDraftParticipantExecutionLabel,
  createDraftTemporaryParticipantFromAssistantPreset,
  draftHasAssistantPresetParticipant,
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import { CatAvatarRow } from './CatAvatarRow.js';
import { FolderBrowserContent } from './FolderBrowser.js';
import {
  type ExecutionTargetValue,
} from './ExecutionTarget.js';
import { ProviderModelFields } from '../../../../design/components/ProviderModelFields.js';
import { type SidePanelSection } from '../../../../design/components/SidePanel.js';
import type { ProviderTargetSelection } from '../../../../shared/providerSelection.js';
import type { RuntimeSessionPolicy } from '../../../../shared/runtimeSessionPolicy.js';
import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';

type NewConversationDraftTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

export interface NewConversationTemporaryParticipantFormState {
  roleHint: string;
  provider: string;
  instance: string;
  model: string;
  modelSelection: ExecutionTargetValue['modelSelection'];
}

export interface NewConversationDraftSidePanelCopy {
  title?: string;
  participants?: {
    catsSectionTitle?: string;
    groupSectionTitle?: string;
    emptyState?: string;
  };
  folder?: {
    sectionTitle?: string;
    emptyState?: string;
  };
}

type ResolvedNewConversationDraftSidePanelCopy = Required<{
  title: string;
  participants: Required<NonNullable<NewConversationDraftSidePanelCopy['participants']>>;
  folder: Required<NonNullable<NewConversationDraftSidePanelCopy['folder']>>;
}>;

const defaultNewConversationDraftSidePanelCopy = (
  t: NewConversationDraftTranslator,
): ResolvedNewConversationDraftSidePanelCopy => ({
  title: t(messageKeys.chatNewChatDraftSidePanelTitle),
  participants: {
    catsSectionTitle: t(messageKeys.chatNewChatDraftSidePanelParticipantsCatsTitle),
    groupSectionTitle: t(messageKeys.chatNewChatDraftSidePanelParticipantsGroupTitle),
    emptyState: t(messageKeys.chatNewChatDraftSidePanelParticipantsEmptyState),
  },
  folder: {
    sectionTitle: t(messageKeys.chatNewChatDraftSidePanelFolderTitle),
    emptyState: t(messageKeys.chatNewChatDraftSidePanelFolderEmptyState),
  },
});

export function resolveNewConversationDraftSidePanelCopy(
  copy: NewConversationDraftSidePanelCopy | undefined,
  t: NewConversationDraftTranslator,
): ResolvedNewConversationDraftSidePanelCopy {
  const defaultCopy = defaultNewConversationDraftSidePanelCopy(t);
  return {
    title: copy?.title ?? defaultCopy.title,
    participants: {
      ...defaultCopy.participants,
      ...copy?.participants,
    },
    folder: {
      ...defaultCopy.folder,
      ...copy?.folder,
    },
  };
}

export interface BuildNewConversationDraftSidePanelSectionsInput {
  payload: AppShellPayload;
  chatCats: AppShellPayload['chat']['cats'];
  draftCatIds: string[];
  draftHighlightedCatId: string | null;
  effectiveDefaultRecipientCat: AppShellPayload['chat']['cats'][number] | null;
  isGroupDraft: boolean;
  groupDraftSelectionLabel: string;
  assistantPresets: NonNullable<AppShellPayload['assistantPresets']>;
  draftTemporaryParticipants: DraftTemporaryParticipant[];
  editingTemporaryParticipantId: string | null;
  editingTemporaryParticipantName: string;
  temporaryParticipantFormOpen: boolean;
  temporaryParticipantForm: NewConversationTemporaryParticipantFormState;
  hasReachedGroupParticipantLimit: boolean;
  isSubmittingFirstTurn: boolean;
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
    updater: (current: NewConversationTemporaryParticipantFormState) =>
      NewConversationTemporaryParticipantFormState,
  ) => void;
  createTemporaryParticipantFormValue: () => NewConversationTemporaryParticipantFormState;
  onTemporaryParticipantFormOpenChange: (open: boolean) => void;
  onSubmitTemporaryParticipant: () => void;
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
  draftRuntimeSessionPolicy: RuntimeSessionPolicy | null;
  onDraftRuntimeSessionPolicyChange?: (policy: RuntimeSessionPolicy) => void;
  onCloseSidePanel: () => void;
  sidePanelCopy?: NewConversationDraftSidePanelCopy;
  // Translator must be passed in by the caller (a real component) — calling
  // `useI18n()` here would violate Rules of Hooks because this builder is
  // invoked conditionally (only when the side panel is open), inserting an
  // extra hook into the parent's call order on toggle.
  t: NewConversationDraftTranslator;
}

export function buildNewConversationDraftSidePanelSections(
  input: BuildNewConversationDraftSidePanelSectionsInput,
): SidePanelSection[] {
  const sections: SidePanelSection[] = [];
  const { t } = input;
  const copy = resolveNewConversationDraftSidePanelCopy(input.sidePanelCopy, t);

  sections.push({
    id: 'cats',
    title: input.isGroupDraft
      ? copy.participants.groupSectionTitle
      : copy.participants.catsSectionTitle,
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
          <p className="operatorEmptyState">{copy.participants.emptyState}</p>
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
                  const capabilityReview = buildDraftParticipantCapabilityReview({
                    provider: assistantPreset.executionTarget.provider,
                    instance: assistantPreset.executionTarget.instance,
                    model: assistantPreset.executionTarget.model,
                  }, undefined, t);
                  let addButtonLabel = t(messageKeys.chatNewChatDraftAssistantPresetAdd);
                  if (capabilityReview.requiresActivationReview) {
                    addButtonLabel = t(messageKeys.chatNewChatDraftAssistantPresetReview);
                  } else if (alreadyAdded) {
                    addButtonLabel = t(messageKeys.chatNewChatDraftAssistantPresetAdded);
                  }
                  return (
                    <div key={assistantPreset.id} className="addCatItem">
                      <div>
                        <strong>{assistantPreset.name}</strong>
                        <p>{buildDraftParticipantExecutionLabel({
                          provider: assistantPreset.executionTarget.provider,
                          instance: assistantPreset.executionTarget.instance,
                          model: assistantPreset.executionTarget.model,
                        })}</p>
                        <p>
                          {capabilityReview.capabilityLabel}
                          {' | '}
                          {capabilityReview.policySummary}
                          {' | '}
                          {capabilityReview.toolGrantSummary}
                        </p>
                        {assistantPreset.roleHint ? <p>{assistantPreset.roleHint}</p> : null}
                      </div>
                      <button
                        className="addCatAssignButton"
                        type="button"
                        title={capabilityReview.reviewReasons.join(', ') || undefined}
                        disabled={
                          input.isSubmittingFirstTurn
                          || alreadyAdded
                          || input.hasReachedGroupParticipantLimit
                          || capabilityReview.requiresActivationReview
                        }
                        onClick={() =>
                          input.onAddDraftTemporaryParticipant(
                            createDraftTemporaryParticipantFromAssistantPreset(assistantPreset),
                          )}
                      >
                        {addButtonLabel}
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
                            <span>{t(messageKeys.chatNewChatDraftTemporaryParticipantNameLabel)}</span>
                            <input
                              className="textInput"
                              value={input.editingTemporaryParticipantName}
                              onChange={(event) =>
                                input.onEditingTemporaryParticipantNameChange(event.target.value)}
                              placeholder={t(
                                messageKeys.chatNewChatDraftTemporaryParticipantNamePlaceholder,
                              )}
                            />
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className="operatorActionButton"
                              onClick={input.onCancelTemporaryParticipantRename}
                            >
                              {t(messageKeys.chatNewChatDraftTemporaryParticipantCancel)}
                            </button>
                            <button
                              type="submit"
                              className="primaryButton"
                              disabled={!input.editingTemporaryParticipantName.trim()}
                            >
                              {t(messageKeys.chatNewChatDraftTemporaryParticipantSaveName)}
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
                        {t(messageKeys.chatNewChatDraftTemporaryParticipantRename)}
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
                        {t(messageKeys.chatNewChatDraftTemporaryParticipantRemove)}
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
                  {t(messageKeys.chatNewChatDraftTemporaryParticipantNameHint)}
                </p>
                <label className="fieldLabel">
                  <span>{t(messageKeys.chatNewChatDraftTemporaryParticipantRoleHintLabel)}</span>
                  <input
                    className="textInput"
                    value={input.temporaryParticipantForm.roleHint}
                    onChange={(event) =>
                      input.onTemporaryParticipantFormChange((current) => ({
                        ...current,
                        roleHint: event.target.value,
                      }))}
                    placeholder={t(messageKeys.chatNewChatDraftTemporaryParticipantRoleHintPlaceholder)}
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
                    {t(messageKeys.chatNewChatDraftTemporaryParticipantCancel)}
                  </button>
                  <button
                    type="submit"
                    className="primaryButton"
                    disabled={
                      input.hasReachedGroupParticipantLimit
                    || !input.temporaryParticipantForm.provider.trim()
                    }
                  >
                    {t(messageKeys.chatNewChatDraftTemporaryParticipantSubmit)}
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
                {t(messageKeys.chatNewChatDraftTemporaryParticipantOpenForm)}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    ),
  });


  sections.push({
    id: 'cwd',
    title: copy.folder.sectionTitle,
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
        <p className="operatorEmptyState">{copy.folder.emptyState}</p>
      )
    ),
  });

  return sections;
}
