import React, {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  useConfirmDialog,
  ConfirmDialog,
  type ConfirmDialogAction,
  type ConfirmDialogOptions,
} from './ConfirmDialog.js';

import type { GuideCatRecord } from '../../core/types.js';
import type { GuideCatSidecarViewState } from '../../app/renderer/useGuideCatSidecarState.js';
import {
  isGuideCatDismissTransientChromeEvent,
  useGuideCatPlacement,
} from '../../app/renderer/GuideCatPlacementProvider.js';
import { useGuideCatUiPrefs } from '../../app/renderer/guideCatUiPrefsStore.js';

import {
  buildCatTooltip,
  resolveExecutionTargetLabel,
} from '../../shared/executionLabel.js';
import {
  resolveGuideCatDisplayName,
} from '../../shared/guideCatIdentity.js';

interface GuideCatSidecarProps {
  guideCat: GuideCatRecord;
  ownerDisplayName: string;
  unreadCount: number;
  onDismissed: () => void;
}

export type GuideCatSidecarSurfaceMode = 'lobby' | 'product' | 'hidden';
export const GUIDE_CAT_AVATAR_URL = new URL('../../../assets/guide-cat-avatar.svg', import.meta.url)
  .href;
const FLOATING_PILL_RADIUS_PX = 14;
const FLOATING_PEEK_OFFSET_PX = 36;
/** Distance between the right edge of the workspace sidebar (the dock
 * slot's right edge) and the peek's left edge when the pill is docked.
 * Smaller than the floating offset so the peek hugs the sidebar instead
 * of floating 36px out into the canvas. */
const WORKSPACE_DOCKED_PEEK_OFFSET_PX = 20;
/** Distance between the bottom of the lobby top-bar dock slot and the
 * top of the peek when the pill is docked. Smaller than the floating
 * offset so the peek's upward-pointing tail hugs the dock pill instead
 * of dropping 36px into the canvas. */
const LOBBY_DOCKED_PEEK_OFFSET_PX = 20;

export function resolveGuideCatSidecarSurfaceMode(
  pathname: string,
  placement: 'floating' | 'docked' = 'floating',
): GuideCatSidecarSurfaceMode {
  if (pathname === '/setup') {
    return 'hidden';
  }
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    // Mirror resolveGuideCatSurfaceClass: a docked pill on /settings keeps
    // the sidecar alive (but it opens as a speech bubble — see
    // useGuideCatSidecarState) so it does not smother the settings canvas.
    return placement === 'docked' ? 'product' : 'hidden';
  }
  return pathname === '/lobby' ? 'lobby' : 'product';
}

export function CollapsedPill({
  name,
  tooltip,
  unreadCount,
  onClick,
  onDismissClick,
  onPointerDown,
  style,
  className,
  dragging,
}: {
  name: string;
  tooltip: string;
  unreadCount: number;
  onClick: () => void;
  onDismissClick?: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  style?: CSSProperties;
  className?: string;
  dragging?: boolean;
}) {
  const displayName = resolveGuideCatDisplayName({ name });
  return (
    <div
      className={className ?? 'guideCatPillWrap'}
      data-dragging={dragging ? 'true' : 'false'}
      style={style}
    >
      <button
        type="button"
        className="guideCatPill"
        onPointerDown={onPointerDown}
        onClick={onClick}
        aria-label={`Open guide: ${displayName}`}
        data-tooltip={tooltip}
        data-tooltip-delay="1000"
      >
        <GuideCatAvatar className="guideCatPillAvatar" />
        {unreadCount > 0 ? (
          <span className="guideCatPillBadge">{unreadCount}</span>
        ) : null}
      </button>
      {onDismissClick && !dragging ? (
        <button
          type="button"
          className="guideCatPillDismiss"
          onClick={(e: ReactMouseEvent) => { e.stopPropagation(); onDismissClick(); }}
          aria-label="Disable guide cat"
        >
          &#x2715;
        </button>
      ) : null}
    </div>
  );
}

export type GuideCatPeekAnchor = 'anchor-left' | 'anchor-top' | 'anchor-bottom-left';

