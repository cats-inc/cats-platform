import { useEffect, useRef, useState } from 'react';

import {
  DEFAULT_DRAFT_WORKSPACE_MODE,
  type DraftWorkspaceMode,
} from '../../../../shared/runtimeSessionPolicy.js';

export type WorkspaceMode = DraftWorkspaceMode;

export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = DEFAULT_DRAFT_WORKSPACE_MODE;

// UI-facing copy stays user-readable here, even though the underlying mode name
// remains "worktree" because the runtime still uses git worktrees under the hood.
const WORKSPACE_MODE_LABELS: Record<WorkspaceMode, string> = {
  current: 'Current folder',
  worktree: 'Independent worktree',
};

const WORKSPACE_MODE_TOOLTIPS: Record<WorkspaceMode, string> = {
  current: 'Edits files in the selected folder directly.',
  worktree: 'Creates a parallel working directory for this repo. Requires a git repository.',
};

const WORKSPACE_MODE_ORDER: readonly WorkspaceMode[] = ['current', 'worktree'];

export interface WorkspaceModeChipProps {
  value: WorkspaceMode;
  onChange: (next: WorkspaceMode) => void;
  disabled?: boolean;
}

export function WorkspaceModeChip({ value, onChange, disabled }: WorkspaceModeChipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onClickOutside(event: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="composerSelectChipWrapper composerWorkspaceModeChipWrapper" ref={wrapperRef}>
      <button
        type="button"
        className="composerSelectChip composerWorkspaceModeChip"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-tooltip={WORKSPACE_MODE_TOOLTIPS[value]}
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2 2 5l6 3 6-3-6-3z" />
          <path d="M2 8l6 3 6-3" />
          <path d="M2 11l6 3 6-3" />
        </svg>
        <span>{WORKSPACE_MODE_LABELS[value]}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>
      {open ? (
        <div className="composerSelectChipMenu" role="listbox">
          {WORKSPACE_MODE_ORDER.map((mode) => {
            const selected = mode === value;
            return (
              <button
                key={mode}
                type="button"
                role="option"
                aria-selected={selected}
                className={`composerSelectChipMenuItem${selected ? ' composerSelectChipMenuItemSelected' : ''}`}
                onClick={() => {
                  onChange(mode);
                  setOpen(false);
                }}
              >
                <span className="composerSelectChipMenuItemCheck" aria-hidden="true">
                  {selected ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.5 4.8 8.8 9.5 3.5" />
                    </svg>
                  ) : null}
                </span>
                <span>{WORKSPACE_MODE_LABELS[mode]}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
