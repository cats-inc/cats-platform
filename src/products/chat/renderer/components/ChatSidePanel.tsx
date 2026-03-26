import { useEffect, useRef, type ReactNode } from 'react';
import { AccordionSection } from '../../../../design/components/AccordionSection';

export interface SidePanelSection {
  id: string;
  title: string;
  badge?: number;
  children: ReactNode;
}

export interface ChatSidePanelProps {
  activeSection: string | null;
  onSectionToggle: (id: string) => void;
  onClose: () => void;
  sections: SidePanelSection[];
  belowBar?: boolean;
}

export function ChatSidePanel({
  activeSection,
  onSectionToggle,
  onClose,
  sections,
  belowBar,
}: ChatSidePanelProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.closest('.sidePanelToggle')) return;
        onClose();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  return (
    <aside className={belowBar ? 'chatSidePanel chatSidePanelBelowBar' : 'chatSidePanel'} ref={panelRef}>
      <div className="chatSidePanelHeader">
        <strong>Inspector</strong>
        <button
          type="button"
          className="chromeButton"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <div className="chatSidePanelBody">
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
