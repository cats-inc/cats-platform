import { useEffect, type Dispatch, type SetStateAction } from 'react';

import { MEMORY_CATEGORIES } from './viewSupport.js';

export interface MemoryFormState {
  category: string;
  content: string;
}

export interface MemoryEditorDialogProps {
  memoryForm: MemoryFormState;
  setMemoryForm: Dispatch<SetStateAction<MemoryFormState>>;
  busyCreating: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export function MemoryEditorDialog({
  memoryForm,
  setMemoryForm,
  busyCreating,
  onSubmit,
  onClose,
}: MemoryEditorDialogProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busyCreating) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busyCreating, onClose]);

  const submitDisabled = !memoryForm.content.trim() || busyCreating;

  return (
    <div
      className="catsDialogOverlay"
      onClick={() => {
        if (!busyCreating) onClose();
      }}
    >
      <form
        className="catsDialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (submitDisabled) return;
          onSubmit();
        }}
      >
        <p className="catsDialogTitle">Add memory</p>
        <label className="fieldLabel">
          <span>Category</span>
          <select
            className="textInput"
            value={memoryForm.category}
            onChange={(event) => setMemoryForm({ ...memoryForm, category: event.target.value })}
          >
            {MEMORY_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="fieldLabel">
          <span>Content</span>
          <textarea
            className="textInput"
            rows={4}
            placeholder="What should this cat remember?"
            value={memoryForm.content}
            onChange={(event) => setMemoryForm({ ...memoryForm, content: event.target.value })}
            autoFocus
          />
        </label>
        <div className="catsDialogActions">
          <button
            className="confirmCancelButton"
            type="button"
            onClick={onClose}
            disabled={busyCreating}
          >
            Cancel
          </button>
          <button
            className="primaryButton"
            type="submit"
            disabled={submitDisabled}
          >
            {busyCreating ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}
