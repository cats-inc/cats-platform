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
  if (!text) {
    return;
  }

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  const element = getPortal();
  element.textContent = text;
  element.classList.add('tooltipVisible');

  const rect = target.getBoundingClientRect();
  const pad = 6;

  element.style.left = `${rect.left + rect.width / 2}px`;
  element.style.top = `${rect.top - pad}px`;
  element.style.transform = 'translate(-50%, -100%)';

  const firstRect = element.getBoundingClientRect();
  if (firstRect.top < 4) {
    element.style.top = `${rect.bottom + pad}px`;
    element.style.transform = 'translate(-50%, 0)';
  }

  const secondRect = element.getBoundingClientRect();
  if (secondRect.right > window.innerWidth - 4) {
    element.style.left = `${window.innerWidth - 4}px`;
    element.style.transform = firstRect.top < 4
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
    if (target) {
      show(target);
    }
  }

  function onOut(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest?.('[data-tooltip]') as HTMLElement | null;
    if (target) {
      hide();
    }
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
