import type { ComponentType, ReactNode } from 'react';

import { ConfirmDialog, type ConfirmDialogOptions } from '../../../design/components/ConfirmDialog.js';

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
  if (state.status === 'loading') {
    return <BootShell />;
  }

  if (state.status === 'error') {
    return (
      <div className="screen screenCentered">
        <div className="errorPanel">
          <p className="eyebrow">Renderer Error</p>
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
  onConfirmClose: (confirmed: boolean) => void;
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
