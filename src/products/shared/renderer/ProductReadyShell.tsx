import type { ReactNode } from 'react';

import type { WorkspaceBusyState } from '../../../shared/workspaceBusy.js';
import { PlatformSettingsRoutes } from '../../../app/renderer/settings/PlatformSettingsRoutes.js';
import type {
  ConfirmDialogAction,
  ConfirmDialogOptions,
} from '../../../design/components/ConfirmDialog.js';
import type { AppShellPayload as WorkspaceAppShellPayload } from '../api/workspaceContracts.js';
import { ProductRendererShell } from './ProductRendererFrame.js';

export interface ProductReadyShellProps<
  TPayload extends WorkspaceAppShellPayload = WorkspaceAppShellPayload,
> {
  payload: TPayload;
  sidebarOpen: boolean;
  sidebar: ReactNode;
  settingsMode: boolean;
  feedback: string;
  busy: WorkspaceBusyState;
  appContent: ReactNode;
  confirmDialog: { options: ConfirmDialogOptions } | null;
  onPayloadUpdate: (payload: TPayload) => void;
  onFeedback: (message: string) => void;
  onBusy: (busy: WorkspaceBusyState) => void;
  onResetSetup: () => void;
  onConfirmClose: (action: ConfirmDialogAction | boolean) => void;
}

export function ProductReadyShell<TPayload extends WorkspaceAppShellPayload>({
  payload,
  sidebarOpen,
  sidebar,
  settingsMode,
  feedback,
  busy,
  appContent,
  confirmDialog,
  onPayloadUpdate,
  onFeedback,
  onBusy,
  onResetSetup,
  onConfirmClose,
}: ProductReadyShellProps<TPayload>) {
  return (
    <ProductRendererShell
      sidebarOpen={sidebarOpen}
      sidebar={sidebar}
      mainContent={settingsMode ? (
        <PlatformSettingsRoutes
          payload={payload}
          onPayloadUpdate={onPayloadUpdate}
          feedback={feedback}
          busy={busy}
          onFeedback={onFeedback}
          onBusy={onBusy}
          onResetSetup={onResetSetup}
        />
      ) : appContent}
      confirmDialog={confirmDialog}
      onConfirmClose={onConfirmClose}
    />
  );
}
