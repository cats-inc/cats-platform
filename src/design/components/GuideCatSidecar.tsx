import {
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

import { useConfirmDialog, ConfirmDialog, type ConfirmDialogOptions } from './ConfirmDialog.js';

import type { GuideCatRecord } from '../../core/types.js';
import type { GuideCatSidecarViewState } from '../../app/renderer/useGuideCatSidecarState.js';
import { useGuideCatPlacement } from '../../app/renderer/GuideCatPlacementProvider.js';

import {
  buildCatTooltip,
  resolveExecutionTargetLabel,
} from '../../shared/executionLabel.js';

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

export function resolveGuideCatSidecarSurfaceMode(pathname: string): GuideCatSidecarSurfaceMode {
  if (pathname === '/setup' || pathname.startsWith('/settings')) {
    return 'hidden';
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
        aria-label={`Open guide: ${name}`}
        data-tooltip={tooltip}
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
          aria-label="Dismiss guide cat"
        >
          &#x2715;
        </button>
      ) : null}
    </div>
  );
}

function WelcomePeek({
  ownerDisplayName,
  onAction,
  onDismiss,
  style,
}: {
  ownerDisplayName: string;
  onAction: (route: string) => void;
  onDismiss?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div
      className="guideCatPeek"
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
  return (
    <div
      className={
        surfaceMode === 'lobby'
          ? 'guideCatPanel guideCatPanel--lobby'
          : 'guideCatPanel guideCatPanel--product'
      }
      style={style}
    >
      <div className="guideCatPanelHeader" data-tooltip={tooltip}>
        <GuideCatAvatar className="guideCatPanelAvatar" />
        <span className="guideCatPanelName">{name}</span>
        <button type="button" className="guideCatPanelClose" onClick={onClose} aria-label="Close">
          &#x2715;
        </button>
      </div>
      <div className="guideCatPanelBody">
        <p className="guideCatPanelGreeting">
          Hi {ownerDisplayName}, I&rsquo;m {name} &mdash; your guide cat.
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
  onDialogClose: (confirmed: boolean) => void;
  rootRef?: Ref<HTMLDivElement>;
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
}: GuideCatSidecarViewProps) {
  if (viewState === 'hidden') {
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
        <WelcomePeek
          ownerDisplayName={ownerDisplayName}
          onAction={onAction}
          onDismiss={onDismissWelcome}
          style={peekStyle}
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
  const executionLabel = resolveExecutionTargetLabel({
    provider: guideCat.executionTarget.provider,
    instance: guideCat.executionTarget.instance,
    model: guideCat.executionTarget.model,
    modelSelection: guideCat.modelSelection ?? null,
  });
  return buildCatTooltip(guideCat.name, executionLabel);
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
}) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const { dialog, confirm, handleClose } = useConfirmDialog();

  const handleAction = useCallback((route: string) => {
    collapse();
    navigate(route);
  }, [collapse, navigate]);

  const handleDismissClick = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Dismiss Guide Cat?',
      message: 'Your guide cat will be hidden. You can restore it later from Settings.',
      confirmLabel: 'Dismiss',
      cancelLabel: 'Keep',
    });
    if (!confirmed) return;

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
  }, [confirm, onDismissed]);

  useEffect(() => {
    if (viewState !== 'open' && viewState !== 'welcome-peek') return;
    if (viewState === 'welcome-peek' && proactive) return;
    if (dragActive) return;

    function onClickOutside(event: MouseEvent) {
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
  } = useGuideCatPlacement();

  if (projection.kind !== 'floating') {
    return null;
  }

  const pillLeft = projection.x - FLOATING_PILL_RADIUS_PX;
  const pillTop = projection.y - FLOATING_PILL_RADIUS_PX;
  const pillStyle: CSSProperties = {
    left: `${pillLeft}px`,
    top: `${pillTop}px`,
    transform: 'none',
  };
  const peekStyle: CSSProperties = {
    left: `${projection.x + FLOATING_PEEK_OFFSET_PX}px`,
    top: `${projection.y}px`,
    transform: 'translateY(-50%)',
  };
  const panelStyle: CSSProperties = {
    left: `${panelOriginX}px`,
  };
  const surfaceMode: GuideCatSidecarSurfaceMode = resolveGuideCatSidecarSurfaceMode(
    location.pathname,
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
      onPillPointerDown={onFloatingPointerDown}
      consumePillClickSuppression={consumePillClickSuppression}
      pillStyle={pillStyle}
      peekStyle={peekStyle}
      panelStyle={panelStyle}
      surfaceMode={surfaceMode}
      dragActive={dragActive}
    />,
    document.body,
  );
}
