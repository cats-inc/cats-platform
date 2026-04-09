import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';

export function useFloatingSidebarMenu(
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  open: boolean,
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined);
      return undefined;
    }

    function updatePosition(): void {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? 136;
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      let left = rect.right + 8;
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, rect.left - menuWidth - 8);
      }
      let top = rect.top - 4;
      if (menuHeight > 0 && top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - menuHeight - 8);
      }
      setStyle({
        position: 'fixed',
        top,
        left,
      });
    }

    updatePosition();

    const scrollParent = anchorRef.current?.closest('.sidebarScrollable');
    window.addEventListener('resize', updatePosition);
    scrollParent?.addEventListener('scroll', updatePosition, { passive: true });

    return () => {
      window.removeEventListener('resize', updatePosition);
      scrollParent?.removeEventListener('scroll', updatePosition);
    };
  }, [anchorRef, menuRef, open]);

  if (!open) {
    return undefined;
  }

  return style ?? {
    position: 'fixed',
    top: 0,
    left: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
  };
}
