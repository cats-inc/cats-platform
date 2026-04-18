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
import {
  buildCatTooltip,
  resolveExecutionTargetLabel,
} from '../../shared/executionLabel.js';
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
    dragActive,
  } = useGuideCatPlacement();
  const registerRef = useRegisterGuideCatDockSlot(slotKind);

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
    >
      {isActive ? (
        <>
          <button
            type="button"
            className="guideCatPill guideCatPill--docked"
            onPointerDown={handleDockPointerDown}
            onClick={handlePillClick}
            aria-label={`Open guide: ${guideCat.name}`}
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
            <span className="guideCatDockName">{guideCat.name}</span>
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
  const executionLabel = resolveExecutionTargetLabel({
    provider: guideCat.executionTarget.provider,
    instance: guideCat.executionTarget.instance,
    model: guideCat.executionTarget.model,
    modelSelection: guideCat.modelSelection ?? null,
  });
  return buildCatTooltip(guideCat.name, executionLabel);
}
