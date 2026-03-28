import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { SuiteSurfaceId } from '../../shared/suite-contract.js';
import { isEnabledSuiteSurface } from '../../shared/suiteSurfaces.js';
import {
  listSuiteSurfaceDescriptors,
  suiteSurfaceProductName,
} from '../../core/suiteSurface.js';

interface SuiteSurfaceSwitcherProps {
  activeSurface: SuiteSurfaceId;
  onSelectSurface: (surface: SuiteSurfaceId) => void;
}

export function SuiteSurfaceSwitcher({
  activeSurface,
  onSelectSurface,
}: SuiteSurfaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const descriptors = useMemo(
    () =>
      listSuiteSurfaceDescriptors().map((descriptor) => ({
        ...descriptor,
        enabled: isEnabledSuiteSurface(descriptor.id),
      })),
    [],
  );

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

  useEffect(() => {
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
      const viewportPadding = 12;
      const fallbackWidth = 420;
      const resolvedWidth = Math.min(
        fallbackWidth,
        window.innerWidth - viewportPadding * 2,
      );
      const menuWidth = menuRef.current?.offsetWidth ?? resolvedWidth;
      const menuHeight = menuRef.current?.offsetHeight ?? 0;

      let left = rect.left;
      if (left + menuWidth > window.innerWidth - viewportPadding) {
        left = Math.max(
          viewportPadding,
          window.innerWidth - menuWidth - viewportPadding,
        );
      }

      let top = rect.bottom + 8;
      if (menuHeight > 0 && top + menuHeight > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, rect.top - menuHeight - 8);
      }

      setMenuStyle({
        position: 'fixed',
        top,
        left,
        width: resolvedWidth,
      });
    }

    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const menuContent = open ? (
    <div
      ref={menuRef}
      className="suiteSurfaceMenu"
      style={menuStyle}
      role="menu"
      aria-label="Switch product"
    >
      <p className="suiteSurfaceMenuHeading">CATS INC</p>
      <div className="suiteSurfaceMenuList">
        {descriptors.map((descriptor) => {
          const current = descriptor.id === activeSurface;
          const swatchClassName = `suiteSurfaceSwatch suiteSurfaceSwatch${descriptor.id[0].toUpperCase()}${descriptor.id.slice(1)}`;
          return (
            <button
              key={descriptor.id}
              type="button"
              role="menuitemradio"
              aria-checked={current}
              className={current ? 'suiteSurfaceMenuItem isCurrent' : 'suiteSurfaceMenuItem'}
              onClick={() => {
                setOpen(false);
                if (!current) {
                  onSelectSurface(descriptor.id);
                }
              }}
            >
              <span className={swatchClassName} aria-hidden="true" />
              <span className="suiteSurfaceMenuCopy">
                <span className="suiteSurfaceMenuTitleRow">
                  <span className="suiteSurfaceMenuTitle">{descriptor.productName}</span>
                  {!descriptor.enabled ? (
                    <span className="suiteSurfaceMenuBadge">Preview</span>
                  ) : null}
                </span>
                <span className="suiteSurfaceMenuSubtitle">{descriptor.subtitle}</span>
              </span>
              {current ? (
                <span className="suiteSurfaceMenuCheck" aria-hidden="true">
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
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="suiteSurfaceSwitcher">
      <button
        type="button"
        className={open ? 'suiteSurfaceTrigger isOpen' : 'suiteSurfaceTrigger'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch product. Current product is ${suiteSurfaceProductName(activeSurface)}.`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="suiteSurfaceTriggerRow">
          <span className="brandLabel">{suiteSurfaceProductName(activeSurface)}</span>
          <svg
            className="suiteSurfaceChevron"
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
