import type { FormEvent, RefObject } from 'react';

import type { ChatCat } from '../../api/contracts';
import { executionLabel, type CatFormState } from '../chatUtils';
import { ProviderModelFields } from './ProviderModelFields';

export interface AddCatPanelProps {
  panelRef?: RefObject<HTMLDivElement>;
  selectableCats: ChatCat[];
  assignableCatCount: number;
  addCatTab: 'existing' | 'new';
  busy: string;
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
}

export function AddCatPanel({
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
}: AddCatPanelProps) {
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
                  const isAdding = busy === `cat:assign:${cat.id}`;
                  const isRemoving = busy === `cat:remove:${cat.id}`;
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
                placeholder="Ops reviewer"
              />
            </label>
            <ProviderModelFields
              provider={catForm.provider}
              instance={catForm.instance}
              model={catForm.model}
              onTargetChange={(target) =>
                onCatFormChange({
                  ...catForm,
                  provider: target.provider,
                  instance: target.instance,
                  model: target.model,
                })}
            />
            <button
              className="primaryButton"
              disabled={!catForm.name.trim() || !catForm.provider.trim() || !catForm.model.trim()}
              type="submit"
            >
              {busy === 'cat:create' || busy === 'cat:create-assign'
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
