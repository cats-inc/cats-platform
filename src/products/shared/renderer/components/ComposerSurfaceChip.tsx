import type { ReactNode } from 'react';

import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

export interface ComposerSurfaceChipProps {
  surface: PlatformSurfaceId;
  onDismiss?: () => void;
  disabled?: boolean;
}

const SURFACE_LABEL_KEYS: Record<PlatformSurfaceId, keyof typeof messageKeys> = {
  chat: 'sharedComposerSurfaceLabelChat',
  work: 'sharedComposerSurfaceLabelWork',
  code: 'sharedComposerSurfaceLabelCode',
};

function renderSurfaceIcon(surface: PlatformSurfaceId): ReactNode {
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
  if (surface === 'code') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M5 4L2 8l3 4" />
        <path d="M11 4l3 4-3 4" />
        <path d="M9.5 3l-3 10" />
      </svg>
    );
  }
  if (surface === 'work') {
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

export function ComposerSurfaceChip({ surface, onDismiss, disabled = false }: ComposerSurfaceChipProps) {
  const { t } = useI18n();
  const label = t(messageKeys[SURFACE_LABEL_KEYS[surface]]);
  return (
    <span className={`composerSurfaceChip composerSurfaceChip${capitalize(surface)}`}>
      {renderSurfaceIcon(surface)}
      <span>{label}</span>
      {onDismiss ? (
        <button
          type="button"
          className="composerChipClose"
          disabled={disabled}
          onClick={onDismiss}
          aria-label={t(messageKeys.sharedComposerSurfaceClearAria, {
            surfaceLabel: label,
          })}
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
