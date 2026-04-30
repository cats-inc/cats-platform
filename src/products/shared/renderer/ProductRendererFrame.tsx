import type { ComponentType, ReactNode } from 'react';

import {
  ConfirmDialog,
  type ConfirmDialogAction,
  type ConfirmDialogOptions,
} from '../../../design/components/ConfirmDialog.js';
import { useI18n } from '../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';

export type ProductRendererLoadState<TPayload> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

export function ProductAppStateBoundary<TPayload>({
  state,
  BootShell,
  unavailableTitle,
  renderReady,
}: {
  state: ProductRendererLoadState<TPayload>;
  BootShell: ComponentType;
  unavailableTitle: string;
  renderReady: (payload: TPayload) => ReactNode;
}) {
  const { t } = useI18n();

  if (state.status === 'loading') {
    return <BootShell />;
  }

  if (state.status === 'error') {
    return (
      <div className="screen screenCentered">
        <div className="errorPanel">
          <p className="eyebrow">{t(messageKeys.sharedProductRendererErrorEyebrow)}</p>
          <h1>{unavailableTitle}</h1>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  return <>{renderReady(state.payload)}</>;
}

export function ProductRendererShell({
  sidebarOpen,
  sidebar,
  mainContent,
  confirmDialog,
  onConfirmClose,
}: {
  sidebarOpen: boolean;
  sidebar: ReactNode;
  mainContent: ReactNode;
  confirmDialog: { options: ConfirmDialogOptions } | null;
  onConfirmClose: (action: ConfirmDialogAction | boolean) => void;
}) {
  return (
    <div
      className={
        sidebarOpen
          ? 'screen claudeShell'
          : 'screen claudeShell claudeShellSidebarCollapsed'
      }
    >
      {sidebar}
      <main className="canvas">{mainContent}</main>
      <ConfirmDialog dialog={confirmDialog} onClose={onConfirmClose} />
    </div>
  );
}
