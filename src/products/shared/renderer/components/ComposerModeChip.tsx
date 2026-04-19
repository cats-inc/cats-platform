import type { ReactNode } from 'react';

export type ComposerMode = 'chat' | 'code' | 'work';

export interface ComposerModeChipProps {
  mode: ComposerMode;
  onDismiss?: () => void;
  disabled?: boolean;
}

const MODE_LABELS: Record<ComposerMode, string> = {
  chat: 'Chat',
  code: 'Code',
  work: 'Work',
};

function renderModeIcon(mode: ComposerMode): ReactNode {
  const common = {
    width: 12,
    height: 12,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (mode === 'code') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M5 4L2 8l3 4" />
        <path d="M11 4l3 4-3 4" />
        <path d="M9.5 3l-3 10" />
      </svg>
    );
  }
  if (mode === 'work') {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="2" y="5" width="12" height="8" rx="1.5" />
        <path d="M6 5V3.5A1 1 0 0 1 7 2.5h2a1 1 0 0 1 1 1V5" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <path d="M3 5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7l-3 2v-2a1 1 0 0 1-1-1V5z" />
    </svg>
  );
}

export function ComposerModeChip({ mode, onDismiss, disabled = false }: ComposerModeChipProps) {
  const label = MODE_LABELS[mode];
  return (
    <span className={`composerModeChip composerModeChip${capitalize(mode)}`}>
      {renderModeIcon(mode)}
      <span>{label}</span>
      {onDismiss ? (
        <button
          type="button"
          className="composerChipClose"
          disabled={disabled}
          onClick={onDismiss}
          aria-label={`Clear ${label} mode`}
        >
          &times;
        </button>
      ) : null}
    </span>
  );
}

function capitalize<T extends string>(value: T): Capitalize<T> {
  return (value.charAt(0).toUpperCase() + value.slice(1)) as Capitalize<T>;
}
