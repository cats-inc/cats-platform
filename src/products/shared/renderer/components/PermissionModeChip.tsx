import { useEffect, useRef, useState } from 'react';

import {
  DEFAULT_DRAFT_PERMISSION_MODE,
  type DraftPermissionMode,
} from '../../../../shared/runtimeSessionPolicy.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

export type PermissionMode = DraftPermissionMode;

export const DEFAULT_PERMISSION_MODE: PermissionMode = DEFAULT_DRAFT_PERMISSION_MODE;

const PERMISSION_MODE_LABEL_KEYS: Record<PermissionMode, keyof typeof messageKeys> = {
  full: 'sharedPermissionModeFullAccess',
  read_only: 'sharedPermissionModeReadOnly',
};

const PERMISSION_MODE_ORDER: readonly PermissionMode[] = ['full', 'read_only'];

export interface PermissionModeChipProps {
  value: PermissionMode;
  onChange: (next: PermissionMode) => void;
  disabled?: boolean;
}

export function PermissionModeChip({ value, onChange, disabled }: PermissionModeChipProps) {
  const { t } = useI18n();
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
    <div className="composerSelectChipWrapper composerPermissionChipWrapper" ref={wrapperRef}>
      <button
        type="button"
        className="composerSelectChip composerPermissionChip"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1.5l5.5 2v4c0 3.3-2.4 6.2-5.5 7-3.1-.8-5.5-3.7-5.5-7v-4z" />
        </svg>
        <span>{t(messageKeys[PERMISSION_MODE_LABEL_KEYS[value]])}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>
      {open ? (
        <div className="composerSelectChipMenu" role="listbox">
          {PERMISSION_MODE_ORDER.map((mode) => {
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
                <span>{t(messageKeys[PERMISSION_MODE_LABEL_KEYS[mode]])}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
