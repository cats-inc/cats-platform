import { useEffect } from 'react';

/**
 * Watches for mousedown events while a sidebar overflow popover (the
 * "..." menu opened from a row in MY CATS or from a Recent channel
 * row) is open, and clears the open-id when the click lands outside
 * both the popover itself and the row's overflow trigger button.
 *
 * Mirrors the original outside-click logic in
 * `src/products/shared/renderer/hooks/useAppChrome.ts` (which Chat /
 * Code / Work consume) — extracted so the Lobby drill-down sidebar,
 * which doesn't go through `useAppChrome`, can plug into the same
 * dismiss behaviour without repeating the DOM query / handler glue.
 *
 * Looks for menus and triggers by class name rather than by ref
 * because the popover can portal anywhere in the document tree (see
 * `SidebarFloatingMenuPortal`), so a single ref to the trigger isn't
 * enough.
 */
export function useSidebarOverflowMenuDismiss(
  overflowMenuOpenId: string | null,
  setOverflowMenuOpenId: (id: string | null) => void,
): void {
  useEffect(() => {
    if (!overflowMenuOpenId) {
      return undefined;
    }
    function handleMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const menu =
        document.querySelector('.myCatOverflowMenu')
        ?? document.querySelector('.recentOverflowMenu');
      const trigger = target.closest(
        '.myCatOverflowButton, .recentOverflowButton',
      );
      if (menu?.contains(target) || trigger) {
        return;
      }
      setOverflowMenuOpenId(null);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [overflowMenuOpenId, setOverflowMenuOpenId]);
}
