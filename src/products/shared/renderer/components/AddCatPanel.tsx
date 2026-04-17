import type {
  ComponentType,
  FormEvent,
  RefObject,
} from 'react';

import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../../../shared/providerSelection.js';
import {
  isCatBusy,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import type { ChatCat } from '../../api/workspaceContracts.js';
import {
  executionLabel,
  type CatFormState,
} from '../workspaceChatUtils.js';
import { ProviderModelFields } from './ProviderModelFields.js';

interface ProviderModelFieldsProps {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
}

export interface WorkspaceAddCatPanelProps {
  panelRef?: RefObject<HTMLDivElement>;
  selectableCats: ChatCat[];
  assignableCatCount: number;
  addCatTab: 'existing' | 'new';
  busy: WorkspaceBusyState;
  feedback: string;
  showingNewChatDraft: boolean;
  draftCatIdSet: Set<string>;
  assignedCatIds: Set<string>;
  catForm: CatFormState;
  onClose: () => void;
  onTabChange: (tab: 'existing' | 'new') => void;
  onAssignExistingCat: (cat: ChatCat) => void;
  onRemoveAssignedCat: (cat: ChatCat) => void;
  onToggleDraftCat: (catId: string) => void;
  onCatFormChange: (form: CatFormState) => void;
  onCreateCat: (event: FormEvent<HTMLFormElement>) => void;
  ProviderModelFieldsComponent: ComponentType<ProviderModelFieldsProps>;
}

export function WorkspaceAddCatPanel({
  panelRef,
  selectableCats,
  assignableCatCount,
  addCatTab,
  busy,
  feedback,
  showingNewChatDraft,
  draftCatIdSet,
  assignedCatIds,
  catForm,
  onClose,
  onTabChange,
  onAssignExistingCat,
  onRemoveAssignedCat,
  onToggleDraftCat,
  onCatFormChange,
  onCreateCat,
  ProviderModelFieldsComponent,
}: WorkspaceAddCatPanelProps) {
  return (
    <div className="addCatPanel" ref={panelRef}>
      <div className="addCatPanelHeader">
        <h2>Add cat to chat</h2>
        <button
          className="addCatClose"
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          x
        </button>
      </div>

      <div className="addCatTabs">
        <button
          className={addCatTab === 'existing' ? 'addCatTab addCatTabActive' : 'addCatTab'}
          type="button"
          onClick={() => onTabChange('existing')}
        >
          Choose existing
        </button>
        <button
          className={addCatTab === 'new' ? 'addCatTab addCatTabActive' : 'addCatTab'}
          type="button"
          onClick={() => onTabChange('new')}
        >
          Create new
        </button>
      </div>

      {feedback ? <p className="feedbackText">{feedback}</p> : null}

      {addCatTab === 'existing' ? (
        <div className="addCatList">
          {selectableCats.length > 0 ? (
            selectableCats.map((cat) => (
              <div key={cat.id} className="addCatItem">
                <div>
                  <strong>{cat.name}</strong>
                  <p>{executionLabel(cat)}</p>
                </div>
                {(() => {
                  const included = showingNewChatDraft
                    ? draftCatIdSet.has(cat.id)
                    : assignedCatIds.has(cat.id);
                  const isAdding = isCatBusy(busy, 'assign', cat.id);
                  const isRemoving = isCatBusy(busy, 'remove', cat.id);
                  return (
                    <button
                      className={included ? 'addCatAssignButton addCatRemoveButton' : 'addCatAssignButton'}
                      type="button"
                      disabled={isAdding || isRemoving}
                      onClick={() => {
                        if (showingNewChatDraft) {
                          onToggleDraftCat(cat.id);
                          return;
                        }
                        if (included) {
                          onRemoveAssignedCat(cat);
                          return;
                        }
                        onAssignExistingCat(cat);
                      }}
                    >
                      {isAdding ? 'Adding...' : isRemoving ? 'Removing...' : included ? 'Remove' : 'Add'}
                    </button>
                  );
                })()}
              </div>
            ))
          ) : (
            <div className="emptyStateCard">
              <p>
                {assignableCatCount === 0
                  ? 'No other cats yet. Create one first.'
                  : 'All cats are already in this chat.'}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="addCatCreate">
          <form
            className="stackForm"
            onSubmit={(event) => onCreateCat(event)}
          >
            <label className="fieldLabel">
              <span>Name</span>
              <input
                className="textInput"
                value={catForm.name}
                onChange={(event) => onCatFormChange({ ...catForm, name: event.target.value })}
                placeholder="Cat name"
              />
            </label>
            <ProviderModelFieldsComponent
              provider={catForm.provider}
              instance={catForm.instance}
              model={catForm.model}
              modelSelection={catForm.modelSelection}
              onTargetChange={(target) =>
                onCatFormChange({
                  ...catForm,
                  provider: target.provider,
                  instance: target.instance,
                  model: target.model,
                  modelSelection: target.modelSelection ?? null,
                })}
            />
            <button
              className="primaryButton"
              disabled={!catForm.name.trim() || !catForm.provider.trim() || !catForm.model.trim()}
              type="submit"
            >
              {isCatBusy(busy, 'create') || isCatBusy(busy, 'create-assign')
                ? 'Saving...'
                : showingNewChatDraft
                  ? 'Create & Add'
                  : 'Create & Add to Chat'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export interface AddCatPanelProps extends Omit<
  WorkspaceAddCatPanelProps,
  'ProviderModelFieldsComponent'
> {
  panelRef?: RefObject<HTMLDivElement>;
  selectableCats: ChatCat[];
  catForm: CatFormState;
  onCreateCat: (event: FormEvent<HTMLFormElement>) => void;
}

export function AddCatPanel({
  ...props
}: AddCatPanelProps) {
  return <WorkspaceAddCatPanel {...props} ProviderModelFieldsComponent={ProviderModelFields} />;
}
