import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

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

  return (
    <div
      ref={setRef}
      className={`guideCatDockSlot guideCatDockSlot--${slotKind}`}
      data-active={isActive ? 'true' : 'false'}
      data-preview={isPreview ? 'true' : 'false'}
      data-dragging={dragActive ? 'true' : 'false'}
    >
      {isActive ? (
        <button
          type="button"
          className="guideCatPill guideCatPill--docked"
          onPointerDown={handleDockPointerDown}
          onClick={handleClick}
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
