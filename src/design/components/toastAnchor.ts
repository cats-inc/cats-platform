import { useCallback, useRef, type RefCallback } from 'react';

/**
 * Where toasts sit while a conversation composer is on screen: just above it and centered on it, instead of
 * 24 px from the bottom of the window, where an `error` toast (which stays until closed) covered the
 * composer's buttons. The composer registers itself with `useToastAnchor`; `.toastContainer` reads the
 * `--toast-anchor-bottom` and `--toast-anchor-x` properties this sets on the document element. With no
 * composer on screen they are removed and toasts fall back to the bottom of the window.
 */

export const TOAST_ANCHOR_GAP_PX = 12;

export interface ToastAnchor {
  /** Distance from the bottom of the viewport to the bottom of the toasts. */
  bottom: number;
  /** Horizontal center of the toasts. */
  x: number;
}

/** Where toasts go above `rect`, or null when the element is hidden or off screen. */
export function resolveToastAnchor(
  rect: { top: number; left: number; width: number; height: number },
  viewport: { height: number },
  gap = TOAST_ANCHOR_GAP_PX,
): ToastAnchor | null {
  if (rect.width === 0 || rect.height === 0 || rect.top < 0 || rect.top > viewport.height) return null;
  return { bottom: Math.round(viewport.height - rect.top + gap), x: Math.round(rect.left + rect.width / 2) };
}

const anchors: HTMLElement[] = [];
let observer: ResizeObserver | null = null;
let frame = 0;

function apply(): void {
  frame = 0;
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  const element = anchors[anchors.length - 1];
  const anchor = element?.isConnected
    ? resolveToastAnchor(element.getBoundingClientRect(), { height: window.innerHeight })
    : null;
  if (anchor) {
    style.setProperty('--toast-anchor-bottom', `${anchor.bottom}px`);
    style.setProperty('--toast-anchor-x', `${anchor.x}px`);
  } else {
    style.removeProperty('--toast-anchor-bottom');
    style.removeProperty('--toast-anchor-x');
  }
}

function schedule(): void {
  if (typeof requestAnimationFrame !== 'function') {
    apply();
    return;
  }
  // A frame that never runs (one a stub swallows, or one left by a page that has gone) must not block every
  // later update, so a pending frame is replaced rather than trusted. Still at most one update per frame.
  if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  frame = requestAnimationFrame(apply);
}

function register(element: HTMLElement): void {
  anchors.push(element);
  if (anchors.length === 1) {
    window.addEventListener('resize', schedule);
    // The composer moves when the conversation scrolls; capture catches scrolling in any container.
    window.addEventListener('scroll', schedule, true);
  }
  if (!observer && typeof ResizeObserver === 'function') observer = new ResizeObserver(schedule);
  observer?.observe(element);
  schedule();
}

function unregister(element: HTMLElement): void {
  const index = anchors.lastIndexOf(element);
  if (index >= 0) anchors.splice(index, 1);
  observer?.unobserve(element);
  if (anchors.length === 0) {
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
  }
  schedule();
}

/** A ref for the composer that toasts should sit above; the most recently mounted one wins. */
export function useToastAnchor<T extends HTMLElement>(): RefCallback<T> {
  const current = useRef<T | null>(null);
  return useCallback((element: T | null) => {
    if (current.current === element) return;
    if (current.current) unregister(current.current);
    current.current = element;
    if (element) register(element);
  }, []);
}
