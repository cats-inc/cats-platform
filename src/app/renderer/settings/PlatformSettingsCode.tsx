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
import { ProductConversationBehaviorSection } from './ProductConversationBehaviorSection.js';

export interface PlatformSettingsCodeProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

export function PlatformSettingsCode({
  payload,
  onPayloadUpdate,
}: PlatformSettingsCodeProps) {
  const { toasts, showToast } = useToast();
  const enabled = isAdvancedDraftControlsEnabled(payload.chat.advancedDraftControls, 'code');

  async function updateAdvancedDraftControls(nextEnabled: boolean): Promise<void> {
    const previous = payload.chat.advancedDraftControls;
    const nextControls = normalizeAdvancedDraftControlsPreferences(previous);
    nextControls.code = nextEnabled;
    onPayloadUpdate({
      ...payload,
      chat: {
        ...payload.chat,
        advancedDraftControls: nextControls,
      },
    });
    try {
      const next = await updateAdvancedDraftControlsPreference({ code: nextEnabled });
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
    <PlatformSettingsShell section="code" title="Code" products={payload.products}>
      <ProductConversationBehaviorSection
        surface="code"
        payload={payload}
        onPayloadUpdate={onPayloadUpdate}
        onError={showToast}
      />
      <ProductAdvancedDraftControlsSection
        surface="code"
        enabled={enabled}
        onToggle={(nextEnabled) => {
          void updateAdvancedDraftControls(nextEnabled);
        }}
      />
      <ToastContainer toasts={toasts} />
    </PlatformSettingsShell>
  );
}
