import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { useConfirmDialog, ConfirmDialog } from './ConfirmDialog.js';

import type { GuideCatRecord } from '../../core/types.js';
import {
  useGuideCatSidecarState,
  type GuideCatSidecarViewState,
} from '../../app/renderer/useGuideCatSidecarState.js';

import type { GuideCatSidecarMode } from '../../shared/platform-contract.js';

interface GuideCatSidecarProps {
  guideCat: GuideCatRecord;
  ownerDisplayName: string;
  guideCatSidecarSeen: boolean;
  guideCatSidecarMode: GuideCatSidecarMode;
  unreadCount: number;
  onDismissed: () => void;
}

export type GuideCatSidecarSurfaceMode = 'lobby' | 'product' | 'hidden';
export const GUIDE_CAT_AVATAR_URL = new URL('../../../assets/guide-cat-avatar.svg', import.meta.url)
  .href;

export function resolveGuideCatSidecarSurfaceMode(pathname: string): GuideCatSidecarSurfaceMode {
  if (pathname === '/setup' || pathname.startsWith('/settings')) {
    return 'hidden';
  }
  return pathname === '/lobby' ? 'lobby' : 'product';
}

export function resolveGuideCatSidecarAnchorSelector(pathname: string): string | null {
  if (resolveGuideCatSidecarSurfaceMode(pathname) === 'hidden') {
    return null;
  }
  if (pathname === '/lobby') {
    return null;
  }
  return '.canvas';
}

export function resolveGuideCatSidecarOffsets(
  pathname: string,
  anchorLeft: number,
): { pillLeft: number; peekLeft: number; panelLeft: number } {
  if (resolveGuideCatSidecarSurfaceMode(pathname) === 'lobby') {
    return {
      pillLeft: 18,
      peekLeft: 56,
      panelLeft: 0,
    };
  }

  const panelLeft = Math.max(2, Math.round(anchorLeft) + 2);
  return {
    pillLeft: panelLeft + 14,
    peekLeft: panelLeft + 42,
    panelLeft,
  };
}

function useGuideCatSidecarPlacement(): {
  anchorStyle: CSSProperties;
  surfaceMode: GuideCatSidecarSurfaceMode;
} {
  const location = useLocation();
  const [anchorLeft, setAnchorLeft] = useState(0);

  useEffect(() => {
    const selector = resolveGuideCatSidecarAnchorSelector(location.pathname);
    if (!selector) {
      setAnchorLeft(0);
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let observedAnchor: HTMLElement | null = null;

    const bindResizeObserver = (anchor: HTMLElement | null) => {
      if (observedAnchor === anchor) {
        return;
      }

      resizeObserver?.disconnect();
      observedAnchor = anchor;

      if (anchor && typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
          requestUpdate();
        });
        resizeObserver.observe(anchor);
      } else {
        resizeObserver = null;
      }
    };

    const updateAnchor = () => {
      frameId = 0;
      const anchor = document.querySelector<HTMLElement>(selector);
      bindResizeObserver(anchor);
      const nextLeft = anchor
        ? Math.max(0, Math.round(anchor.getBoundingClientRect().left))
        : 0;
      setAnchorLeft((current) => (current === nextLeft ? current : nextLeft));
    };

    const requestUpdate = () => {
      if (frameId !== 0) {
        return;
      }
      frameId = window.requestAnimationFrame(updateAnchor);
    };

    requestUpdate();
    if (typeof MutationObserver === 'function') {
      mutationObserver = new MutationObserver(() => {
        requestUpdate();
      });
      mutationObserver.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    }

    window.addEventListener('resize', requestUpdate);
    document.addEventListener('scroll', requestUpdate, true);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', requestUpdate);
      document.removeEventListener('scroll', requestUpdate, true);
    };
  }, [location.pathname]);

  const offsets = resolveGuideCatSidecarOffsets(location.pathname, anchorLeft);
  return {
    anchorStyle: {
      '--guide-cat-pill-left': `${offsets.pillLeft}px`,
      '--guide-cat-peek-left': `${offsets.peekLeft}px`,
      '--guide-cat-panel-left': `${offsets.panelLeft}px`,
    } as CSSProperties,
    surfaceMode: resolveGuideCatSidecarSurfaceMode(location.pathname),
  };
}

