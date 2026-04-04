import { useCallback, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ConfirmDialog, useConfirmDialog } from '../../../design/components/ConfirmDialog.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import { PlatformSettingsData } from './PlatformSettingsData.js';
import { PlatformSettingsGeneral } from './PlatformSettingsGeneral.js';
import { PlatformSettingsRuntime } from './PlatformSettingsRuntime.js';
import './platform-settings.css';

export interface PlatformSettingsRoutesProps {
  envelope: PlatformHostEnvelope;
  onEnvelopeUpdate: (updater: (current: PlatformHostEnvelope) => PlatformHostEnvelope) => void;
}

interface PlatformSettingsRouteTreeProps extends PlatformSettingsRoutesProps {
  feedback: string;
  busy: string;
  onFeedback: (message: string) => void;
  onResetSetup: () => void;
}

export function PlatformSettingsRouteTree({
  envelope,
  onEnvelopeUpdate,
  feedback,
  busy,
  onFeedback,
  onResetSetup,
}: PlatformSettingsRouteTreeProps) {
  return (
    <Routes>
      <Route index element={<Navigate to="/settings/general" replace />} />
      <Route
        path="general"
        element={
          <PlatformSettingsGeneral
            envelope={envelope}
            feedback={feedback}
            onEnvelopeUpdate={onEnvelopeUpdate}
            onFeedback={onFeedback}
          />
        }
      />
      <Route
        path="runtime"
        element={<PlatformSettingsRuntime envelope={envelope} />}
      />
      <Route
        path="data"
        element={
          <PlatformSettingsData
            products={envelope.products}
            feedback={feedback}
            busy={busy}
            onResetSetup={onResetSetup}
          />
        }
      />
      <Route path="cats" element={<Navigate to="/chat/settings/cats" replace />} />
      <Route path="*" element={<Navigate to="/settings/general" replace />} />
    </Routes>
  );
}

export function PlatformSettingsRoutes({
  envelope,
  onEnvelopeUpdate,
}: PlatformSettingsRoutesProps) {
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState('');
  const { dialog, confirm, handleClose } = useConfirmDialog();

  const onResetSetup = useCallback(async (): Promise<void> => {
    const confirmed = await confirm({
      title: 'Reset all data',
      message: 'This will erase all chats, cats, and platform settings. Continue?',
      confirmLabel: 'Reset',
    });
    if (!confirmed) {
      return;
    }

    setBusy('setup:reset');
    setFeedback('');
    try {
      const response = await fetch('/api/setup/reset', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Failed to reset setup.');
      }
      window.location.href = '/';
    } catch (error) {
      setBusy('');
      setFeedback(error instanceof Error ? error.message : 'Failed to reset setup.');
    }
  }, [confirm]);

  return (
    <>
      <PlatformSettingsRouteTree
        envelope={envelope}
        onEnvelopeUpdate={onEnvelopeUpdate}
        feedback={feedback}
        busy={busy}
        onFeedback={setFeedback}
        onResetSetup={() => void onResetSetup()}
      />
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
    </>
  );
}
