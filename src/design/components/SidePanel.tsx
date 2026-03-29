import { useEffect, useRef, type ReactNode } from 'react';

import { AccordionSection } from './AccordionSection';

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

  const panelClassName = [
    'sidePanel',
    position === 'bottom' ? 'sidePanelBottom' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <aside className={panelClassName} ref={panelRef}>
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
