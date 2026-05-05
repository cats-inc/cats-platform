import React, { type ReactElement } from 'react';
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
import { PlatformSettingsNotFound } from './PlatformSettingsNotFound.js';
import { PlatformSettingsRuntime } from './PlatformSettingsRuntime.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';
import { PlatformSettingsWork } from './PlatformSettingsWork.js';
import './platform-settings.css';
import { useI18n } from '../i18n/index.js';
import { type MessageKey } from '../../../shared/i18n/index.js';

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
  translate: (key: MessageKey) => string,
): { section: string; title: string } {
  if (
    pathname === '/settings'
    || pathname === '/settings/'
    || isSettingsSectionPath(pathname, '/settings/general')
  ) {
    return { section: 'general', title: translate('settingsRouteTitleGeneral') };
  }
  if (isSettingsSectionPath(pathname, '/settings/assistants')) {
    return { section: 'assistants', title: translate('settingsRouteTitleAssistants') };
  }
  if (isCatsSettingsSectionPath(pathname)) {
    return { section: 'cats', title: translate('settingsRouteTitleMyCats') };
  }
  if (isSettingsSectionPath(pathname, '/settings/chat')) {
    return { section: 'chat', title: translate('settingsRouteTitleChat') };
  }
  if (isSettingsSectionPath(pathname, '/settings/work')) {
    return { section: 'work', title: translate('settingsRouteTitleWork') };
  }
  if (isSettingsSectionPath(pathname, '/settings/code')) {
    return { section: 'code', title: translate('settingsRouteTitleCode') };
  }
  if (isSettingsSectionPath(pathname, '/settings/apps')) {
    return { section: 'apps', title: translate('settingsRouteTitleApps') };
  }
  if (isSettingsSectionPath(pathname, '/settings/desktop')) {
    return { section: 'desktop', title: translate('settingsRouteTitleDesktop') };
  }
  if (isSettingsSectionPath(pathname, '/settings/runtime')) {
    return { section: 'runtime', title: translate('settingsRouteTitleRuntime') };
  }
  if (isSettingsSectionPath(pathname, '/settings/data')) {
    return { section: 'data', title: translate('settingsRouteTitleData') };
  }
  return { section: 'not-found', title: translate('settingsRouteTitleNotFound') };
}

function isSettingsSectionPath(pathname: string, sectionPath: string): boolean {
  return pathname === sectionPath || pathname.startsWith(`${sectionPath}/`);
}

function isCatsSettingsSectionPath(pathname: string): boolean {
  // `/settings/cats` is a temporary holdout while cat creation still
  // lives in Settings. Keep this as an allow-list so removed routes like
  // `/settings/cats/my-cats` and `/settings/cats/assistants` stay gone.
  return pathname === '/settings/cats' || pathname === '/settings/cats/new';
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
        path="assistants"
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
        element={(
          <PlatformSettingsApps
            installedApps={payload.installedApps ?? []}
            onInstalledAppsUpdate={(installedApps) => {
              onWorkspacePayloadUpdate({ ...payload, installedApps });
            }}
          />
        )}
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
      <Route path="*" element={<PlatformSettingsNotFound />} />
    </Routes>
  );
}

export function PlatformSettingsRoutes<TPayload extends WorkspaceAppShellPayload>(
  props: PlatformSettingsRoutesProps<TPayload>,
) {
  const location = useLocation();
  const { t } = useI18n();
  const { section, title } = resolveSettingsSectionConfig(
    location.pathname,
    t,
  );

  return (
    <PlatformSettingsShell section={section} title={title} products={props.payload.products}>
      {buildPlatformSettingsRouteTree(props)}
    </PlatformSettingsShell>
  );
}

export const PlatformSettingsRouteTree = PlatformSettingsRoutes;
