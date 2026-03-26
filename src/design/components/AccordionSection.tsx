import type { ReactNode } from 'react';

export interface AccordionSectionProps {
  id: string;
  title: string;
  badge?: number;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}

export function AccordionSection({
  id,
  title,
  badge,
  isOpen,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <div className="accordionSection">
      <button
        type="button"
        className="accordionHeader"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
      >
        <span className="accordionHeaderTitle">{title}</span>
        {badge != null && badge > 0 ? (
          <span className="accordionBadge">{badge}</span>
        ) : null}
        <svg
          className={isOpen ? 'accordionChevron accordionChevronOpen' : 'accordionChevron'}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 2.5 8 6 4.5 9.5" />
        </svg>
      </button>
      {isOpen ? (
        <div className="accordionBody">{children}</div>
      ) : null}
    </div>
  );
}
