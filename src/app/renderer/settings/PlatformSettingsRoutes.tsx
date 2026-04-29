import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import type { AppShellPayload as WorkspaceAppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import type { WorkspaceBusyState } from '../../../shared/workspaceBusy.js';
import { WorkspaceSettingsCatsCanvas } from '../../../products/shared/renderer/components/settings-cats/SettingsCats.js';
import { isDesktopEnvironment } from '../../../shared/desktopRecoveryBridge.js';
import { SettingsAssistants } from './SettingsAssistants.js';
import { PlatformSettingsApps } from './PlatformSettingsApps.js';
import { PlatformSettingsChat } from './PlatformSettingsChat.js';
import { PlatformSettingsCode } from './PlatformSettingsCode.js';
import { PlatformSettingsData } from './PlatformSettingsData.js';
import { PlatformSettingsDesktopStartup } from './PlatformSettingsDesktopStartup.js';
import { PlatformSettingsGeneral } from './PlatformSettingsGeneral.js';
import { PlatformSettingsRuntime } from './PlatformSettingsRuntime.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';
import { PlatformSettingsWork } from './PlatformSettingsWork.js';
import './platform-settings.css';

export interface PlatformSettingsRoutesProps<
  TPayload extends WorkspaceAppShellPayload = WorkspaceAppShellPayload,
> {
  payload: TPayload;
  onPayloadUpdate: (payload: TPayload) => void;
  busy: WorkspaceBusyState;
  onFeedback: (message: string) => void;
  onBusy: (busy: WorkspaceBusyState) => void;
  onResetSetup: () => Promise<void>;
}

export function resolveSettingsSectionConfig(
  pathname: string,
): { section: string; title: string } {
  if (pathname.startsWith('/settings/cats/assistants')) {
    return { section: 'cats:assistants', title: 'Assistants' };
  }
  if (pathname.startsWith('/settings/cats')) {
    return { section: 'cats:my-cats', title: 'My Cats' };
  }
  if (pathname.startsWith('/settings/chat')) {
    return { section: 'chat', title: 'Chat' };
  }
  if (pathname.startsWith('/settings/work')) {
    return { section: 'work', title: 'Work' };
  }
  if (pathname.startsWith('/settings/code')) {
    return { section: 'code', title: 'Code' };
  }
  if (pathname.startsWith('/settings/apps')) {
    return { section: 'apps', title: 'Apps' };
  }
  if (pathname.startsWith('/settings/desktop')) {
    return { section: 'desktop', title: 'Desktop' };
  }
  if (pathname.startsWith('/settings/runtime')) {
    return { section: 'runtime', title: 'Runtime' };
  }
  if (pathname.startsWith('/settings/data')) {
    return { section: 'data', title: 'Data' };
  }
  return { section: 'general', title: 'General' };
}

// Pure builder — deliberately hook-free so route structure tests can call it
// directly without entering a React render context.
export function buildPlatformSettingsRouteTree<TPayload extends WorkspaceAppShellPayload>({
  payload,
  onPayloadUpdate,
  busy,
  onFeedback,
  onBusy,
  onResetSetup,
}: PlatformSettingsRoutesProps<TPayload>): ReactElement {
  const workProduct = payload.products.find((product) => product.id === 'work');
  const codeProduct = payload.products.find((product) => product.id === 'code');
  const showDesktop = isDesktopEnvironment();
  const onWorkspacePayloadUpdate = (nextPayload: WorkspaceAppShellPayload) => {
    onPayloadUpdate(nextPayload as TPayload);
  };
  const catsElement = (
    <WorkspaceSettingsCatsCanvas
      payload={payload}
      busy={busy}
      onPayloadUpdate={onWorkspacePayloadUpdate}
      onFeedback={onFeedback}
      onBusy={onBusy}
    />
  );

  return (
    <Routes>
      <Route index element={<Navigate to="/settings/general" replace />} />
      <Route
        path="general"
        element={(
          <PlatformSettingsGeneral
            payload={payload}
            onPayloadUpdate={onWorkspacePayloadUpdate}
          />
        )}
      />
      <Route path="cats" element={catsElement} />
      <Route path="cats/new" element={catsElement} />
      <Route
        path="cats/my-cats"
        element={<Navigate to="/settings/cats" replace />}
      />
      <Route
        path="cats/assistants"
        element={(
          <SettingsAssistants
            payload={payload}
            onPayloadUpdate={onWorkspacePayloadUpdate}
          />
        )}
      />
      <Route
        path="chat"
        element={(
          <PlatformSettingsChat
            payload={payload}
            onPayloadUpdate={onWorkspacePayloadUpdate}
          />
        )}
      />
      {workProduct ? (
        <Route
          path="work"
          element={(
            <PlatformSettingsWork
              payload={payload}
              onPayloadUpdate={onWorkspacePayloadUpdate}
            />
          )}
        />
      ) : null}
      {codeProduct ? (
        <Route
          path="code"
          element={(
            <PlatformSettingsCode
              payload={payload}
              onPayloadUpdate={onWorkspacePayloadUpdate}
            />
          )}
        />
      ) : null}
      <Route
        path="apps/*"
        element={<PlatformSettingsApps installedApps={payload.installedApps ?? []} />}
      />
      {showDesktop ? (
        <Route
          path="desktop"
          element={(
            <PlatformSettingsDesktopStartup
              payload={payload}
              onPayloadUpdate={onWorkspacePayloadUpdate}
            />
          )}
        />
      ) : null}
      {showDesktop ? (
        <Route path="desktop-startup" element={<Navigate to="/settings/desktop" replace />} />
      ) : null}
      <Route
        path="runtime"
        element={<PlatformSettingsRuntime payload={payload} />}
      />
      <Route
        path="data"
        element={(
          <PlatformSettingsData
            payload={payload}
            busy={busy}
            onResetSetup={onResetSetup}
          />
        )}
      />
      <Route path="*" element={<Navigate to="/settings/general" replace />} />
    </Routes>
  );
}

export function PlatformSettingsRoutes<TPayload extends WorkspaceAppShellPayload>(
  props: PlatformSettingsRoutesProps<TPayload>,
) {
  const location = useLocation();
  const { section, title } = resolveSettingsSectionConfig(location.pathname);

  return (
    <PlatformSettingsShell section={section} title={title} products={props.payload.products}>
      {buildPlatformSettingsRouteTree(props)}
    </PlatformSettingsShell>
  );
}

export const PlatformSettingsRouteTree = PlatformSettingsRoutes;
