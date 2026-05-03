import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { GuideCatRecord } from '../../core/types.js';
import {
  useGuideCatPlacement,
  useRegisterGuideCatDockSlot,
} from '../../app/renderer/GuideCatPlacementProvider.js';
import type { GuideCatDockSlotKind } from '../../app/renderer/guideCatPlacement.js';
import { useI18n } from '../../app/renderer/i18n/useI18n.js';
import {
  buildCatTooltip,
  resolveExecutionTargetLabel,
} from '../../shared/executionLabel.js';
import {
  resolveClientGuideCatName,
} from '../../shared/guideCatIdentity.js';
import { messageKeys } from '../../shared/i18n/index.js';
import { GUIDE_CAT_AVATAR_URL } from './GuideCatSidecar.js';

export interface GuideCatDockSlotProps {
  slotKind: GuideCatDockSlotKind;
}

export function GuideCatDockSlot({ slotKind }: GuideCatDockSlotProps) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const {
    guideCat,
    projection,
    dockSlotState,
    presentation,
    onDockedPointerDown,
    consumePillClickSuppression,
    clearPillClickSuppression,
    dragActive,
    undock,
  } = useGuideCatPlacement();
  const registerRef = useRegisterGuideCatDockSlot(slotKind);
  const { t } = useI18n();

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      slotRef.current = node;
      registerRef(node);
    },
    [registerRef],
  );

  if (!guideCat) {
    return null;
  }

  const state = dockSlotState[slotKind];
  const isActive =
    projection.kind === 'docked' && projection.slot === slotKind;
  const isPreview = state.preview;
  const displayName = resolveClientGuideCatName();
  const openGuideLabel = t(messageKeys.sharedGuideCatPillOpenLabel, {
    guideCatName: displayName,
  });
  const undockGuideLabel = t(messageKeys.sharedGuideCatDockUndockLabel, {
    guideCatName: displayName,
  });

  const tooltip = buildDockedTooltip(guideCat);

  const handleDockPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    onDockedPointerDown(event);
  };

  const handleClick = () => {
    if (consumePillClickSuppression()) return;
    presentation.toggle();
  };

  // Clicking the full active chrome row toggles the sidecar so the click
  // target matches the 2x-tall chrome block the dock joins, not just the
  // 28px pill. Drag-to-undock deliberately stays tied to the pill button
  // (onPointerDown below) — pointerdown on the surrounding row does
  // nothing, so the user can only start a drag by grabbing the avatar.
  const handleRowClick = isActive ? handleClick : undefined;
  // Mirror the pill's pointer-down behaviour (`onDockedPointerDown` clears
  // the drag-suppression flag) so the user's first click on the row area
  // after drag-dropping into the slot is not swallowed. Without this, a
  // drag-drop whose synthetic click never fired would leave `suppressRef`
  // set, and the first row click would be consumed rather than toggle the
  // sidecar open.
  const handleRowPointerDown = isActive
    ? () => {
        clearPillClickSuppression();
      }
    : undefined;
  const handlePillClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // Stop the click from bubbling into the row handler; otherwise a
    // direct avatar click would fire toggle twice (button + row) and
    // cancel itself out.
    event.stopPropagation();
    handleClick();
  };

  return (
    <div
      ref={setRef}
      className={`guideCatDockSlot guideCatDockSlot--${slotKind}`}
      data-active={isActive ? 'true' : 'false'}
      data-preview={isPreview ? 'true' : 'false'}
      data-dragging={dragActive ? 'true' : 'false'}
      onClick={handleRowClick}
      onPointerDown={handleRowPointerDown}
    >
      {isActive ? (
        <>
          <button
            type="button"
            className="guideCatPill guideCatPill--docked"
            onPointerDown={handleDockPointerDown}
            onClick={handlePillClick}
            aria-label={openGuideLabel}
            data-tooltip={tooltip}
            data-tooltip-delay="1000"
          >
            <img
              className="guideCatPillAvatar"
              src={GUIDE_CAT_AVATAR_URL}
              alt=""
              aria-hidden="true"
            />
          </button>
          {slotKind === 'workspace' ? (
            <>
              <span className="guideCatDockName">{displayName}</span>
              <button
                type="button"
                className="guideCatDockUndockSlot"
                aria-label={undockGuideLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  undock();
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* 8x8 arrow centred on the viewBox centre (8, 8)
                   * so it sits in the middle of the hover affordance.
                   * Shared visual language with the sidebar footer's
                   * runtime link icon. */}
                  <path d="M4 4h8v8" />
                  <path d="M4 12 12 4" />
                </svg>
              </button>
            </>
          ) : null}
        </>
      ) : null}
      {isPreview && !isActive ? (
        <div className="guideCatDockSlotGhost" aria-hidden="true">
          <img
            className="guideCatPillAvatar"
            src={GUIDE_CAT_AVATAR_URL}
            alt=""
            aria-hidden="true"
          />
        </div>
      ) : null}
    </div>
  );
}

function buildDockedTooltip(guideCat: GuideCatRecord): string {
  const displayName = resolveClientGuideCatName();
  const executionLabel = resolveExecutionTargetLabel({
    provider: guideCat.executionTarget.provider,
    instance: guideCat.executionTarget.instance,
    model: guideCat.executionTarget.model,
    modelSelection: guideCat.modelSelection ?? null,
  });
  return buildCatTooltip(displayName, executionLabel);
}