function WelcomePeek({
  ownerDisplayName,
  onAction,
  onDismiss,
  style,
  anchor = 'anchor-left',
}: {
  ownerDisplayName: string;
  onAction: (route: string) => void;
  onDismiss?: () => void;
  style?: CSSProperties;
  /** Tail direction for the speech bubble tail — `anchor-left` keeps the
   * default (tail pointing left toward a floating pill on the right), and
   * `anchor-top` flips the tail upward so the peek can sit below a docked
   * pill in the lobby top-bar dock slot. */
  anchor?: GuideCatPeekAnchor;
}) {
  return (
    <div
      className={`guideCatPeek guideCatPeek--${anchor}`}
      style={style}
    >
      <p className="guideCatPeekGreeting">
        Welcome, {ownerDisplayName}. I&rsquo;m your guide cat.
        Here are some things to get you started.
      </p>
      <div className="guideCatPeekActions">
        <button type="button" className="guideCatPeekAction" onClick={() => onAction('/chat/new')}>
          Start first chat
        </button>
        <button type="button" className="guideCatPeekAction" onClick={() => onAction('/settings/cats')}>
          Meet your cats
        </button>
        <button type="button" className="guideCatPeekAction" onClick={() => onAction('/lobby')}>
          Explore products
        </button>
      </div>
      {onDismiss ? (
        <button type="button" className="guideCatPeekDismiss" onClick={onDismiss}>
          Hide for now
        </button>
      ) : null}
    </div>
  );
}

function OpenPanel({
  name,
  tooltip,
  ownerDisplayName,
  onAction,
  onClose,
  style,
  surfaceMode,
}: {
  name: string;
  tooltip: string;
  ownerDisplayName: string;
  onAction: (route: string) => void;
  onClose: () => void;
  style?: CSSProperties;
  surfaceMode: GuideCatSidecarSurfaceMode;
}) {
  const displayName = resolveGuideCatDisplayName({ name });
  return (
    <div
      className={
        surfaceMode === 'lobby'
          ? 'guideCatPanel guideCatPanel--lobby'
          : 'guideCatPanel guideCatPanel--product'
      }
      style={style}
    >
      <div className="guideCatPanelHeader" data-tooltip={tooltip} data-tooltip-delay="1000">
        <GuideCatAvatar className="guideCatPanelAvatar" />
        <span className="guideCatPanelName">{displayName}</span>
        <button type="button" className="guideCatPanelClose" onClick={onClose} aria-label="Close">
          &#x2715;
        </button>
      </div>
      <div className="guideCatPanelBody">
        <p className="guideCatPanelGreeting">
          Hi {ownerDisplayName}, I&rsquo;m {displayName} &mdash; your guide cat.
          Pick any of these to get started, or close this panel and explore on your own.
        </p>
        <div className="guideCatPanelActions">
          <button type="button" className="guideCatPanelAction" onClick={() => onAction('/chat/new')}>
            Start first chat
          </button>
          <button type="button" className="guideCatPanelAction" onClick={() => onAction('/settings/cats')}>
            Meet your cats
          </button>
          <button type="button" className="guideCatPanelAction" onClick={() => onAction('/lobby')}>
            Explore products
          </button>
        </div>
      </div>
    </div>
  );
}

function GuideCatAvatar({ className }: { className: string }) {
  return (
    <img
      className={className}
      src={GUIDE_CAT_AVATAR_URL}
      alt=""
      aria-hidden="true"
    />
  );
}

