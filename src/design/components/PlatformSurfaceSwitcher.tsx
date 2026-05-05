import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import {
  listPlatformSurfaceDescriptors,
  platformSurfaceProductName,
} from '../../core/platformSurface.js';
import {
  resolvePlatformProductDisplayNameById,
  resolvePlatformProductSubtitleById,
} from '../../app/renderer/platformProductCopy.js';
import { useI18n } from '../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../shared/i18n/index.js';
import {
  getPendingPlatformSurfaceMenuStyle,
  resolvePlatformSurfaceMenuStyle,
} from './platformSurfaceMenuPosition.js';

interface PlatformSurfaceSwitcherProps {
  activeSurface: PlatformSurfaceId;
  onSelectSurface: (surface: PlatformSurfaceId) => void;
  /**
   * When set, the trigger button shows this label verbatim and the
   * menu items render without an `isCurrent` highlight. Used by the
   * Entities sidebar so the trigger reads "Cats Directory" while
   * the user is on /entities routes — none of those is a
   * `PlatformSurfaceId`, so we cannot piggy-back on `activeSurface`.
   */
  activeLabelOverride?: string;
}

/**
 * Closes the platform surface menu, then runs the follow-up action.
 *
 * The close MUST commit through `flush` (defaults to React's `flushSync`)
 * before `action` runs. Product switching navigates / unmounts immediately,
 * and without a synchronous flush the portaled menu lingers above the loading
 * surface during the route transition. The injectable `flush` parameter is
 * exposed so tests can verify the close-inside-flush ordering without a full
 * React renderer; production callers always inherit the `flushSync` default.
 */
export function runAfterClosingPlatformSurfaceMenu(
  close: () => void,
  action: () => void,
  flush: (callback: () => void) => void = flushSync,
): void {
  flush(close);
  action();
}

const useIsomorphicLayoutEffect = typeof window === 'undefined'
  ? useEffect
  : useLayoutEffect;

export function PlatformSurfaceSwitcher({
  activeSurface,
  onSelectSurface,
  activeLabelOverride,
}: PlatformSurfaceSwitcherProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const descriptors = useMemo(() => listPlatformSurfaceDescriptors(), []);
  const resolvedActiveSurfaceName = resolvePlatformProductDisplayNameById(
    activeSurface,
    platformSurfaceProductName(activeSurface),
    t,
  );
  const activeProductName = activeLabelOverride ?? resolvedActiveSurfaceName;
  const isOverrideActive = activeLabelOverride !== undefined;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setMenuStyle(undefined);
      return undefined;
    }

    function updatePosition() {
      const trigger = rootRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      setMenuStyle(
        resolvePlatformSurfaceMenuStyle({
          triggerRect: rect,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          menuWidth: menuRef.current?.offsetWidth ?? 0,
          menuHeight: menuRef.current?.offsetHeight ?? 0,
        }),
      );
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const menuContent = open ? (
    <div
      ref={menuRef}
      className="platformSurfaceMenu"
      style={menuStyle ?? getPendingPlatformSurfaceMenuStyle()}
      role="menu"
      aria-label={t(messageKeys.sharedPlatformSurfaceSwitcherMenuLabel)}
    >
      <p className="platformSurfaceMenuHeading">{t(messageKeys.appBrandName)}</p>
      <div className="platformSurfaceMenuList">
        {descriptors.map((descriptor) => {
          const current = !isOverrideActive && descriptor.id === activeSurface;
          const swatchClassName = `platformSurfaceSwatch platformSurfaceSwatch${descriptor.id[0].toUpperCase()}${descriptor.id.slice(1)}`;
          const productName = resolvePlatformProductDisplayNameById(
            descriptor.id,
            descriptor.productName,
            t,
          );
          const subtitle = resolvePlatformProductSubtitleById(
            descriptor.id,
            descriptor.subtitle,
            t,
          );
          return (
            <button
              key={descriptor.id}
              type="button"
              role="menuitemradio"
              aria-checked={current}
              className={current ? 'platformSurfaceMenuItem isCurrent' : 'platformSurfaceMenuItem'}
              onClick={() => {
                runAfterClosingPlatformSurfaceMenu(
                  () => setOpen(false),
                  () => {
                    if (!current) {
                      onSelectSurface(descriptor.id);
                    }
                  },
                );
              }}
            >
              <span className={swatchClassName} aria-hidden="true" />
              <span className="platformSurfaceMenuCopy">
                <span className="platformSurfaceMenuTitleRow">
                  <span className="platformSurfaceMenuTitle">{productName}</span>
                </span>
                <span className="platformSurfaceMenuSubtitle">{subtitle}</span>
              </span>
              {current ? (
                <span className="platformSurfaceMenuCheck" aria-hidden="true">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m2.4 6.3 2.1 2.1 5.1-5.1" />
                  </svg>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="platformSurfaceMenuDivider" />
      <button
        type="button"
        className="platformSurfaceMenuAction"
        onClick={() => {
          runAfterClosingPlatformSurfaceMenu(
            () => setOpen(false),
            () => {
              navigate('/lobby');
            },
          );
        }}
      >
        {t(messageKeys.sharedPlatformSurfaceSwitcherOpenLobby)}
      </button>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="platformSurfaceSwitcher">
      <button
        type="button"
        className={open ? 'platformSurfaceTrigger isOpen' : 'platformSurfaceTrigger'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(messageKeys.sharedPlatformSurfaceSwitcherAriaLabel, {
          productName: activeProductName,
        })}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="platformSurfaceTriggerRow">
          <span className="brandLabel">{activeProductName}</span>
          <svg
            className="platformSurfaceChevron"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </span>
      </button>
      {menuContent && typeof document !== 'undefined'
        ? createPortal(menuContent, document.body)
        : null}
    </div>
  );
}
