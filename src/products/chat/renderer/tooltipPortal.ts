let portal: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

function getPortal(): HTMLDivElement {
  if (!portal) {
    portal = document.createElement('div');
    portal.className = 'tooltipPortal';
    document.body.appendChild(portal);
  }
  return portal;
}

function cancelPendingShow(): void {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
}

function resolveShowDelay(target: HTMLElement): number {
  const attr = target.getAttribute('data-tooltip-delay');
  if (!attr) return 0;
  const parsed = Number(attr);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function paint(target: HTMLElement, text: string): void {
  const el = getPortal();
  el.textContent = text;
  el.classList.add('tooltipVisible');

  const rect = target.getBoundingClientRect();
  const pad = 6;

  // Position above the element, centered horizontally
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top - pad}px`;
  el.style.transform = 'translate(-50%, -100%)';

  // Clamp: if tooltip goes above viewport, show below instead
  const elRect = el.getBoundingClientRect();
  if (elRect.top < 4) {
    el.style.top = `${rect.bottom + pad}px`;
    el.style.transform = 'translate(-50%, 0)';
  }

  // Clamp: if tooltip goes past right edge, shift left
  const elRect2 = el.getBoundingClientRect();
  if (elRect2.right > window.innerWidth - 4) {
    el.style.left = `${window.innerWidth - 4}px`;
    el.style.transform = elRect.top < 4
      ? 'translate(-100%, 0)'
      : 'translate(-100%, -100%)';
  }
}

function show(target: HTMLElement): void {
  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  cancelPendingShow();

  const delay = resolveShowDelay(target);
  if (delay > 0) {
    showTimer = setTimeout(() => {
      showTimer = null;
      // Re-check the text in case it changed while we waited.
      const liveText = target.getAttribute('data-tooltip');
      if (liveText) paint(target, liveText);
    }, delay);
    return;
  }

  paint(target, text);
}

function hide(): void {
  cancelPendingShow();
  hideTimer = setTimeout(() => {
    getPortal().classList.remove('tooltipVisible');
  }, 50);
}

function hideImmediately(): void {
  cancelPendingShow();
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  if (portal) {
    portal.classList.remove('tooltipVisible');
  }
}

/** Cancel any pending delayed show and hide the tooltip immediately. Exposed
 *  so external UI (e.g. the guide-cat drag engine) can reliably dismiss a
 *  tooltip that was scheduled before an interaction started. */
export function hideTooltipPortal(): void {
  hideImmediately();
}

export function initTooltipPortal(): () => void {
  function onOver(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest?.('[data-tooltip]') as HTMLElement | null;
    if (target) show(target);
  }

  function onOut(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest?.('[data-tooltip]') as HTMLElement | null;
    if (target) hide();
  }

  function onClick(): void {
    hideImmediately();
  }

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mouseout', onOut, true);
  document.addEventListener('click', onClick, true);

  return () => {
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('mouseout', onOut, true);
    document.removeEventListener('click', onClick, true);
    if (portal) {
      portal.remove();
      portal = null;
    }
  };
}
