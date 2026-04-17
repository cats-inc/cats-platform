import { useEffect, useRef, type ReactNode } from 'react';

import { AccordionSection } from './AccordionSection';

export const SIDE_PANEL_LAYOUT_EVENT = 'cats:side-panel-layout-change';

export interface SidePanelSection {
  id: string;
  title: string;
  badge?: number;
  children: ReactNode;
}

export interface SidePanelProps {
  title: string;
  activeSection: string | null;
  onSectionToggle: (id: string) => void;
  onClose: () => void;
  sections: SidePanelSection[];
  className?: string;
  position?: 'side' | 'bottom';
}

export function SidePanel({
  title,
  activeSection,
  onSectionToggle,
  onClose,
  sections,
  className = '',
  position = 'side',
}: SidePanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const panelClassName = [
    'sidePanel',
    position === 'bottom' ? 'sidePanelBottom' : '',
    className,
  ].filter(Boolean).join(' ');

  useEffect(() => {
    function onClickOutside(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.closest('.sidePanelToggle')) {
          return;
        }
        onClose();
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown as never);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown as never);
    };
  }, [onClose]);

  const panelPosition = position === 'bottom' ? 'bottom' : 'side';

  useEffect(() => {
    dispatchSidePanelLayoutEvent();
    return () => {
      dispatchSidePanelLayoutEvent();
    };
  }, [panelClassName, panelPosition]);

  return (
    <aside
      className={panelClassName}
      ref={panelRef}
      data-side-panel-position={panelPosition}
    >
      <div className="sidePanelHeader">
        <strong>{title}</strong>
        <button
          type="button"
          className="chromeButton"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <div className="sidePanelBody">
        {sections.map((section) => (
          <AccordionSection
            key={section.id}
            id={section.id}
            title={section.title}
            badge={section.badge}
            isOpen={activeSection === section.id}
            onToggle={onSectionToggle}
          >
            {section.children}
          </AccordionSection>
        ))}
      </div>
    </aside>
  );
}

function dispatchSidePanelLayoutEvent(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(SIDE_PANEL_LAYOUT_EVENT));
}
