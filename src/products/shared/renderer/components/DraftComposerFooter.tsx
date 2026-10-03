import type { ReactNode } from 'react';

export interface DraftComposerFooterProps {
  accessory?: ReactNode;
}

/**
 * Footer row under the draft composer card for a product-supplied
 * accessory. +compare lives in the carousel's last-branch slot, so the
 * footer renders nothing without an accessory.
 */
export function DraftComposerFooter({ accessory = null }: DraftComposerFooterProps) {
  if (!accessory) {
    return null;
  }

  return (
    <div className="composerFooterRow">
      <div className="composerFooterAccessory">{accessory}</div>
    </div>
  );
}
