import { startTransition } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import { updateAdvancedDraftControlsPreference } from '../../../products/shared/renderer/api/index.js';
import {
  isAdvancedDraftControlsEnabled,
  normalizeAdvancedDraftControlsPreferences,
} from '../../../products/shared/advancedDraftControls.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';
import { ProductAdvancedDraftControlsSection } from './ProductAdvancedDraftControlsSection.js';

export interface PlatformSettingsWorkProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

export function PlatformSettingsWork({
  payload,
  onPayloadUpdate,
}: PlatformSettingsWorkProps) {
  const { toasts, showToast } = useToast();
  const enabled = isAdvancedDraftControlsEnabled(payload.chat.advancedDraftControls, 'work');

  async function updateAdvancedDraftControls(nextEnabled: boolean): Promise<void> {
    const previous = payload.chat.advancedDraftControls;
    const nextControls = normalizeAdvancedDraftControlsPreferences(previous);
    nextControls.work = nextEnabled;
    onPayloadUpdate({
      ...payload,
      chat: {
        ...payload.chat,
        advancedDraftControls: nextControls,
      },
    });
    try {
      const next = await updateAdvancedDraftControlsPreference({ work: nextEnabled });
      startTransition(() => onPayloadUpdate(next));
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        chat: {
          ...payload.chat,
          advancedDraftControls: previous,
        },
      });
      showToast(error instanceof Error ? error.message : 'Failed to update preference');
    }
  }

  return (
    <PlatformSettingsShell section="work" title="Work" products={payload.products}>
      <ProductAdvancedDraftControlsSection
        surface="work"
        enabled={enabled}
        onToggle={(nextEnabled) => {
          void updateAdvancedDraftControls(nextEnabled);
        }}
      />
      <ToastContainer toasts={toasts} />
    </PlatformSettingsShell>
  );
}