export interface GuideCatSidecarViewProps {
  viewState: GuideCatSidecarViewState;
  guideCat: GuideCatRecord;
  ownerDisplayName: string;
  unreadCount: number;
  onToggle: () => void;
  onAction: (route: string) => void;
  onCollapse: () => void;
  onDismissWelcome?: () => void;
  onDismissClick: () => void;
  onPillPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  dragging?: boolean;
  pillStyle: CSSProperties;
  peekStyle: CSSProperties;
  panelStyle: CSSProperties;
  surfaceMode: GuideCatSidecarSurfaceMode;
  dialog: { options: ConfirmDialogOptions } | null;
  onDialogClose: (action: ConfirmDialogAction | boolean) => void;
  rootRef?: Ref<HTMLDivElement>;
  /** When true, the pill is being rendered by the dock slot component
   * instead of the sidecar. In that case the sidecar still renders the
   * welcome-peek bubble (anchored to the dock slot via `peekStyle` /
   * `peekAnchor`) or the open panel; the collapsed view is skipped because
   * the dock slot already owns that UI. */
  pillHostedExternally?: boolean;
  /** Tail direction for the welcome-peek bubble. See WelcomePeek. */
  peekAnchor?: GuideCatPeekAnchor;
}

export function GuideCatSidecarView({
  viewState,
  guideCat,
  ownerDisplayName,
  unreadCount,
  onToggle,
  onAction,
  onCollapse,
  onDismissWelcome,
  onDismissClick,
  onPillPointerDown,
  dragging,
  pillStyle,
  peekStyle,
  panelStyle,
  surfaceMode,
  dialog,
  onDialogClose,
  rootRef,
  pillHostedExternally,
  peekAnchor = 'anchor-left',
}: GuideCatSidecarViewProps) {
  if (viewState === 'hidden') {
    return null;
  }
  if (pillHostedExternally && viewState === 'collapsed') {
    // The collapsed pill lives in the dock slot in docked mode; the sidecar
    // has no content to add on top of that. Welcome-peek and open both
    // still render here (the peek is anchored to the dock slot rect by the
    // caller via `peekStyle` + `peekAnchor`).
    return null;
  }

  const tooltip = buildGuideCatTooltip(guideCat);
  let content: JSX.Element;
  if (viewState === 'collapsed') {
    content = (
      <CollapsedPill
        name={guideCat.name}
        tooltip={tooltip}
        unreadCount={unreadCount}
        onClick={onToggle}
        onDismissClick={onDismissClick}
        onPointerDown={onPillPointerDown}
        style={pillStyle}
        dragging={dragging}
      />
    );
  } else if (viewState === 'welcome-peek') {
    content = (
      <div ref={rootRef}>
        {pillHostedExternally ? null : (
          <CollapsedPill
            name={guideCat.name}
            tooltip={tooltip}
            unreadCount={0}
            onClick={onToggle}
            onDismissClick={onDismissClick}
            onPointerDown={onPillPointerDown}
            style={pillStyle}
            dragging={dragging}
          />
        )}
        <WelcomePeek
          ownerDisplayName={ownerDisplayName}
          onAction={onAction}
          onDismiss={onDismissWelcome}
          style={peekStyle}
          anchor={peekAnchor}
        />
      </div>
    );
  } else {
    content = (
      <div ref={rootRef}>
        <OpenPanel
          name={guideCat.name}
          tooltip={tooltip}
          ownerDisplayName={ownerDisplayName}
          onAction={onAction}
          onClose={onCollapse}
          style={panelStyle}
          surfaceMode={surfaceMode}
        />
      </div>
    );
  }

  return (
    <>
      {content}
      <ConfirmDialog dialog={dialog} onClose={onDialogClose} />
    </>
  );
}

function buildGuideCatTooltip(guideCat: GuideCatRecord): string {
  const displayName = resolveGuideCatDisplayName(guideCat);
  const executionLabel = resolveExecutionTargetLabel({
    provider: guideCat.executionTarget.provider,
    instance: guideCat.executionTarget.instance,
    model: guideCat.executionTarget.model,
    modelSelection: guideCat.modelSelection ?? null,
  });
  return buildCatTooltip(displayName, executionLabel);
}

