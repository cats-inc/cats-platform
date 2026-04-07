import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

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

function CollapsedPill({
  name,
  avatarColor,
  unreadCount,
  onClick,
}: {
  name: string;
  avatarColor?: string;
  unreadCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="guideCatPill"
      style={avatarColor ? { background: avatarColor } : undefined}
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
}: {
  name: string;
  ownerDisplayName: string;
  avatarColor?: string;
  onAction: (route: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="guideCatPeek">
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
}: {
  name: string;
  ownerDisplayName: string;
  avatarColor?: string;
  onAction: (route: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="guideCatPanel">
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
}: {
  viewState: GuideCatSidecarViewState;
  guideCat: GuideCatRecord;
  ownerDisplayName: string;
  unreadCount: number;
  toggle: () => void;
  collapse: () => void;
  dismissWelcome: () => void;
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

  return createPortal(
    <SidecarContent
      viewState={viewState}
      guideCat={guideCat}
      ownerDisplayName={ownerDisplayName}
      unreadCount={unreadCount}
      toggle={toggle}
      collapse={collapse}
      dismissWelcome={dismissWelcome}
    />,
    document.body,
  );
}
