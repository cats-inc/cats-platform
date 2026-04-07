import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import type { GuideCatRecord } from '../../core/types.js';
import { nameInitials } from '../../shared/nameInitials.js';
import {
  useGuideCatSidecarState,
  type GuideCatSidecarViewState,
} from '../../app/renderer/useGuideCatSidecarState.js';

interface GuideCatSidecarProps {
  guideCat: GuideCatRecord;
  ownerDisplayName: string;
  guideCatSidecarSeen: boolean;
  unreadCount: number;
}

export type GuideCatSidecarSurfaceMode = 'lobby' | 'product' | 'hidden';

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
  avatarColor,
  unreadCount,
  onClick,
  style,
}: {
  name: string;
  avatarColor?: string;
  unreadCount: number;
  onClick: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className="guideCatPill"
      style={{
        ...style,
        ...(avatarColor ? { background: avatarColor } : {}),
      }}
      onClick={onClick}
      aria-label={`Open guide: ${name}`}
    >
      {nameInitials(name)}
      {unreadCount > 0 ? (
        <span className="guideCatPillBadge">{unreadCount}</span>
      ) : null}
    </button>
  );
}

function WelcomePeek({
  name,
  ownerDisplayName,
  avatarColor,
  onAction,
  onDismiss,
  style,
}: {
  name: string;
  ownerDisplayName: string;
  avatarColor?: string;
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
        <span
          className="guideCatPeekAvatar"
          style={avatarColor ? { background: avatarColor } : undefined}
        >
          {nameInitials(name)}
        </span>
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
  avatarColor,
  onAction,
  onClose,
  style,
  surfaceMode,
}: {
  name: string;
  ownerDisplayName: string;
  avatarColor?: string;
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
        <span
          className="guideCatPanelAvatar"
          style={avatarColor ? { background: avatarColor } : undefined}
        >
          {nameInitials(name)}
        </span>
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

function SidecarContent({
  viewState,
  guideCat,
  ownerDisplayName,
  unreadCount,
  toggle,
  collapse,
  dismissWelcome,
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
  anchorStyle: CSSProperties;
  surfaceMode: GuideCatSidecarSurfaceMode;
}) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  const handleAction = useCallback((route: string) => {
    collapse();
    navigate(route);
  }, [collapse, navigate]);

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
      <CollapsedPill
        name={guideCat.name}
        unreadCount={unreadCount}
        onClick={toggle}
        style={anchorStyle}
      />
    );
  }

  if (viewState === 'welcome-peek') {
    return (
      <div ref={panelRef}>
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
  unreadCount,
}: GuideCatSidecarProps) {
  const { viewState, toggle, collapse, dismissWelcome } = useGuideCatSidecarState(
    guideCatSidecarSeen,
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
      anchorStyle={anchorStyle}
      surfaceMode={surfaceMode}
    />,
    document.body,
  );
}
