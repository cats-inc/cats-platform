/**
 * Guide Cat placement reads the DOM to decide how much of the viewport is
 * currently blocked by a docked side panel, so the floating pill can be
 * clamped out of the panel's real estate.
 *
 * DOM contract consumed here:
 *   - An element that occupies right-edge workspace real estate SHOULD carry
 *     `data-side-panel-position="side"`. Bottom-mounted panels use
 *     `data-side-panel-position="bottom"` (or omit the attribute entirely)
 *     and are intentionally ignored — they do not collide with the pill.
 *   - An element MAY carry `data-side-panel-pinned="true"` to declare that
 *     it does NOT self-dismiss on outside click. Callers that pre-clear the
 *     blocked region on pill pointerdown use `pinnedOnly: true` so pinned
 *     panels remain in the predicted safe area while dismissible panels
 *     (which the outside-click simulation will close) drop out.
 *
 * Any new surface that permanently consumes right-edge space MUST declare
 * the position attribute, otherwise the guide cat will happily overlap it.
 */

export interface ReadSidePanelRightBlockedLeftOptions {
  /** When true, only panels marked as pinned
   * (`data-side-panel-pinned="true"`) contribute to the result. Used at
   * pill pointerdown to predict the post-dismissal safe area: dismissible
   * panels will close as a side effect of the interaction and should not
   * hold back the pill; pinned panels persist and must still be avoided. */
  pinnedOnly?: boolean;
}

/** Return the leftmost x of visible side-position panels in the document,
 * or null when no such panel is currently laid out. */
export function readSidePanelRightBlockedLeft(
  doc: Document,
  opts: ReadSidePanelRightBlockedLeftOptions = {},
): number | null {
  const selector = opts.pinnedOnly
    ? '[data-side-panel-position="side"][data-side-panel-pinned="true"]'
    : '[data-side-panel-position="side"]';
  const panels = Array.from(doc.querySelectorAll<HTMLElement>(selector));
  const left = panels
    .filter((panel) => isPanelEffectivelyVisible(panel))
    .map((panel) => panel.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .reduce<number | null>(
      (current, rect) => (current == null ? rect.left : Math.min(current, rect.left)),
      null,
    );
  return left == null ? null : Math.round(left);
}

/** True when the panel is painted and occupies its own pixels. Prefers the
 * native `checkVisibility` (covers display / visibility / opacity /
 * content-visibility in a single call) and falls back to a computed-style
 * read so we do not treat a transitioning or aria-hidden panel as blocking. */
export function isPanelEffectivelyVisible(panel: HTMLElement): boolean {
  const maybeCheck = (panel as unknown as {
    checkVisibility?: (opts?: {
      checkOpacity?: boolean;
      checkVisibilityCSS?: boolean;
      contentVisibilityAuto?: boolean;
    }) => boolean;
  }).checkVisibility;
  if (typeof maybeCheck === 'function') {
    try {
      return maybeCheck.call(panel, {
        checkOpacity: true,
        checkVisibilityCSS: true,
        contentVisibilityAuto: true,
      });
    } catch {
      /* fall through to the manual computed-style check */
    }
  }
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return true;
  }
  const style = window.getComputedStyle(panel);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  const opacity = Number(style.opacity);
  if (Number.isFinite(opacity) && opacity === 0) {
    return false;
  }
  return true;
}
