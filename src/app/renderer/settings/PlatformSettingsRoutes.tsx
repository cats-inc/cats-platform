import { Navigate, Route, Routes } from 'react-router-dom';

import type { AppShellPayload } from '../../../products/chat/api/contracts.js';
import { SettingsCats } from '../../../products/chat/renderer/components/settings-cats/SettingsCats.js';
import { SettingsAssistants } from './SettingsAssistants.js';
import { PlatformSettingsChat } from './PlatformSettingsChat.js';
import { PlatformSettingsData } from './PlatformSettingsData.js';
import { PlatformSettingsGeneral } from './PlatformSettingsGeneral.js';
import { PlatformSettingsProductPlaceholder } from './PlatformSettingsProductPlaceholder.js';
import { PlatformSettingsRuntime } from './PlatformSettingsRuntime.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';
import './platform-settings.css';

export interface PlatformSettingsRoutesProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  feedback: string;
  busy: string;
  onFeedback: (message: string) => void;
  onBusy: (key: string) => void;
  onResetSetup: () => void;
}

export function PlatformSettingsRoutes({
  payload,
  onPayloadUpdate,
  feedback,
  busy,
  onFeedback,
  onBusy,
  onResetSetup,
}: PlatformSettingsRoutesProps) {
  const workProduct = payload.products.find((product) => product.id === 'work');
  const codeProduct = payload.products.find((product) => product.id === 'code');

  return (
    <Routes>
      <Route index element={<Navigate to="/settings/general" replace />} />
      <Route
        path="general"
        element={(
          <PlatformSettingsGeneral
            payload={payload}
            feedback={feedback}
            onPayloadUpdate={onPayloadUpdate}
            onFeedback={onFeedback}
          />
        )}
      />
      <Route path="cats" element={<Navigate to="/settings/cats/my-cats" replace />} />
      <Route
        path="cats/my-cats"
        element={(
          <PlatformSettingsShell section="cats:my-cats" title="My Cats" products={payload.products}>
            <SettingsCats
              payload={payload}
              feedback={feedback}
              busy={busy}
              onPayloadUpdate={onPayloadUpdate}
              onFeedback={onFeedback}
              onBusy={onBusy}
            />
          </PlatformSettingsShell>
        )}
      />
      <Route
        path="cats/assistants"
        element={(
          <PlatformSettingsShell section="cats:assistants" title="Assistants" products={payload.products}>
            <SettingsAssistants
              payload={payload}
              onPayloadUpdate={onPayloadUpdate}
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
            onPayloadUpdate={onPayloadUpdate}
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