function SidecarContent({
  viewState,
  guideCat,
  ownerDisplayName,
  unreadCount,
  proactive,
  toggle,
  collapse,
  dismissWelcome,
  onDismissed,
  onPillPointerDown,
  consumePillClickSuppression,
  pillStyle,
  peekStyle,
  panelStyle,
  surfaceMode,
  dragActive,
  pillHostedExternally,
  peekAnchor,
}: {
  viewState: GuideCatSidecarViewState;
  guideCat: GuideCatRecord;
  ownerDisplayName: string;
  unreadCount: number;
  proactive: boolean;
  toggle: () => void;
  collapse: () => void;
  dismissWelcome: () => void;
  onDismissed: () => void;
  onPillPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  consumePillClickSuppression: () => boolean;
  pillStyle: CSSProperties;
  peekStyle: CSSProperties;
  panelStyle: CSSProperties;
  surfaceMode: GuideCatSidecarSurfaceMode;
  dragActive: boolean;
  pillHostedExternally?: boolean;
  peekAnchor?: GuideCatPeekAnchor;
}) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const guideCatUiPrefs = useGuideCatUiPrefs();
  const { dialog, choose, handleClose } = useConfirmDialog();
  const guideCatName = resolveGuideCatDisplayName(guideCat);

  const handleAction = useCallback((route: string) => {
    collapse();
    navigate(route);
  }, [collapse, navigate]);

  const handleDismissClick = useCallback(async () => {
    const action = await choose({
      title: `Disable ${guideCatName}?`,
      message: `This turns off ${guideCatName} help in Cats. If you just want it out of the way, you can dock it now instead. You can enable it again from Settings > Assistants.`,
      confirmLabel: 'Disable',
      cancelLabel: 'Keep enabled',
      auxiliaryLabel: 'Dock now',
      defaultAction: 'auxiliary',
    });
    if (action === 'auxiliary') {
      guideCatUiPrefs.update({ placement: 'docked' });
      collapse();
      return;
    }
    if (action !== 'confirm') return;

    try {
      const response = await fetch('/api/platform/guide-cat', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      if (response.ok) {
        onDismissed();
      }
    } catch { /* ignore */ }
  }, [choose, collapse, guideCatName, guideCatUiPrefs, onDismissed]);

  useEffect(() => {
    if (viewState !== 'open' && viewState !== 'welcome-peek') return;
    if (viewState === 'welcome-peek' && proactive) return;
    if (dragActive) return;

    function onClickOutside(event: MouseEvent) {
      // Skip the synthetic mousedown that `dismissTransientChrome` emits on
      // every pill pointerdown: it targets document.body, so without this
      // check the sidecar would collapse itself, only for the ensuing
      // click to toggle the panel right back open.
      if (isGuideCatDismissTransientChromeEvent(event)) return;
      const target = event.target as HTMLElement | null;
      // Clicks on the pill / dock slot toggle the sidecar through the
      // existing click path. Collapsing here would race that toggle and
      // flip the panel back to its previous state.
      if (
        target?.closest?.('.guideCatDockSlot')
        || target?.closest?.('.guideCatPillWrap')
      ) {
        return;
      }
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        collapse();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') collapse();
    }

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [viewState, collapse, proactive, dragActive]);

  const handlePillClick = useCallback(() => {
    if (consumePillClickSuppression()) return;
    toggle();
  }, [consumePillClickSuppression, toggle]);

  return (
    <GuideCatSidecarView
      viewState={viewState}
      guideCat={guideCat}
      ownerDisplayName={ownerDisplayName}
      unreadCount={unreadCount}
      onToggle={handlePillClick}
      onAction={handleAction}
      onCollapse={collapse}
      onDismissWelcome={proactive ? dismissWelcome : undefined}
      onDismissClick={handleDismissClick}
      onPillPointerDown={onPillPointerDown}
      dragging={dragActive}
      pillStyle={pillStyle}
      peekStyle={peekStyle}
      panelStyle={panelStyle}
      surfaceMode={surfaceMode}
      dialog={dialog}
      onDialogClose={handleClose}
      rootRef={panelRef}
      pillHostedExternally={pillHostedExternally}
      peekAnchor={peekAnchor}
    />
  );
}

export function GuideCatSidecar({
  guideCat,
  ownerDisplayName,
  unreadCount,
  onDismissed,
}: GuideCatSidecarProps) {
  const location = useLocation();
  const {
    projection,
    presentation,
    onFloatingPointerDown,
    consumePillClickSuppression,
    dragActive,
    panelOriginX,
    getDockSlotRect,
  } = useGuideCatPlacement();

  if (projection.kind === 'hidden') {
    return null;
  }

  const pillHostedInDockSlot = projection.kind === 'docked';
  // The dock slot owns the collapsed pill UI in docked mode; nothing for
  // the sidecar to render on top of that. Welcome-peek (bubble mode) and
  // open both still render here — see peekStyle / peekAnchor below for
  // how the peek anchors to the docked pill's live rect.
  if (pillHostedInDockSlot && presentation.viewState === 'collapsed') {
    return null;
  }

  const floating = projection.kind === 'floating' ? projection : null;
  const pillStyle: CSSProperties = floating
    ? {
        left: `${floating.x - FLOATING_PILL_RADIUS_PX}px`,
        top: `${floating.y - FLOATING_PILL_RADIUS_PX}px`,
        transform: 'none',
      }
    : {};
  const dockedPeek = !floating && projection.kind === 'docked'
    ? resolveDockedPeekPlacement(projection.slot, getDockSlotRect(projection.slot))
    : null;
  const peekStyle: CSSProperties = floating
    ? {
        left: `${floating.x + FLOATING_PEEK_OFFSET_PX}px`,
        top: `${floating.y}px`,
        transform: 'translateY(-50%)',
      }
    : dockedPeek?.style ?? {};
  const peekAnchor: GuideCatPeekAnchor = dockedPeek?.anchor ?? 'anchor-left';
  const panelStyle: CSSProperties = {
    left: `${panelOriginX}px`,
  };
  const surfaceMode: GuideCatSidecarSurfaceMode = resolveGuideCatSidecarSurfaceMode(
    location.pathname,
    projection.kind === 'docked' ? 'docked' : 'floating',
  );

  return createPortal(
    <SidecarContent
      viewState={presentation.viewState}
      guideCat={guideCat}
      ownerDisplayName={ownerDisplayName}
      unreadCount={unreadCount}
      proactive={presentation.proactive}
      toggle={presentation.toggle}
      collapse={presentation.collapse}
      dismissWelcome={presentation.dismissWelcome}
      onDismissed={onDismissed}
      onPillPointerDown={pillHostedInDockSlot ? undefined : onFloatingPointerDown}
      consumePillClickSuppression={consumePillClickSuppression}
      pillStyle={pillStyle}
      peekStyle={peekStyle}
      panelStyle={panelStyle}
      surfaceMode={surfaceMode}
      dragActive={dragActive}
      pillHostedExternally={pillHostedInDockSlot}
      peekAnchor={peekAnchor}
    />,
    document.body,
  );
}

/** Compute where the welcome-peek bubble should sit relative to a docked
 * pill. Workspace dock lives in the left sidebar → peek sits to the right
 * with its bottom edge pinned to the dock slot bottom (= the line that
 * used to separate dock from user chrome), so the peek reads as attached
 * to the dock row rather than floating across the canvas. Lobby dock
 * lives in the top bar → peek sits below with an upward-pointing tail
 * (the `anchor-top` variant). Returns null when the slot isn't mounted
 * yet, so the caller can fall back to no positioning rather than snap
 * the peek to viewport defaults. */
function resolveDockedPeekPlacement(
  slot: 'lobby' | 'workspace',
  rect: { left: number; top: number; right: number; bottom: number } | null,
): { style: CSSProperties; anchor: GuideCatPeekAnchor } | null {
  if (!rect) return null;
  if (slot === 'workspace') {
    return {
      style: {
        left: `${rect.right + WORKSPACE_DOCKED_PEEK_OFFSET_PX}px`,
        top: `${rect.bottom}px`,
        transform: 'translateY(-100%)',
      },
      anchor: 'anchor-bottom-left',
    };
  }
  return {
    style: {
      left: `${(rect.left + rect.right) / 2}px`,
      top: `${rect.bottom + LOBBY_DOCKED_PEEK_OFFSET_PX}px`,
      transform: 'translateX(-50%)',
    },
    anchor: 'anchor-top',
  };
}