function CollapsedPill({
  name,
  unreadCount,
  onClick,
  onDismissClick,
  style,
}: {
  name: string;
  unreadCount: number;
  onClick: () => void;
  onDismissClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div className="guideCatPillWrap" style={style}>
      <button
        type="button"
        className="guideCatPill"
        onClick={onClick}
        aria-label={`Open guide: ${name}`}
      >
        <GuideCatAvatar className="guideCatPillAvatar" />
        {unreadCount > 0 ? (
          <span className="guideCatPillBadge">{unreadCount}</span>
        ) : null}
      </button>
      {onDismissClick ? (
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
  name,
  ownerDisplayName,
  onAction,
  onDismiss,
  style,
}: {
  name: string;
  ownerDisplayName: string;
  onAction: (route: string) => void;
  onDismiss: () => void;
  style?: CSSProperties;
}) {
  return (
    <div
      className="guideCatPeek"
      style={style}
    >
      <div className="guideCatPeekHeader">
        <GuideCatAvatar className="guideCatPeekAvatar" />
        <span className="guideCatPeekName">Hi! I&rsquo;m {name}</span>
      </div>
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
      <button type="button" className="guideCatPeekDismiss" onClick={onDismiss}>
        Hide for now
      </button>
    </div>
  );
}

function OpenPanel({
  name,
  ownerDisplayName,
  onAction,
  onClose,
  style,
  surfaceMode,
}: {
  name: string;
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
      <div className="guideCatPanelHeader">
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

function SidecarContent({
  viewState,
  guideCat,
  ownerDisplayName,
  unreadCount,
  toggle,
  collapse,
  dismissWelcome,
  onDismissed,
  anchorStyle,
  surfaceMode,
}: {
  viewState: GuideCatSidecarViewState;
  guideCat: GuideCatRecord;
  ownerDisplayName: string;
  unreadCount: number;
  toggle: () => void;
  collapse: () => void;
  dismissWelcome: () => void;
  onDismissed: () => void;
  anchorStyle: CSSProperties;
  surfaceMode: GuideCatSidecarSurfaceMode;
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
  }, [viewState, collapse]);

  if (viewState === 'hidden') return null;

  if (viewState === 'collapsed') {
    return (
      <>
        <CollapsedPill
          name={guideCat.name}
          unreadCount={unreadCount}
          onClick={toggle}
          onDismissClick={handleDismissClick}
          style={anchorStyle}
        />
        <ConfirmDialog dialog={dialog} onClose={handleClose} />
      </>
    );
  }

  if (viewState === 'welcome-peek') {
    return (
      <div ref={panelRef}>
        <CollapsedPill
          name={guideCat.name}
          unreadCount={0}
          onClick={toggle}
          onDismissClick={handleDismissClick}
          style={anchorStyle}
        />
        <WelcomePeek
          name={guideCat.name}
          ownerDisplayName={ownerDisplayName}
          onAction={handleAction}
          onDismiss={dismissWelcome}
          style={anchorStyle}
        />
      </div>
    );
  }

  return (
    <div ref={panelRef}>
      <OpenPanel
        name={guideCat.name}
        ownerDisplayName={ownerDisplayName}
        onAction={handleAction}
        onClose={collapse}
        style={anchorStyle}
        surfaceMode={surfaceMode}
      />
    </div>
  );
}

export function GuideCatSidecar({
  guideCat,
  ownerDisplayName,
  guideCatSidecarSeen,
  guideCatSidecarMode,
  unreadCount,
  onDismissed,
}: GuideCatSidecarProps) {
  const { viewState, toggle, collapse, dismissWelcome } = useGuideCatSidecarState(
    guideCatSidecarSeen,
    guideCatSidecarMode,
  );
  const { anchorStyle, surfaceMode } = useGuideCatSidecarPlacement();

  return createPortal(
    <SidecarContent
      viewState={viewState}
      guideCat={guideCat}
      ownerDisplayName={ownerDisplayName}
      unreadCount={unreadCount}
      toggle={toggle}
      collapse={collapse}
      dismissWelcome={dismissWelcome}
      onDismissed={onDismissed}
      anchorStyle={anchorStyle}
      surfaceMode={surfaceMode}
    />,
    document.body,
  );
}
