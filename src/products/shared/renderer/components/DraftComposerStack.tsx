import type { ReactNode } from 'react';

export interface DraftComposerStackProps {
  card: ReactNode;
  footer?: ReactNode;
  helperRegion?: ReactNode;
  shadowStack?: ReactNode;
}

export function DraftComposerStack({
  card,
  footer = null,
  helperRegion = null,
  shadowStack = null,
}: DraftComposerStackProps) {
  return (
    <div className="draftComposerStack">
      {card}
      {shadowStack}
      {footer}
      {helperRegion}
    </div>
  );
}
