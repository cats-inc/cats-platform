import { useEffect, useRef, useState } from 'react';

export type PermissionMode = 'full' | 'read_only';

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'full';

const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  full: 'Full access',
  read_only: 'Read only',
};

const PERMISSION_MODE_ORDER: readonly PermissionMode[] = ['full', 'read_only'];

export interface PermissionModeChipProps {
  value: PermissionMode;
  onChange: (next: PermissionMode) => void;
  disabled?: boolean;
}

export function PermissionModeChip({ value, onChange, disabled }: PermissionModeChipProps) {
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
    <div className="composerPermissionChipWrapper" ref={wrapperRef}>
      <button
        type="button"
        className="composerPermissionChip"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1.5l5.5 2v4c0 3.3-2.4 6.2-5.5 7-3.1-.8-5.5-3.7-5.5-7v-4z" />
        </svg>
        <span>{PERMISSION_MODE_LABELS[value]}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>
      {open ? (
        <div className="composerPermissionMenu" role="listbox">
          {PERMISSION_MODE_ORDER.map((mode) => {
            const selected = mode === value;
            return (
              <button
                key={mode}
                type="button"
                role="option"
                aria-selected={selected}
                className={`composerPermissionMenuItem${selected ? ' composerPermissionMenuItemSelected' : ''}`}
                onClick={() => {
                  onChange(mode);
                  setOpen(false);
                }}
              >
                <span className="composerPermissionMenuItemCheck" aria-hidden="true">
                  {selected ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.5 4.8 8.8 9.5 3.5" />
                    </svg>
                  ) : null}
                </span>
                <span>{PERMISSION_MODE_LABELS[mode]}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
