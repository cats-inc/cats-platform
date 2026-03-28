let portal: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function getPortal(): HTMLDivElement {
  if (!portal) {
    portal = document.createElement('div');
    portal.className = 'tooltipPortal';
    document.body.appendChild(portal);
  }
  return portal;
}

function show(target: HTMLElement): void {
  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

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

function hide(): void {
  hideTimer = setTimeout(() => {
    getPortal().classList.remove('tooltipVisible');
  }, 50);
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

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mouseout', onOut, true);

  return () => {
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('mouseout', onOut, true);
    if (portal) {
      portal.remove();
      portal = null;
    }
  };
}
