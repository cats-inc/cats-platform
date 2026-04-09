import { Navigate, Route, Routes } from 'react-router-dom';

import type { AppShellPayload as WorkspaceAppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { WorkspaceSettingsCats } from '../../../products/shared/renderer/components/settings-cats/SettingsCats.js';
import { SettingsAssistants } from './SettingsAssistants.js';
import { PlatformSettingsChat } from './PlatformSettingsChat.js';
import { PlatformSettingsData } from './PlatformSettingsData.js';
import { PlatformSettingsGeneral } from './PlatformSettingsGeneral.js';
import { PlatformSettingsProductPlaceholder } from './PlatformSettingsProductPlaceholder.js';
import { PlatformSettingsRuntime } from './PlatformSettingsRuntime.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';
import './platform-settings.css';

export interface PlatformSettingsRoutesProps<
  TPayload extends WorkspaceAppShellPayload = WorkspaceAppShellPayload,
> {
  payload: TPayload;
  onPayloadUpdate: (payload: TPayload) => void;
  feedback: string;
  busy: string;
  onFeedback: (message: string) => void;
  onBusy: (key: string) => void;
  onResetSetup: () => void;
}

export function PlatformSettingsRoutes<TPayload extends WorkspaceAppShellPayload>({
  payload,
  onPayloadUpdate,
  feedback,
  busy,
  onFeedback,
  onBusy,
  onResetSetup,
}: PlatformSettingsRoutesProps<TPayload>) {
  const workProduct = payload.products.find((product) => product.id === 'work');
  const codeProduct = payload.products.find((product) => product.id === 'code');
  const onWorkspacePayloadUpdate = (nextPayload: WorkspaceAppShellPayload) => {
    onPayloadUpdate(nextPayload as TPayload);
  };
  const catsElement = (
    <PlatformSettingsShell section="cats:my-cats" title="My Cats" products={payload.products}>
      <WorkspaceSettingsCats
        payload={payload}
        feedback={feedback}
        busy={busy}
        onPayloadUpdate={onWorkspacePayloadUpdate}
        onFeedback={onFeedback}
        onBusy={onBusy}
      />
    </PlatformSettingsShell>
  );

  return (
    <Routes>
      <Route index element={<Navigate to="/settings/general" replace />} />
      <Route
        path="general"
        element={(
          <PlatformSettingsGeneral
            payload={payload}
            feedback={feedback}
            onPayloadUpdate={onWorkspacePayloadUpdate}
            onFeedback={onFeedback}
          />
        )}
      />
      <Route path="cats" element={catsElement} />
      <Route
        path="cats/my-cats"
        element={<Navigate to="/settings/cats" replace />}
      />
      <Route
        path="cats/assistants"
        element={(
          <PlatformSettingsShell section="cats:assistants" title="Assistants" products={payload.products}>
            <SettingsAssistants
              payload={payload}
              onPayloadUpdate={onWorkspacePayloadUpdate}
            />
          </PlatformSettingsShell>
        )}
      />
      <Route
        path="chat"
        element={(
          <PlatformSettingsChat
            payload={payload}
            feedback={feedback}
            onPayloadUpdate={onWorkspacePayloadUpdate}
            onFeedback={onFeedback}
          />
        )}
      />
      {workProduct ? (
        <Route
          path="work"
          element={(
            <PlatformSettingsProductPlaceholder
              productId="work"
              products={payload.products}
              title="Work"
              subtitle={`${workProduct.productName} settings will land here as product-owned sections.`}
            />
          )}
        />
      ) : null}
      {codeProduct ? (
        <Route
          path="code"
          element={(
            <PlatformSettingsProductPlaceholder
              productId="code"
              products={payload.products}
              title="Code"
              subtitle={`${codeProduct.productName} settings will land here as product-owned sections.`}
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
            feedback={feedback}
            busy={busy}
            onResetSetup={onResetSetup}
          />
        )}
      />
      <Route path="*" element={<Navigate to="/settings/general" replace />} />
    </Routes>
  );
}

export const PlatformSettingsRouteTree = PlatformSettingsRoutes;
